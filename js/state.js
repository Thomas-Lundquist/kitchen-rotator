// --- STATE: shape, migration, persistence ---

const MAX_KITCHEN = 5;      // hard cap — seat rows per kitchen, never exceeded
const TARGET_KITCHEN_SIZE = 4; // ideal students per kitchen when importing
const NUM_KITCHENS = 8;

const INITIAL_BLOCKS = [
  {id:'A1', day:'A', course:2}, {id:'A2', day:'A', course:1}, {id:'A3', day:'A', course:1},
  {id:'B1', day:'B', course:1}, {id:'B2', day:'B', course:1}, {id:'B3', day:'B', course:2}
];
// course:1 = Culinary 1 styling, 2 = Culinary 2 styling (just visual accent; edit freely per block)
// "id" is a block's permanent internal identity — its roster, duty pool,
// and duty-applicability checkboxes always stay attached to this id.
//
// state.slots.A / state.slots.B are FIXED-LENGTH-4 arrays (one entry per
// physical time block of the day, matching the bell schedule) holding
// either a block id or null. null means that period is a prep period /
// unused that day — not every day needs all 4 filled, and which ones are
// filled can change freely (a prep period moving at semester, selling a
// period, etc.) without any fixed assumption about which 3 are "the" ones.
// state.nextNum tracks the next never-used number per day for naming newly
// created classes; it never reuses a number even after a class is removed.

const STORAGE_KEY = 'kitchenRotationTool_v1';

const DEFAULT_JOB_TITLES = ['Manager', 'Head Chef', 'Sous Chef', 'Kitchen Porter', 'Dishwasher'];
const OLD_DEFAULT_JOB_TITLES = ['Head Chef', 'Sous Chef', 'Prep Cook', 'Dishwasher', 'Cleanup Crew'];

// Assigned by main.js, not here: loading runs normalizeState, which calls into
// seats.js and util.js, and those are not defined until their scripts load.
let state;

function allBlockIds(){ return [...state.slots.A, ...state.slots.B].filter(Boolean); }

// The label the teacher sees on a block's card: its day and the period it
// currently sits in, e.g. "A2". Not the id — a class moved from the first
// period to the second keeps id A1 but is shown, and spoken of, as A2.
function blockLabel(blockId){
  const day = state.blocks[blockId].day;
  return day + (state.slots[day].indexOf(blockId) + 1);
}

function emptyKitchen(){ return { students: [], original: [] }; }
function emptyAbsentGrid(){ return Array.from({length:NUM_KITCHENS}, ()=>Array(MAX_KITCHEN).fill(false)); }

function blankBlock(day, course){
  return {
    day, course,
    className: course===2 ? 'Culinary 2' : 'Culinary 1',
    kitchens: Array.from({length:NUM_KITCHENS}, emptyKitchen),
    dutyIndex: 0, centerSink: 0,
    // Who is out today, indexed [kitchen][stored seat]. A BLOCK field rather
    // than a kitchen one on purpose: normalizeState merges a saved block over a
    // fresh one shallowly, so a saved kitchens array replaces the fresh one
    // whole and a field added inside emptyKitchen() would be undefined on every
    // existing save. A new block field inherits its default for free.
    absent: emptyAbsentGrid(),
    absentDate: ''
  };
}

function freshState(){
  const blocks = {};
  INITIAL_BLOCKS.forEach(b=>{ blocks[b.id] = blankBlock(b.day, b.course); });
  const duties = [];   // no standard list; duties are whatever the teacher adds
  return {
    blocks, duties,
    jobTitles: [...DEFAULT_JOB_TITLES],
    slots: { A: ['A1','A2','A3',null], B: ['B1','B2','B3',null] },
    nextNum: { A: 4, B: 4 }
  };
}

// Merges saved data onto a fresh default shape, so older saves upgrade
// cleanly instead of breaking. Handles three prior shapes: current
// (slots + nextNum), the brief order-array version (order + nextNum, no
// nulls/removal), and the original slot-number version (blocks with a
// `slot` field, no order or slots array at all).
function normalizeState(parsed){
  if(parsed.slots && parsed.nextNum){
    const blocks = {};
    ['A','B'].forEach(day=>{
      (parsed.slots[day]||[]).forEach(id=>{
        if(id){
          blocks[id] = Object.assign(blankBlock(day, 1), parsed.blocks[id] || {});
          // A save written before attendance existed has no grid; one that was
          // hand-edited or truncated may have a short one. Repair here so no
          // render path has to cope with a ragged array.
          repairKitchens(blocks[id]);
          absentGrid(blocks[id]);
          expireAbsences(blocks[id]);
        }
      });
    });
    return {
      blocks,
      duties: Array.isArray(parsed.duties) ? parsed.duties : [],
      jobTitles: Array.isArray(parsed.jobTitles) && parsed.jobTitles.length===5
        ? (JSON.stringify(parsed.jobTitles) === JSON.stringify(OLD_DEFAULT_JOB_TITLES) ? [...DEFAULT_JOB_TITLES] : parsed.jobTitles)
        : [...DEFAULT_JOB_TITLES],
      slots: {
        A: padTo4(parsed.slots.A || ['A1','A2','A3',null]),
        B: padTo4(parsed.slots.B || ['B1','B2','B3',null])
      },
      nextNum: { A: parsed.nextNum.A || 4, B: parsed.nextNum.B || 4 }
    };
  }

  if(parsed.order && parsed.nextNum){
    const base = freshState();
    ['A','B'].forEach(day=>{
      const ids = (parsed.order[day]||[]).slice(0,4);
      base.slots[day] = padTo4(ids);
      ids.forEach(id=>{ base.blocks[id] = Object.assign(blankBlock(day,1), parsed.blocks[id]||{}); });
    });
    if(Array.isArray(parsed.duties)) base.duties = parsed.duties;
    base.nextNum = { A: parsed.nextNum.A||4, B: parsed.nextNum.B||4 };
    return base;
  }

  // Original shape: blocks keyed A1..B4 with a per-block `slot` number.
  const base = freshState();
  if(Array.isArray(parsed.duties)) base.duties = parsed.duties;
  if(parsed.blocks){
    const byDay = {A:[], B:[]};
    Object.keys(parsed.blocks).forEach(id=>{
      const b = parsed.blocks[id];
      if(b && (b.day==='A' || b.day==='B')) byDay[b.day].push(id);
    });
    ['A','B'].forEach(day=>{
      if(byDay[day].length===0) return;
      const sorted = byDay[day].slice().sort((a,b)=>(parsed.blocks[a].slot||99)-(parsed.blocks[b].slot||99));
      base.slots[day] = padTo4(sorted);
      sorted.forEach(id=>{
        const merged = Object.assign(blankBlock(day,1), parsed.blocks[id]);
        delete merged.slot;
        base.blocks[id] = merged;
      });
      let maxNum = 0;
      sorted.forEach(id=>{ const m = id.match(/(\d+)$/); if(m) maxNum = Math.max(maxNum, parseInt(m[1],10)); });
      base.nextNum[day] = Math.max(maxNum+1, sorted.length+1);
    });
  }
  return base;
}

// Every render path indexes kitchens 0..NUM_KITCHENS-1 and reads .students on
// each, so a short or malformed kitchens array would throw on first paint —
// and loadBackupFile saves before it renders, so it would throw on every
// page load after that too.
function repairKitchens(block){
  if(!Array.isArray(block.kitchens)) block.kitchens = [];
  for(let ki=0; ki<NUM_KITCHENS; ki++){
    const k = block.kitchens[ki];
    if(!k || typeof k !== 'object') block.kitchens[ki] = emptyKitchen();
    else {
      if(!Array.isArray(k.students)) k.students = [];
      if(!Array.isArray(k.original)) k.original = [];
    }
  }
}

function padTo4(arr){
  const out = arr.slice(0,4);
  while(out.length < 4) out.push(null);
  return out;
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return freshState();
    const parsed = JSON.parse(raw);
    if(!parsed.blocks) return freshState();
    return normalizeState(parsed);
  }catch(e){ return freshState(); }
}

// Returns whether the write actually landed. Callers that go on to record a
// rotation in history check this: a history entry claiming a rotation that the
// saved roster does not reflect would leave the board showing one thing and the
// gradebook saying another.
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  }catch(e){
    showToast('This browser would not save your changes. Use Download backup to keep a copy.');
    return false;
  }
}
