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

function allBlockIds(){ return [...state.slots.A, ...state.slots.B].filter(Boolean); }

const STORAGE_KEY = 'kitchenRotationTool_v1';

function emptyKitchen(){ return { students: [], original: [] }; }


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
    absent: Array.from({length:NUM_KITCHENS}, ()=>Array(MAX_KITCHEN).fill(false)),
    absentDate: ''
  };
}

const DEFAULT_JOB_TITLES = ['Manager', 'Head Chef', 'Sous Chef', 'Kitchen Porter', 'Dishwasher'];
const OLD_DEFAULT_JOB_TITLES = ['Head Chef', 'Sous Chef', 'Prep Cook', 'Dishwasher', 'Cleanup Crew'];

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

let state = loadState();

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

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 3200);
}

// --- ACTIVE KITCHEN / SPLIT HELPERS ---
function isSplit(v){ return String(v||'').trim().toUpperCase() === 'SPLIT'; }

// A seat counts as filled only when it holds an actual name. Blanks, stray
// whitespace and the SPLIT marker all mean "nobody holds this job" — SPLIT is
// a statement about the JOB (its work is shared by the kitchen), not about a
// student, and it is derived at render time rather than stored.
function isRealStudent(v){ return !!String(v||'').trim() && !isSplit(v); }

function activeKitchenIdxs(block){
  const idxs = [];
  block.kitchens.forEach((k,i)=>{
    const hasReal = k.students.some(isRealStudent);
    if(hasReal) idxs.push(i);
  });
  return idxs;
}

// --- ATTENDANCE ---
//
// Being out for the day never moves anybody in kitchens[ki].students. That
// array IS the rotation cycle — advanceBlock turns it with unshift(pop()) — so
// physically sinking an absent student would rewrite the cycle itself and
// nothing would put them back on their return. The flag sits alongside instead,
// and the present-first seating is worked out at render time, the same way
// SPLIT already is.
//
// With nobody marked, seatOrder is the identity and every path below produces
// exactly what it did before the feature existed.

// Hot path: called for every seat on every render, so it only reads.
function isAbsent(block, ki, r){
  return !!(block.absent && block.absent[ki] && block.absent[ki][r]);
}

// Write path: repairs a grid that is missing, short, or came in from a
// hand-edited backup.
function absentGrid(block){
  if(!Array.isArray(block.absent)) block.absent = [];
  for(let ki=0; ki<NUM_KITCHENS; ki++){
    if(!Array.isArray(block.absent[ki])) block.absent[ki] = [];
    while(block.absent[ki].length < MAX_KITCHEN) block.absent[ki].push(false);
  }
  return block.absent;
}
function absentRow(block, ki){ return absentGrid(block)[ki]; }
function clearAbsences(block){ absentGrid(block).forEach(row=>row.fill(false)); block.absentDate = ''; }

function setAbsent(block, ki, r, on){
  absentRow(block, ki)[r] = !!on;
  block.absentDate = todayStamp();
}

// Absences describe one class day. They lapse when that day ends, so a board
// left running overnight never opens tomorrow still holding them. A rotation
// clears them outright; this covers the day you never got round to rotating.
function expireAbsences(block){
  if(block.absentDate && block.absentDate !== todayStamp()) clearAbsences(block);
}

// Display row -> stored seat index, for one kitchen. Present students take the
// top job titles, absent students sit below them, empty seats last. Always a
// full permutation of 0..MAX_KITCHEN-1, so every row on screen maps to exactly
// one stored seat and typing into a row writes one seat.
//
// Absent sinks below the present but ABOVE the blanks, not to the literal last
// row: a real name sitting under the SPLIT rows would make the fullscreen
// usedRows scan force all five rows to full height and strand the SPLIT rows in
// the middle, which is the opposite of what that code is for.
function seatOrder(block, ki){
  const k = block.kitchens[ki];
  const present = [], away = [], blank = [];
  for(let i=0; i<MAX_KITCHEN; i++){
    const v = k.students[i];
    if(!isRealStudent(v)) blank.push(i);
    else if(isAbsent(block, ki, i)) away.push(i);
    else present.push(i);
  }
  return present.concat(away, blank);
}

// "Active" means the kitchen exists — it has names, its column renders, its
// seats are editable. "Staffed" means somebody is actually standing there
// today. A kitchen whose whole crew is out still shows its people, but it
// cannot wipe a shelf or wash a sink, so duties and the centre sink use this.
function staffedKitchenIdxs(block){
  const idxs = [];
  block.kitchens.forEach((k,i)=>{
    if(k.students.some((v,r)=> isRealStudent(v) && !isAbsent(block, i, r))) idxs.push(i);
  });
  return idxs;
}

// Attendance is a fact about PEOPLE, not about seats. Anything that re-seats a
// kitchen — undo, restore-to-original — carries the marks across by name
// within that kitchen, since rotation never moves a student between kitchens.
function absentNamesByKitchen(block){
  return block.kitchens.map((k,ki)=>{
    const s = new Set();
    k.students.forEach((v,r)=>{ if(isRealStudent(v) && isAbsent(block,ki,r)) s.add(String(v).trim()); });
    return s;
  });
}
function applyAbsentNames(block, sets){
  block.kitchens.forEach((k,ki)=>{
    const row = absentRow(block, ki), set = sets[ki] || new Set();
    for(let r=0; r<MAX_KITCHEN; r++){
      row[r] = isRealStudent(k.students[r]) && set.has(String(k.students[r]).trim());
    }
  });
}

// Rotation
function advanceBlock(blockId){
  const block = state.blocks[blockId];
  const active = activeKitchenIdxs(block);
  // Whether anybody was actually here for the session now ending is what
  // decides if the duty cursor moves on, and it has to be read BEFORE the
  // marks below are cleared — afterwards an all-absent class is
  // indistinguishable from a full one.
  const hadStaff = staffedKitchenIdxs(block).length > 0;

  // Only real names rotate, and they always re-seat from the top: a kitchen of
  // 3 holds the first 3 job titles and the jobs below them read SPLIT. Empty
  // seats used to ride along in the roster, which marched a phantom student
  // through the titles and left Manager unfilled while Kitchen Porter was
  // staffed — backwards from the rule the UI states.
  //
  // Name and attendance mark travel together. A flag indexed by seat alone
  // would stay where it was while the student under it moved on to the next
  // job, so tomorrow's Manager would arrive already marked absent.
  //
  // This uses active, not staffed: a kitchen whose whole crew is out still has
  // to turn its cycle, or they come back to the wrong jobs.
  active.forEach(ki=>{
    const k = block.kitchens[ki];
    const row = absentRow(block, ki);
    const pairs = k.students
      .map((s,i)=>({ s, away: !!row[i] }))
      .filter(p=>isRealStudent(p.s));
    if(pairs.length > 1) pairs.unshift(pairs.pop());
    k.students = k.students.map((_, i) => pairs[i] ? pairs[i].s : '');
    for(let i=0; i<MAX_KITCHEN; i++) row[i] = pairs[i] ? pairs[i].away : false;
  });

  // A rotation starts the next class day, so today's attendance lapses with it.
  // Cleared before refreshDuties so the duties it works out for the coming
  // session assume a full room again.
  clearAbsences(block);

  refreshDuties(blockId, hadStaff);
  saveState();
}

function saveBlockOriginal(blockId){
  const block = state.blocks[blockId];
  block.kitchens.forEach(k=>{ k.original = k.students.slice(); });
  block.dutyIndex = 0;
  block.centerSink = 0;
  lastRotation = null;   // the cursors this would restore have just been reset
  refreshDuties(blockId, false);
  saveState();
  showToast(`${blockId}: current layout saved as the new original.`);
}

function restoreBlockOriginal(blockId){
  const block = state.blocks[blockId];
  // Who is out today is not a fact about seats, so it survives a re-seat. The
  // marks are carried over by name once the roster below has been rebuilt.
  const away = absentNamesByKitchen(block);
  block.kitchens.forEach(k=>{
    // Same top-down seating a rotation produces, so Restore and Advance can
    // never disagree about where a short kitchen's names sit.
    const cleanOrig = k.original.filter(isRealStudent);
    const len = Math.max(k.students.length, cleanOrig.length);
    k.students = Array.from({length: len}, (_, i) => cleanOrig[i] || '');
  });
  applyAbsentNames(block, away);
  block.dutyIndex = 0;
  block.centerSink = 0;
  lastRotation = null;   // the seating this would have put back no longer exists
  refreshDuties(blockId, false);
  saveState();
  render();
  showToast(`${blockId}: restored to saved original.`);
}

// --- UNDO ---
//
// The one action Undo can reverse. Held in memory only, deliberately: a
// snapshot that survived a page reload would let you undo yesterday's rotation
// into today's class and scramble a seating that is already correct. No undo is
// safer than a stale one. It also keeps the snapshot out of saveState()'s
// per-keystroke serialisation and out of backup files.
let lastRotation = null;

function snapshotBlocks(ids, label){
  const blocks = {};
  ids.forEach(id=>{
    const b = state.blocks[id];
    if(!b) return;
    // Not captured: `original` (rotation never touches it), the _display caches
    // (rebuilt by refreshDuties), and `absent` — attendance is carried across
    // by name on restore instead, so undoing a rotation does not also undo the
    // register you took after it.
    blocks[id] = {
      kitchens: b.kitchens.map(k=>k.students.slice()),
      dutyIndex: b.dutyIndex,
      centerSink: b.centerSink
    };
  });
  lastRotation = { label, blocks, batchId: null };
  refreshUndoBtn();
}

function undoLastRotation(){
  if(!lastRotation){ showToast('Nothing to undo.'); return; }
  const snap = lastRotation;
  lastRotation = null;              // one step, no stack, no redo
  Object.keys(snap.blocks).forEach(id=>{
    const b = state.blocks[id], s = snap.blocks[id];
    if(!b) return;                  // the class was removed since the rotation
    const away = absentNamesByKitchen(b);
    b.kitchens.forEach((k,ki)=>{ k.students = (s.kitchens[ki] || []).slice(); });
    applyAbsentNames(b, away);      // marks land on the seats people are restored INTO
    b.dutyIndex  = s.dutyIndex;
    b.centerSink = s.centerSink;
    refreshDuties(id, false);       // no increment: the cursors are already right
  });
  if(snap.batchId) removeHistoryBatch(snap.batchId);
  saveState();
  render();
  showToast(`Undone: ${snap.label}.`);
}

function refreshUndoBtn(){
  const b = document.getElementById('undoBtn');
  if(!b) return;
  // Read the panel that is actually on screen, not currentDayTab — that keeps
  // its last A/B value while Settings is open, so it never reads as "away".
  const settings = document.getElementById('panel-settings');
  const onDayTab = !(settings && settings.classList.contains('active'));
  b.style.display = (lastRotation && onDayTab) ? '' : 'none';
  if(lastRotation){
    b.textContent = `Undo: ${lastRotation.label}`;
    b.title = `Puts the seats and the duty rotation back as they were before "${lastRotation.label}".`;
  }
}

// The per-card Advance button as a user action: snapshot, advance, record.
// advanceBlock itself stays the bare mechanism, because rotateDay calls it in a
// loop and a snapshot taken inside it would leave only the last block.
function advanceBlockAction(blockId){
  const batchId = newBatchId();
  const rec = buildRotationRecord(blockId, batchId);   // BEFORE advancing
  snapshotBlocks([blockId], `Advance ${blockId}`);
  lastRotation.batchId = batchId;
  advanceBlock(blockId);
  // Append BEFORE rendering: render() draws the Settings summary from the
  // history store, so appending afterwards left that count a rotation behind.
  const saved = saveState();
  if(saved && rec) appendHistory([rec]);
  render();
}

// Rotates only the blocks scheduled for one day — A and B days never run
// on the same day, so "rotate everything regardless of day" was never
// actually the useful action; the header button tracks whichever day
// tab is currently open instead (see switchTab).
function rotateDay(day){
  const ids = state.slots[day].filter(Boolean);

  if(alreadyRotatedToday(ids)){
    if(!confirm(`You already rotated ${day} Day today. Rotate again?`)) return;
  }

  const batchId = newBatchId();
  // EVERY record must be built before ANY block advances. refreshDuties does
  // not only touch its own block — it reassigns the whole day and writes
  // _dutyDisplay for every block on it, which is what makes the day-wide
  // no-repeat rule work. So advancing A1 first would overwrite A2's and A3's
  // duties before they were ever recorded.
  const batch = ids.map(id=>buildRotationRecord(id, batchId)).filter(Boolean);

  snapshotBlocks(ids, `Rotate ${day} Day`);
  lastRotation.batchId = batchId;
  ids.forEach(id=>advanceBlock(id));

  const saved = saveState();
  if(saved) appendHistory(batch);   // before render(), which draws the summary from it
  render();
  showToast(`All ${day} Day blocks rotated.${batch.length ? ' Recorded.' : ''}`);
}

// Only warns when EVERY block being rotated already has today's date on it.
// A partial match is a legitimate mid-day catch-up, not a double rotation.
function alreadyRotatedToday(ids){
  const today = todayStamp();
  const withStudents = ids.filter(id=>{
    const b = state.blocks[id];
    return b && staffedKitchenIdxs(b).length > 0;
  });
  if(withStudents.length === 0) return false;
  return withStudents.every(id=>{
    const arr = historyFor(id);
    return arr.length > 0 && arr[arr.length-1].d === today;
  });
}

function rotateCurrentDay(){
  if(currentDayTab !== 'A' && currentDayTab !== 'B') return;
  rotateDay(currentDayTab);
}

// Duties
function dutiesForBlock(blockId){
  return state.duties.filter(d => d.apply[blockId]).map(d=>d.text);
}

// The blocks of one day, in the order they actually run. A block that has been
// pulled out of the day's slots is appended so it still gets an assignment.
function dayBlockOrder(day, ensureId){
  const ids = (state.slots[day] || []).filter(Boolean);
  if(ensureId && !ids.includes(ensureId)) ids.push(ensureId);
  return ids;
}

// Extra duties are assigned for a WHOLE DAY at once, not block by block.
//
// A kitchen index is a physical station: K3 in first period is the same
// counter and the same shelves as K3 in third period, with a different class
// standing at it. Wiping those shelves a second time is wasted work, so one
// physical kitchen must not draw the same duty twice in a day.
//
// Per-block rotation cannot promise that on its own. rotateDay() advances
// every block on the day together, and blocks that share a duty pool start
// equal, so they stay equal forever — K3 drew the IDENTICAL duty in every
// period, every rotation. Offsetting each block by its position in the day
// breaks the lockstep (consecutive periods land on consecutive duties), and
// the scan below repairs what arithmetic alone cannot: blocks whose duty pools
// differ, where equal offsets can still collide.
function assignDayDuties(day, ensureId){
  const usedByKitchen = new Map();  // physical kitchen idx -> duties drawn today, in order
  const byBlock = {};

  dayBlockOrder(day, ensureId).forEach((id, pos)=>{
    const block = state.blocks[id];
    const out = {};
    byBlock[id] = out;
    if(!block) return;

    const pool = dutiesForBlock(id);
    const takenHere = new Set();    // keeps two kitchens in the SAME block apart

    // Staffed, not active: a kitchen whose whole crew is out today cannot do a
    // duty, so it draws none and the kitchens after it close up the gap.
    staffedKitchenIdxs(block).forEach((ki, seat)=>{
      if(pool.length === 0){ out[ki] = ''; return; }
      const used = usedByKitchen.get(ki) || [];
      // Where rotation alone would put this kitchen, shifted by the block's
      // position in the day. Counting by SEAT (position among the staffed
      // kitchens) rather than by kitchen number keeps the duties handed out in
      // one block consecutive in the pool: staffing only K5 and K7 would
      // otherwise index 4 and 6 and silently skip whatever sits at 5.
      const start = (block.dutyIndex + seat + pos) % pool.length;

      let pick = null;
      // Best: new to this kitchen today, and unclaimed in this block.
      for(let i=0; i<pool.length && pick===null; i++){
        const cand = pool[(start+i) % pool.length];
        if(!used.includes(cand) && !takenHere.has(cand)) pick = cand;
      }
      // Next best: new to this kitchen today, even if another kitchen in this
      // block already has it. Two kitchens sharing a duty is just a small pool
      // showing through; the same kitchen repeating one is the actual waste.
      for(let i=0; i<pool.length && pick===null; i++){
        const cand = pool[(start+i) % pool.length];
        if(!used.includes(cand)) pick = cand;
      }
      // Last resort: this kitchen has already done every duty in its pool
      // today, so repeat whichever one it did longest ago.
      if(pick === null){
        pick = pool.reduce((best, cand)=>
          used.lastIndexOf(cand) < used.lastIndexOf(best) ? cand : best);
      }

      out[ki] = pick;
      takenHere.add(pick);
      usedByKitchen.set(ki, used.concat(pick));
    });
  });
  return byBlock;
}

function refreshDuties(blockId, increment){
  const block = state.blocks[blockId];
  if(!block) return;
  expireAbsences(block);
  const staffedIdxs = staffedKitchenIdxs(block);

  // Nobody in today means nothing was done, so the cursors hold where they are
  // and the class picks up the same duty when it comes back.
  if(increment && staffedIdxs.length > 0){
    const pool = dutiesForBlock(blockId);
    if(pool.length > 0) block.dutyIndex = (block.dutyIndex + 1) % pool.length;
    block.centerSink = block.centerSink === 0 ? 1 : 0;
  }

  // Center sink stays a per-block alternation rather than a day-wide rule:
  // unlike wiping a shelf, the dishes at a station refill every period, so
  // washing again the same day is not redundant work.
  //
  // Kitchens share a sink in fixed physical pairs — K1/K2, K3/K4, K5/K6,
  // K7/K8 — and a staffed pair takes turns, one kitchen each rotation. A
  // kitchen whose partner has no students has nobody to take the other turn,
  // so it keeps its sink EVERY rotation. Alternating blindly by kitchen number
  // left those sinks unwashed: staffing only K5 and K7 (both odd) means every
  // even turn picks two empty stations, and the pair sinks go dirty.
  //
  // A partner whose whole crew is out today counts the same as an empty one —
  // there is nobody over there to take the other turn either way.
  const centerSinkByKitchen = {};
  const staffed = new Set(staffedIdxs);
  const wantOdd = block.centerSink === 0;
  staffedIdxs.forEach(ki=>{
    centerSinkByKitchen[ki] = staffed.has(ki ^ 1)   // ^1 pairs 0-1, 2-3, 4-5, 6-7
      ? (((ki+1)%2===1) === wantOdd)
      : true;
  });
  block._centerSinkDisplay = centerSinkByKitchen;

  // One kitchen's duty depends on what that same kitchen drew in the day's
  // other blocks, so the whole day is assigned together and every block on it
  // has its display refreshed here.
  const assignment = assignDayDuties(block.day, blockId);
  Object.keys(assignment).forEach(id=>{
    if(state.blocks[id]) state.blocks[id]._dutyDisplay = assignment[id];
  });
}

// Import
let importTargetBlock = null;
function openImportModal(blockId){
  importTargetBlock = blockId;
  document.getElementById('importModalTitle').textContent = `Import roster into ${blockId}`;
  document.getElementById('importText').value = '';
  document.getElementById('attendanceFile').value = '';
  document.getElementById('importModalBg').classList.add('show');
}
function closeImportModal(){
  document.getElementById('importModalBg').classList.remove('show');
}
// Picks how many kitchens to use so students split as evenly as possible
// with an average of 4 per kitchen. Kitchens of 3 absorb a remainder in
// preference to kitchens of 5 — 5s only happen when there's no way to avoid
// it (e.g. a class size that isn't a clean multiple of 3 or 4).
function computeGroupCount(n){
  if(n <= 0) return 0;
  let k = Math.round(n / TARGET_KITCHEN_SIZE);
  if(k < 1) k = 1;
  const minForCap5 = Math.ceil(n / 5);      // enough kitchens that none exceeds 5
  const maxForFloor3 = Math.max(1, Math.floor(n / 3)); // few enough that none drops below 3
  if(k < minForCap5) k = minForCap5;
  if(k > maxForFloor3) k = maxForFloor3;
  return Math.min(NUM_KITCHENS, Math.max(1, k));
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
}
// Minimal correct CSV parser: handles quoted fields, commas/newlines inside
// quotes, and "" escaped quotes. Needed because attendance exports quote
// fields like "Archer, Kelly Noel" (comma inside) and messy HTML-log cells.
function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ',') { row.push(field); field=''; }
      else if(c === '\r') { /* skip */ }
      else if(c === '\n') { row.push(field); rows.push(row); row=[]; field=''; }
      else field += c;
    }
  }
  if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
  return rows;
}

function handleAttendanceFile(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try{
      const text = String(e.target.result).replace(/^\uFEFF/, '');
      const rows = parseCSV(text).filter(r => r.length > 1 || (r[0] && r[0].trim()));
      if(rows.length < 2) throw new Error('empty');

      // Some exports have a grouping/title row above the real column
      // headers (e.g. "Previous Days" / "Student Information"), so scan
      // the first several rows for the one that actually contains a
      // "Student" column rather than assuming it's row 0.
      let headerRowIdx = -1, idx = -1;
      for(let r=0; r<Math.min(5, rows.length); r++){
        const header = rows[r].map(h => h.trim().toLowerCase());
        const found = header.indexOf('student');
        if(found !== -1){ headerRowIdx = r; idx = found; break; }
      }
      if(idx === -1){
        showToast('Could not find a "Student" column in that file.');
        return;
      }

      const names = [];
      for(let r=headerRowIdx+1; r<rows.length; r++){
        const raw = rows[r][idx];
        if(raw && raw.trim()) names.push(raw.trim());
      }
      if(names.length === 0){
        showToast('No student names found in that file.');
        return;
      }

      document.getElementById('importText').value = names.join('\n');
      showToast(`Loaded ${names.length} students. Check the list, then choose Import.`);
    }catch(err){
      showToast('That file could not be read as CSV.');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// Converts "Archer, Kelly Noel" -> "Kelly A." (first name + last initial).
// Lines with no comma are assumed to already be a plain first name and pass through as-is.
function parseNameEntry(raw){
  let s = raw.trim().replace(/^["']+|["']+$/g, '');
  if(!s) return '';
  if(s.includes(',')){
    const [lastPart, firstPart] = s.split(',');
    const last = lastPart.trim();
    const first = (firstPart || '').trim().split(/\s+/)[0] || '';
    if(!first || !last) return first || last;
    return `${first} ${last[0].toUpperCase()}.`;
  }
  return s;
}

function confirmImport(){
  const raw = document.getElementById('importText').value;
  let names = raw.split(/\r?\n/).map(parseNameEntry).filter(Boolean);
  if(names.length === 0){ showToast('No names entered.'); return; }
  shuffle(names);

  const numGroups = computeGroupCount(names.length);
  const groups = Array.from({length:numGroups}, ()=>[]);
  names.forEach((n,i)=> groups[i % numGroups].push(n));

  const block = state.blocks[importTargetBlock];
  block.kitchens = Array.from({length:NUM_KITCHENS}, ()=>emptyKitchen());
  groups.forEach((g, ci)=>{
    if(g.length > MAX_KITCHEN){
      showToast(`Kitchen ${ci+1} holds only ${MAX_KITCHEN} students. The rest were left out.`);
      g = g.slice(0, MAX_KITCHEN);
    }
    block.kitchens[ci].students = g.slice();
    block.kitchens[ci].original = g.slice();
  });
  block.dutyIndex = 0;
  block.centerSink = 0;
  // Brand new students, so yesterday's attendance means nothing — and an
  // undo would restore a roster these names never sat in.
  block.absent = Array.from({length:NUM_KITCHENS}, ()=>Array(MAX_KITCHEN).fill(false));
  block.absentDate = '';
  lastRotation = null;
  refreshDuties(importTargetBlock, false);
  saveState();
  closeImportModal();
  render();
  showToast(`Imported ${names.length} students into ${numGroups} kitchens for ${importTargetBlock}.`);
}

// Duty list management
function addDuty(){
  state.duties.push({ text:'New duty', apply: Object.fromEntries(allBlockIds().map(id=>[id,false])) });
  saveState();
  renderDutyTable();
}
function removeDuty(idx){
  state.duties.splice(idx,1);
  saveState();
  renderDutyTable();
}
function updateDutyText(idx, val){
  state.duties[idx].text = val;
  saveState();
}
function toggleDutyApply(idx, blockId, checked){
  state.duties[idx].apply[blockId] = checked;
  saveState();
}

function renderDutyTable(){
  const tbl = document.getElementById('dutyTable');
  const ids = allBlockIds();
  const labelFor = id => {
    const day = state.blocks[id].day;
    return day + (state.slots[day].indexOf(id) + 1);
  };
  let html = '<tr><th>Duty</th>' + ids.map(id=>`<th>${labelFor(id)}</th>`).join('') + '<th></th></tr>';
  state.duties.forEach((d, idx)=>{
    html += `<tr>
      <td><input type="text" value="${escapeAttr(d.text)}" onchange="updateDutyText(${idx}, this.value)"></td>
      ${ids.map(id=>`<td><input type="checkbox" ${d.apply[id]?'checked':''} onchange="toggleDutyApply(${idx}, '${id}', this.checked)"></td>`).join('')}
      <td><button class="btn-danger" onclick="removeDuty(${idx})" aria-label="Remove duty">${ICON_TRASH_SOLO}</button></td>
    </tr>`;
  });
  tbl.innerHTML = html || '<tr><td>No duties yet. Add one below.</td></tr>';
}

// Render
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }

let currentDayTab = 'A';

function switchTab(which){
  ['A','B','settings'].forEach(t=>{
    document.getElementById('panel-'+t).classList.toggle('active', t===which);
    document.getElementById('tab-'+t).classList.toggle('active', t===which);
  });
  const rotateBtn = document.getElementById('rotateBtn');
  if(which === 'A' || which === 'B'){
    currentDayTab = which;
    rotateBtn.textContent = `Rotate ${which} Day`;
    rotateBtn.style.display = '';
  } else {
    rotateBtn.style.display = 'none';
  }
  refreshUndoBtn();   // Undo belongs next to Rotate, so it hides with it
}

// The derived look of one seat. Shared by the initial render and the in-place
// refresh below so the two can never drift apart.
// `ci` is the STORED seat index, `row` the display row it is drawn at. The two
// part company as soon as somebody is absent, so both are passed rather than
// derived from one another.
function seatChrome(block, active, ki, ci, row){
  const isEmpty = !active.includes(ki);
  const v = block.kitchens[ki].students[ci];
  const isSplitSlot = !isEmpty && !isRealStudent(v);
  const isAway = !isEmpty && isRealStudent(v) && isAbsent(block, ki, ci);
  return {
    isEmpty, isSplitSlot, isAway,
    placeholder: (isEmpty && row===0) ? '+ add kitchen' : (isSplitSlot ? 'SPLIT' : '')
  };
}

// Editing a seat changes only derived chrome — SPLIT markers, active/empty
// styling, the duty and sink rows — never the grid's structure. Rebuilding the
// panel for that destroyed the very input the browser was about to focus, which
// is what dumped you out of the grid on every Tab. So update the nodes in place
// and leave the inputs (and the caret inside them) alone.
function refreshBlockChrome(blockId){
  const block = state.blocks[blockId];
  if(!block) return;
  refreshDuties(blockId, false);
  const active = activeKitchenIdxs(block);
  const card = document.querySelector(`[data-block-card="${blockId}"]`);
  if(!card) return;

  card.querySelectorAll('.khead[data-k]').forEach(el=>{
    el.classList.toggle('empty', !active.includes(+el.dataset.k));
  });
  card.querySelectorAll('input.seat').forEach(el=>{
    const c = seatChrome(block, active, +el.dataset.k, +el.dataset.ci, +el.dataset.r);
    el.classList.toggle('empty', c.isEmpty);
    el.classList.toggle('split-placeholder', c.isSplitSlot);
    el.classList.toggle('away', c.isAway);
    el.placeholder = c.placeholder; // never el.value: that is what the user is typing
  });
  // Duty and sink read from the DISPLAY maps, which refreshDuties builds from
  // staffed kitchens only — so a kitchen whose crew is all out simply shows
  // nothing in these rows rather than a job nobody is there to do.
  card.querySelectorAll('.duty[data-k]').forEach(el=>{
    const ki = +el.dataset.k;
    el.classList.toggle('empty', !active.includes(ki));
    el.textContent = (block._dutyDisplay && block._dutyDisplay[ki]) || '';
  });
  card.querySelectorAll('.centersink[data-k]').forEach(el=>{
    const ki = +el.dataset.k;
    const hasSink = !!(block._centerSinkDisplay && block._centerSinkDisplay[ki]);
    el.classList.toggle('empty', !active.includes(ki));
    el.classList.toggle('active', hasSink);
    el.innerHTML = hasSink ? ICON_DROPLET + ' Center Sink' : '';
  });
}

function renderDayPanel(day){
  const container = document.getElementById('panel-'+day);
  const slots = state.slots[day];
  let html = '';

  slots.forEach((id, posIdx)=>{
    if(!id){
      html += `<div class="block-card empty-slot-card">
        <div class="empty-slot-label">${day}${posIdx+1} prep period</div>
        <button class="btn-secondary" onclick="startNewClass('${day}', ${posIdx})">+ Start New Class Here</button>
      </div>`;
      return;
    }

    const block = state.blocks[id];
    refreshDuties(id, false); // ensure _dutyDisplay populated for render without mutating rotation
    const headClass = block.course===2 ? 'c2' : '';
    html += `<div class="block-card" data-block-card="${id}">
      <div class="block-head ${headClass}">
        <select class="hdr-field id-badge-select" onchange="updatePosition('${id}', this.value)">
          <option value="prep">Prep (no class)</option>
          ${[0,1,2,3].map(n=>`<option value="${n+1}" ${posIdx===n?'selected':''}>${day}${n+1}</option>`).join('')}
        </select>
        <select class="hdr-field" onchange="updateCourse('${id}', this.value)">
          <option value="1" ${block.course===1?'selected':''}>Culinary 1</option>
          <option value="2" ${block.course===2?'selected':''}>Culinary 2</option>
        </select>
        <div class="block-actions">
          <button class="btn-primary" onclick="advanceBlockAction('${id}')">Advance</button>
          <button class="btn-quiet" onclick="openFullscreen('${id}')">${ICON_EXPAND}Full screen</button>
          <button class="btn-quiet menu-trigger" onclick="openMenu(event, this, blockMenuHtml('${id}'))" aria-label="More actions">${ICON_KEBAB}</button>
        </div>
      </div>
      <div class="kitchen-grid">`;

    expireAbsences(block);
    const active = activeKitchenIdxs(block);
    // Display row -> stored seat, per kitchen. Identity when nobody is out.
    const orders = {};
    for(let ki=0; ki<NUM_KITCHENS; ki++) orders[ki] = seatOrder(block, ki);

    // Header row: label column, then each kitchen's header.
    html += `<div class="khead">&nbsp;</div>`;
    for(let ki=0; ki<NUM_KITCHENS; ki++){
      html += `<div class="khead ${!active.includes(ki)?'empty':''}" data-k="${ki}">K${ki+1}</div>`;
    }

    // One row per seat position, each spanning the label column + all 8 kitchens.
    for(let r=0; r<MAX_KITCHEN; r++){
      html += `<div class="seat-label">${escapeHtml(state.jobTitles[r])}</div>`;
      for(let ki=0; ki<NUM_KITCHENS; ki++){
        // An unfilled job in a kitchen that HAS students is shared by the
        // group, so it reads SPLIT. A placeholder rather than a value means
        // typing a name just works and clearing one brings the marker back.
        // data-r stays the DISPLAY row, so the arrow-key navigation keeps
        // working unchanged — every row 0..4 still exists on screen. data-ci is
        // the stored seat this row is showing, and it is what edits write to.
        const ci = orders[ki][r];
        const c = seatChrome(block, active, ki, ci, r);
        const raw = block.kitchens[ki].students[ci] || '';
        const val = isRealStudent(raw) ? raw : '';
        const hint = c.placeholder ? ` placeholder="${c.placeholder}"` : '';
        const away = c.isAway ? ' title="Out today — this job is shared by the kitchen"' : '';
        html += `<input class="seat ${c.isSplitSlot?'split-placeholder':''} ${c.isAway?'away':''} ${c.isEmpty?'empty':''}" value="${escapeAttr(val)}"${hint}${away}
          data-block="${id}" data-k="${ki}" data-r="${r}" data-ci="${ci}"
          oninput="updateSeat('${id}',${ki},${ci},this.value)">`;
      }
    }

    // Duty row — tallest cell in this row (e.g. a long wrapped duty) now
    // sets the height for the WHOLE row, so every kitchen's row stays level.
    html += `<div class="duty label-row">Extra Duty</div>`;
    for(let ki=0; ki<NUM_KITCHENS; ki++){
      const isEmpty = !active.includes(ki);
      const dutyText = (block._dutyDisplay && block._dutyDisplay[ki]) || '';
      html += `<div class="duty ${isEmpty?'empty':''}" data-k="${ki}">${dutyText ? escapeHtml(dutyText) : ''}</div>`;
    }

    // Center Sink row — same fix applies here, which is what was drifting.
    html += `<div class="centersink label-row">Center Sink</div>`;
    for(let ki=0; ki<NUM_KITCHENS; ki++){
      const isEmpty = !active.includes(ki);
      const hasSink = !!(block._centerSinkDisplay && block._centerSinkDisplay[ki]);
      html += `<div class="centersink ${hasSink?'active':''} ${isEmpty?'empty':''}" data-k="${ki}">${hasSink ? ICON_DROPLET+' Center Sink' : ''}</div>`;
    }

    html += `</div></div>`;
  });
  container.innerHTML = html;
}

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function updateHeaderField(blockId, field, val){
  state.blocks[blockId][field] = val;
  saveState();
}

function updatePosition(blockId, val){
  if(val === 'prep'){ removeClass(blockId); return; }

  const newPos = parseInt(val, 10) - 1; // 0-indexed
  const block = state.blocks[blockId];
  const day = block.day;
  const slots = state.slots[day];
  const oldPos = slots.indexOf(blockId);
  if(oldPos === -1 || newPos === oldPos) return;

  // Moving into an empty slot just relocates it; moving onto an occupied
  // slot swaps the two classes' positions. Either way nothing is lost.
  const displacedId = slots[newPos];
  slots[oldPos] = displacedId; // null if the target was empty
  slots[newPos] = blockId;

  saveState();
  render();
  showToast(displacedId ? `Swapped ${day}${oldPos+1} and ${day}${newPos+1}.` : `Moved to ${day}${newPos+1}.`);
}

function startNewClass(day, posIdx){
  const num = state.nextNum[day];
  const id = day + num;
  state.blocks[id] = blankBlock(day, 1);
  state.slots[day][posIdx] = id;
  state.nextNum[day] = num + 1;
  saveState();
  render();
  showToast(`Started a class at ${day}${posIdx+1}. Set the class type, then import a roster.`);
}

function removeClass(blockId){
  const block = state.blocks[blockId];
  const day = block.day;
  const posIdx = state.slots[day].indexOf(blockId);
  if(posIdx === -1) return;

  const ok = confirm(`Remove the class at ${day}${posIdx+1}? This deletes its roster, its duty rotation and its participation records, and makes ${day}${posIdx+1} a prep period. Export the participation CSV first if you still need it. This can't be undone (unless you have a backup).`);
  if(!ok) return;

  state.slots[day][posIdx] = null;
  delete state.blocks[blockId];
  state.duties.forEach(d=>{ delete d.apply[blockId]; });
  deleteBlockHistory(blockId);   // the confirm above promises this
  lastRotation = null;
  saveState();
  render();
  showToast(`${day}${posIdx+1} is now a prep period.`);
}

function updateCourse(blockId, val){
  const block = state.blocks[blockId];
  block.course = parseInt(val, 10);
  block.className = block.course === 2 ? 'Culinary 2' : 'Culinary 1';
  saveState();
  render();
}

function updateSeat(blockId, kIdx, rIdx, val){
  const k = state.blocks[blockId].kitchens[kIdx];
  while(k.students.length <= rIdx) k.students.push('');
  // SPLIT is derived now, so typing it by hand just clears the seat: the cell
  // shows the marker either way and the saved data stays honest about who is
  // actually in the kitchen.
  k.students[rIdx] = isSplit(val) ? '' : val;
  // An emptied seat holds nobody, so it cannot hold an absence either. Renaming
  // one keeps the mark, which is what fixing a typo in an absent name needs.
  if(!isRealStudent(k.students[rIdx])) absentRow(state.blocks[blockId], kIdx)[rIdx] = false;
  saveState();
  // In-place, so the SPLIT markers and duty row keep up as you type without the
  // focused input being torn out from under you. The full-screen view is a
  // separate DOM, so rebuilding that one is harmless.
  refreshBlockChrome(blockId);
  if(fullscreenBlockId === blockId) renderFullscreen();
}

function render(){
  renderDayPanel('A');
  renderDayPanel('B');
  renderDutyTable();
  renderJobTitleTable();
  renderHistorySection();
  refreshUndoBtn();
  if(fullscreenBlockId) renderFullscreen();
}

function updateJobTitle(idx, val){
  state.jobTitles[idx] = val || `Seat ${idx+1}`;
  saveState();
  render();
}

function renderJobTitleTable(){
  const tbl = document.getElementById('jobTitleTable');
  let html = '<tr><th>Seat Position</th><th>Job Title</th></tr>';
  state.jobTitles.forEach((title, idx)=>{
    html += `<tr>
      <td>Seat ${idx+1}</td>
      <td><input type="text" value="${escapeAttr(title)}" onchange="updateJobTitle(${idx}, this.value)"></td>
    </tr>`;
  });
  tbl.innerHTML = html;
}

// Backup and restore (manual, local file)

// The one way this tool hands a file to the browser, shared by the JSON backup
// and the participation CSV. A blob URL plus a detached anchor is what the CSP
// allows: connect-src 'none' rules out uploading anything anywhere.
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// LOCAL calendar date, not toISOString(): that reports UTC, which in a US
// timezone has already rolled over to tomorrow by late afternoon. A rotation
// at the end of a 3pm class would have been filed under the next day, and
// absences would have expired mid-afternoon.
function dateStamp(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayStamp(){ return dateStamp(new Date()); }

function downloadBackup(){
  // History lives under its own storage key, so it has to be folded in here
  // explicitly. It rides as a SIBLING of the state fields rather than wrapping
  // them, which keeps the file loadable by older builds and keeps
  // loadBackupFile's `if(!parsed.blocks)` guard meaningful.
  const payload = Object.assign({}, state, { rotationHistory: historyStore });
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}),
               `kitchen-rotation-backup-${todayStamp()}.json`);
  showToast('Backup file downloaded.');
}
function loadBackupFile(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const parsed = JSON.parse(e.target.result);
      if(!parsed.blocks) throw new Error('bad file');

      // Lift history out BEFORE the payload becomes `state`. Without this the
      // whole history — hundreds of kilobytes — would live inside `state` and
      // be re-serialised by saveState() on every keystroke, which is the exact
      // thing storing it under its own key exists to prevent.
      const incomingHistory = parsed.rotationHistory;
      delete parsed.rotationHistory;

      // Restoring through normalizeState rather than assigning raw: a backup
      // written by an older build has no `absent` grid, may have a short
      // `slots` array, and may carry the superseded job titles. Assigning it
      // unrepaired put the app in states the UI cannot render.
      state = normalizeState(parsed);
      saveState();

      // A backup that predates history leaves what is already here alone. A
      // restore should not silently destroy a term of participation records
      // just because the file is older than the feature.
      if(incomingHistory){
        historyStore = normalizeHistory(incomingHistory);
        writeHistory();
      }
      render();
      showToast(incomingHistory
        ? 'Backup loaded.'
        : 'Backup loaded. It held no rotation history, so the history already in this browser was kept.');
    }catch(err){
      showToast('That file could not be read. It needs to be a backup downloaded from this tool.');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// Dropdown menu
function openMenu(evt, triggerEl, itemsHtml){
  evt.stopPropagation();
  const menu = document.getElementById('genericMenu');
  const wasOpenForThisTrigger = menu.classList.contains('show') && menu._trigger === triggerEl;
  closeMenu();
  if(wasOpenForThisTrigger) return; // clicking the same trigger again just closes it

  menu.innerHTML = itemsHtml;
  menu._trigger = triggerEl;
  const rect = triggerEl.getBoundingClientRect();
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.left = 'auto';
  menu.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
  menu.classList.add('show');
}
function closeMenu(){
  const menu = document.getElementById('genericMenu');
  menu.classList.remove('show');
  menu._trigger = null;
}
document.addEventListener('click', closeMenu);

function blockMenuHtml(id){
  return `
    <button onclick="openAbsenceModal('${id}');">${ICON_ABSENT}Attendance&hellip;</button>
    <button onclick="openHistoryModal('${id}');">${ICON_HISTORY}Rotation history</button>
    <button onclick="saveBlockOriginal('${id}'); render();">${ICON_SAVE}Save as original</button>
    <button onclick="restoreBlockOriginal('${id}');">${ICON_RESTORE}Restore to original</button>
    <button onclick="openImportModal('${id}');">${ICON_IMPORT}Import roster</button>
    <button onclick="removeClass('${id}');" style="color:var(--bad);">${ICON_TRASH}Remove this class</button>
  `;
}

// --- ATTENDANCE UI ---
let absenceTargetBlock = null;

function openAbsenceModal(blockId){
  absenceTargetBlock = blockId;
  const block = state.blocks[blockId];
  const day = block.day;
  const posIdx = state.slots[day].indexOf(blockId);
  document.getElementById('absenceModalTitle').textContent =
    `Attendance — ${day}${posIdx+1} ${block.className}`;
  renderAbsenceBody();
  document.getElementById('absenceModalBg').classList.add('show');
}

function closeAbsenceModal(){
  document.getElementById('absenceModalBg').classList.remove('show');
  absenceTargetBlock = null;
}

function renderAbsenceBody(){
  const block = state.blocks[absenceTargetBlock];
  let html = '';
  // Chips are listed in STORED order, never seating order, so they do not
  // reshuffle under the cursor halfway through taking the register.
  activeKitchenIdxs(block).forEach(ki=>{
    const chips = block.kitchens[ki].students.map((v,r)=> !isRealStudent(v) ? '' :
      `<button class="att-chip ${isAbsent(block,ki,r)?'away':''}" aria-pressed="${isAbsent(block,ki,r)}"
         onclick="toggleAbsence(${ki},${r},this)">${escapeHtml(v)}</button>`).join('');
    if(chips) html += `<div class="att-row"><div class="att-khead">K${ki+1}</div><div class="att-chips">${chips}</div></div>`;
  });
  document.getElementById('absenceBody').innerHTML = html ||
    '<p class="hint">No students in this class yet.</p>';
}

function toggleAbsence(ki, r, btn){
  const id = absenceTargetBlock, block = state.blocks[id];
  const on = !isAbsent(block, ki, r);
  setAbsent(block, ki, r, on);
  saveState();
  // The chip restyles in place so the button under the cursor survives its own
  // click. The grid behind does need a full panel rebuild — the seating order
  // changed, which moves names between inputs, and that is exactly the thing
  // refreshBlockChrome refuses to do.
  btn.classList.toggle('away', on);
  btn.setAttribute('aria-pressed', String(on));
  renderDayPanel(block.day);
  if(fullscreenBlockId === id) renderFullscreen();
}

function clearBlockAbsences(){
  if(!absenceTargetBlock) return;
  const block = state.blocks[absenceTargetBlock];
  clearAbsences(block);
  saveState();
  renderAbsenceBody();
  renderDayPanel(block.day);
  if(fullscreenBlockId === absenceTargetBlock) renderFullscreen();
  showToast('Everyone marked present.');
}

// Right-click a seat for a one-off — a late arrival, or someone who turns up
// after the register was taken. Same underlying mark as the modal.
document.addEventListener('contextmenu', e=>{
  const el = e.target;
  if(!el.classList || !el.classList.contains('seat') || !el.dataset.block) return;
  const blockId = el.dataset.block, ki = +el.dataset.k, ci = +el.dataset.ci;
  const block = state.blocks[blockId];
  if(!block || !isRealStudent(block.kitchens[ki].students[ci])) return;
  e.preventDefault();
  const away = isAbsent(block, ki, ci);
  openMenu(e, el, `
    <button onclick="markAbsentFromSeat('${blockId}',${ki},${ci},${!away})">${away ? ICON_RESTORE : ICON_ABSENT}Mark ${away ? 'present' : 'absent'}</button>
    <button onclick="openAbsenceModal('${blockId}')">${ICON_ABSENT}Attendance&hellip;</button>
  `);
});

function markAbsentFromSeat(blockId, ki, ci, on){
  const block = state.blocks[blockId];
  setAbsent(block, ki, ci, on);
  saveState();
  renderDayPanel(block.day);
  if(fullscreenBlockId === blockId) renderFullscreen();
  if(absenceTargetBlock === blockId) renderAbsenceBody();
}

// --- HISTORY UI ---
let historyTargetBlock = null;
let historyFilter = 'all';

function openHistoryModal(blockId){
  historyTargetBlock = blockId;
  historyFilter = 'all';
  const block = state.blocks[blockId];
  const day = block.day;
  const posIdx = state.slots[day].indexOf(blockId);
  document.getElementById('historyModalTitle').textContent =
    `Rotation history — ${day}${posIdx+1} ${block.className}`;
  setHistoryFilter('all');
  document.getElementById('historyModalBg').classList.add('show');
}

function closeHistoryModal(){
  document.getElementById('historyModalBg').classList.remove('show');
  historyTargetBlock = null;
}

function setHistoryFilter(which){
  historyFilter = which;
  document.getElementById('histAll').classList.toggle('on', which === 'all');
  document.getElementById('histWeek').classList.toggle('on', which === 'week');
  renderHistoryBody();
}

function renderHistoryBody(){
  const recs = historyFor(historyTargetBlock).slice().reverse();   // newest first
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const cutoff = dateStamp(weekAgo);
  const shown = historyFilter === 'week' ? recs.filter(r=>r.d >= cutoff) : recs;

  const body = document.getElementById('historyBody');
  if(shown.length === 0){
    body.innerHTML = `<p class="hint">${recs.length === 0
      ? 'Nothing recorded for this class yet. A record is written each time it rotates.'
      : 'Nothing in the last seven days.'}</p>`;
    return;
  }

  body.innerHTML = shown.map(rec=>{
    const titles = historyStore.titleSets[rec.ts] || state.jobTitles;
    const kitchens = rec.k.map(kr=>{
      const absent = new Set(kr.ab || []);
      const held = kr.s.map((name, row)=> !isRealStudent(name) ? '' :
          `${escapeHtml(name)} <span class="${absent.has(row)?'hist-absent':''}">(${escapeHtml(titles[row] || ('Seat '+(row+1)))}${absent.has(row)?', out':''})</span>`)
        .filter(Boolean).join(', ');
      const bits = [];
      if(kr.du) bits.push(`<span class="hist-duty">${escapeHtml(kr.du)}</span>`);
      if(kr.cs) bits.push(`<span class="hist-sink">Center Sink</span>`);
      return `<div class="hist-k"><b>K${kr.i+1}</b> — ${bits.join(' · ') || 'no duty'}<br>${held}</div>`;
    }).join('');
    return `<div class="hist-entry"><div class="hist-date">${escapeHtml(formatHistoryDate(rec.d))}</div>${kitchens}</div>`;
  }).join('');
}

function formatHistoryDate(iso){
  const parts = String(iso).split('-');
  if(parts.length !== 3) return iso;
  const d = new Date(+parts[0], +parts[1]-1, +parts[2]);
  return isNaN(d) ? iso : d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}

function renderHistorySection(){
  const el = document.getElementById('historySummary');
  if(!el) return;
  const total = historyCount();
  if(total === 0){
    el.innerHTML = '<p class="hint">No rotations recorded yet.</p>';
    return;
  }
  let oldest = '';
  Object.keys(historyStore.records).forEach(id=>{
    const arr = historyStore.records[id];
    if(arr.length && (!oldest || arr[0].d < oldest)) oldest = arr[0].d;
  });
  const classes = Object.keys(historyStore.records).filter(id=>historyStore.records[id].length).length;
  el.innerHTML = `<p class="hint">${total} rotation${total===1?'':'s'} recorded across ${classes} class${classes===1?'':'es'}${oldest ? `, oldest ${escapeHtml(formatHistoryDate(oldest))}` : ''}.</p>`;
}

function clearAllHistory(){
  if(historyCount() === 0){ showToast('There is no history to clear.'); return; }
  if(!confirm('Delete every participation record for every class? Export the CSV first if you still need it. This cannot be undone.')) return;
  historyStore = emptyHistory();
  historyWriteDisabled = false;
  writeHistory();
  render();
  showToast('Participation records cleared.');
}

// --- CSV EXPORT ---

// Quote only where quoting is required. Deliberately no formula-injection
// guard: the usual fix prefixes a quote or space to anything starting with
// = + - @, which corrupts the student name this file exists to be matched on.
// Everything here is the teacher's own roster and their own typed duty text.
function csvField(v){
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rows){
  // CRLF and a UTF-8 BOM, or Excel on Windows mangles accented names. parseCSV
  // already strips a leading BOM, so the tool can reread its own exports.
  return '﻿' + rows.map(r=>r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

function buildParticipationRows(blockIds){
  const rows = [['Date','Day','Block','Class','Kitchen','Job Title','Student','Status','Extra Duty','Center Sink']];
  blockIds.forEach(id=>{
    historyFor(id).forEach(rec=>{
      const titles = historyStore.titleSets[rec.ts] || state.jobTitles;
      const day = id.charAt(0);
      rec.k.forEach(kr=>{
        const absent = new Set(kr.ab || []);
        kr.s.forEach((name, row)=>{
          if(!isRealStudent(name)) return;   // a SPLIT job has no student to credit
          rows.push([rec.d, day, id, rec.cn, 'K'+(kr.i+1),
                     titles[row] || ('Seat '+(row+1)), name,
                     absent.has(row) ? 'Absent' : 'Present',
                     kr.du || '', kr.cs ? 'Yes' : 'No']);
        });
      });
    });
  });
  return rows;
}

function exportParticipationCSV(blockId){
  // One block's id from the history modal, or every block that has records.
  const ids = blockId ? [blockId] : Object.keys(historyStore.records).sort();
  const rows = buildParticipationRows(ids);
  if(rows.length === 1){ showToast('No rotations recorded yet, so there is nothing to export.'); return; }
  const name = blockId
    ? `kitchen-participation-${blockId}-${todayStamp()}.csv`
    : `kitchen-participation-${todayStamp()}.csv`;
  downloadBlob(new Blob([toCSV(rows)], {type:'text/csv;charset=utf-8'}), name);
  showToast(`Exported ${rows.length-1} row${rows.length===2?'':'s'}.`);
}
// Bell schedule and fullscreen
// Position within a day (1st, 2nd, 3rd, 4th block of that day) maps
// directly to these times, regardless of A or B day — both day types use
// the same four daily time blocks (e.g. "1A/5B" share one time slot).
// Typos in the source schedule (4th block listed as "am") corrected to PM.
const BELL_SCHEDULES = {
  monThu: { label:'Monday–Thursday', blocks: [
    {start:'07:30', end:'08:55'},
    {start:'09:01', end:'10:33'},
    {start:'11:14', end:'12:39'},
    {start:'12:45', end:'14:10'}
  ]},
  friday: { label:'Friday (Late Start)', blocks: [
    {start:'08:30', end:'09:42'},
    {start:'09:48', end:'11:00'},
    {start:'11:40', end:'12:52'},
    {start:'12:58', end:'14:10'}
  ]}
};
const CLEANUP_LEAD_MIN = 10;

const ICON_CLOSE = '<svg class="fs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
const ICON_DROPLET = '<svg class="fs-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c-.3 0-.6.14-.78.38C9.7 5.2 5.25 11.6 5.25 15.5a6.75 6.75 0 0 0 13.5 0c0-3.9-4.45-10.3-5.97-12.62a.95.95 0 0 0-.78-.38z"/></svg>';
const I = (p,extra='') => `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON_CHEVRON  = I('<polyline points="6 9 12 15 18 9"/>','icon-solo');
const ICON_KEBAB    = I('<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>','icon-solo');
const ICON_EXPAND   = I('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>');
const ICON_SAVE     = I('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>');
const ICON_RESTORE  = I('<polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/>');
const ICON_IMPORT   = I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');
const ICON_TRASH    = I('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>');
const ICON_DOWNLOAD = I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');
const ICON_UPLOAD   = I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>');
const ICON_TRASH_SOLO = I('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>','icon-solo');
const ICON_ABSENT = I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/>');
const ICON_HISTORY = I('<path d="M3 12a9 9 0 1 0 2.6-6.4"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/>');
const ICON_MOON = '<svg class="fs-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8z"/></svg>';
const ICON_SUN = '<svg class="fs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><line x1="12" y1="1.8" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.2"/><line x1="1.8" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.2" y2="12"/><line x1="4.6" y1="4.6" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.4" y2="19.4"/><line x1="4.6" y1="19.4" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.4" y2="4.6"/></svg>';

function defaultScheduleKey(){
  return new Date().getDay() === 5 ? 'friday' : 'monThu';
}

let fullscreenScheduleKey = defaultScheduleKey();
let fullscreenBlockId = null;
let fullscreenTimer = null;

function timeStrToDateToday(hhmm){
  const [h,m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatFullscreenDate(d){
  return d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
}

function formatCountdown(ms){
  if(ms < 0) ms = 0;
  const totalSec = Math.floor(ms/1000);
  const m = Math.floor(totalSec/60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function openFullscreen(blockId){
  fullscreenBlockId = blockId;
  // Must become visible BEFORE rendering: the font-fitting pass measures
  // element widths/heights, and everything measures 0 while display:none,
  // which makes every size appear to "fit" and pins text at maximum size.
  document.getElementById('fullscreenOverlay').classList.add('show');
  renderFullscreen();
  if(fullscreenTimer) clearInterval(fullscreenTimer);
  fullscreenTimer = setInterval(updateFullscreenTimers, 1000);
}

function closeFullscreen(){
  document.getElementById('fullscreenOverlay').classList.remove('show');
  if(fullscreenTimer){ clearInterval(fullscreenTimer); fullscreenTimer = null; }
  fullscreenBlockId = null;
}

function changeFullscreenSchedule(val){
  fullscreenScheduleKey = val;
  updateFullscreenTimers();
}

function renderFullscreen(){
  const block = state.blocks[fullscreenBlockId];
  if(!block) return;
  refreshDuties(fullscreenBlockId, false);

  const day = block.day;
  const posIdx = state.slots[day].indexOf(fullscreenBlockId);
  const label = `${day}${posIdx+1}`;
  expireAbsences(block);
  const active = activeKitchenIdxs(block);
  const staffed = staffedKitchenIdxs(block);
  // Display row -> stored seat, per kitchen. Identity when nobody is out.
  const orders = {};
  active.forEach(ki=>{ orders[ki] = seatOrder(block, ki); });

  // Shared-label grid: job titles appear ONCE down the left column instead
  // of repeated inside every kitchen — same pattern as the main page. This
  // gives each kitchen's name column the full row width to itself, since it
  // no longer has to share space with a title string, so names can be sized
  // dramatically larger. Cells are emitted row-major so CSS Grid auto-aligns
  // every row's height across all kitchens (duty text wrapping in one
  // kitchen no longer drags that row out of line with the others).
  let gridHtml = '';
  if(active.length > 0){
    // minmax(0,1fr) caps each kitchen column at an EQUAL share of the width
    // so long names can't push a column wider than its fraction (which was
    // causing the grid to run off-screen). The label column is a fixed width.
    // Row template: header (auto), 5 name rows (1fr each — they share the
    // leftover height equally and large), duty row (0.9fr), sink row (auto).
    // Job rows nobody fills still render — they read SPLIT, which is what tells
    // the kitchen that work is shared — but at half height. With e.g. 27
    // students in 7 kitchens nobody has a 5th seat, so a full-height Dishwasher
    // row would eat height the real name rows could be using.
    let usedRows = 0;
    for(let r=0; r<MAX_KITCHEN; r++){
      if(active.some(ki => isRealStudent(block.kitchens[ki].students[orders[ki][r]]))) usedRows = r + 1;
    }
    if(usedRows === 0) usedRows = 1;
    const splitRows = MAX_KITCHEN - usedRows;

    const cols = `minmax(0,240px) repeat(${active.length}, minmax(0,1fr))`;
    // All rows are fr fractions (min 0) so they ALWAYS sum to exactly the
    // grid's height and can never be pushed past it by their content. The
    // header and each used name row give up 1/8 of their height (0.7->0.6125,
    // 1->0.875); duty gets all of that back on top of its base 1.1 so the
    // extra-duty text has more room to grow legible. Sink stays at 0.7.
    const dutyFr = 1.1 + (0.7 - 0.6125) + usedRows * (1 - 0.875);
    const rows = `minmax(0,0.6125fr) repeat(${usedRows}, minmax(0,0.875fr))`
      + (splitRows > 0 ? ` repeat(${splitRows}, minmax(0,0.5fr))` : '')
      + ` minmax(0,${dutyFr}fr) minmax(0,0.7fr)`;
    gridHtml += `<div class="fs-grid" style="grid-template-columns:${cols}; grid-template-rows:${rows}">`;

    gridHtml += `<div class="fs-ghead">&nbsp;</div>`;
    active.forEach(ki=>{ gridHtml += `<div class="fs-ghead">K${ki+1}</div>`; });

    for(let r=0; r<MAX_KITCHEN; r++){
      const splitRow = r >= usedRows;
      gridHtml += `<div class="fs-glabel ${splitRow?'fs-glabel-split':''}">${escapeHtml(state.jobTitles[r])}</div>`;
      active.forEach(ki=>{
        const ci = orders[ki][r];
        const name = block.kitchens[ki].students[ci];
        if(!isRealStudent(name)){ gridHtml += `<div class="fs-gsplit">SPLIT</div>`; return; }
        // Out today: the name stays at full size and a veil lies ON TOP of the
        // cell. An overlay takes no height from the grid, where a stacked
        // ABSENT line would have cost every other name on the board a row.
        gridHtml += isAbsent(block, ki, ci)
          ? `<div class="fs-gname fs-gaway">${escapeHtml(name)}<span class="fs-away-veil"><b>ABSENT</b><i>SPLIT</i></span></div>`
          : `<div class="fs-gname">${escapeHtml(name)}</div>`;
      });
    }

    gridHtml += `<div class="fs-glabel fs-glabel-duty">Extra Duty</div>`;
    active.forEach(ki=>{
      // A kitchen with nobody in today draws no duty at all, rather than
      // "None" — there is a difference between no duty and no one to do it.
      if(!staffed.includes(ki)){ gridHtml += `<div class="fs-gduty fs-gduty-out">&nbsp;</div>`; return; }
      const dutyText = (block._dutyDisplay && block._dutyDisplay[ki]) || '';
      gridHtml += `<div class="fs-gduty">${dutyText ? escapeHtml(dutyText) : 'None'}</div>`;
    });

    gridHtml += `<div class="fs-glabel">Center Sink</div>`;
    active.forEach(ki=>{
      const hasSink = staffed.includes(ki) && !!(block._centerSinkDisplay && block._centerSinkDisplay[ki]);
      gridHtml += `<div class="fs-gsink ${hasSink?'active':''}">${hasSink ? ICON_DROPLET+' Center Sink' : ''}</div>`;
    });

    gridHtml += `</div>`;
  } else {
    gridHtml = '<div class="fs-empty">No kitchens in use for this block.</div>';
  }

  document.getElementById('fsContent').innerHTML = `
    <div class="fs-header">
      <div class="fs-label"><span class="fs-label-id">${label}</span><span class="fs-label-class">${escapeHtml(block.className)}</span></div>
      <div class="fs-date" id="fsDate">${formatFullscreenDate(new Date())}</div>
      <div class="fs-header-controls">
        <div class="fs-schedule-picker">
          <select onchange="changeFullscreenSchedule(this.value)">
            <option value="monThu" ${fullscreenScheduleKey==='monThu'?'selected':''}>Monday–Thursday</option>
            <option value="friday" ${fullscreenScheduleKey==='friday'?'selected':''}>Friday (Late Start)</option>
          </select>
        </div>
        <button class="btn-outline" onclick="closeFullscreen()">${ICON_CLOSE} Close</button>
      </div>
    </div>
    <div class="fs-timers" id="fsTimers"></div>
    ${gridHtml}
  `;
  updateFullscreenTimers();
  fitFullscreen();
}

// Fullscreen fit-to-screen
// Three passes, run after every render:
//  1. fitJobRows() — since the job title now appears only once per row (in
//     the shared label column) instead of inside every kitchen's cell, each
//     of the three text roles — names, labels, kitchen headers — gets its
//     own single-line max-fit: one shared font size per role, as LARGE as
//     possible while every cell of that role still fits its own column
//     width on one line. Names get the most room since they no longer
//     compete with title text for space.
//
// The grid box is locked to the screen first (full width via width:100vw,
// full leftover height via flex + fixed row fractions), so every cell has a
// real, final width AND height BEFORE any font is sized. There is no page
// scaling anymore — the earlier scale transform is exactly what was shrinking
// everything toward one corner. We just grow each text role's font as large
// as fits its cells in BOTH dimensions.
// Returns true if EVERY element fits inside its cell (no overflow) in both
// width and height at whatever font size is currently applied. A 1px
// tolerance absorbs sub-pixel rounding.
function allFit(elements){
  for(const el of elements){
    // A zero-sized cell means layout isn't ready (e.g. still display:none).
    // Treat that as "doesn't fit" so the search can't conclude that every
    // size fits and pin text at the maximum.
    if(el.clientWidth <= 0 || el.clientHeight <= 0) return false;
    if(el.scrollWidth > el.clientWidth + 1) return false;
    if(el.scrollHeight > el.clientHeight + 1) return false;
  }
  return true;
}

// Binary-searches for the LARGEST integer font size (between min and max)
// at which every element still fits its cell, then applies that one shared
// size to all of them — so names are uniform and none overflow. This
// replaces the old ratio estimate, which mis-measured at the trial size
// (integer rounding made fitting text report a ratio of exactly 1, so it
// never grew past the base size and long names overflowed).
function maxFitFontSize(elements, maxSizePx, minSizePx){
  if(elements.length === 0) return maxSizePx;

  let lo = minSizePx, hi = maxSizePx, best = minSizePx;
  while(lo <= hi){
    const mid = Math.floor((lo + hi) / 2);
    elements.forEach(el=>{ el.style.fontSize = mid + 'px'; });
    if(allFit(elements)){
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  elements.forEach(el=>{ el.style.fontSize = best + 'px'; });
  return best;
}

function fitJobRows(){
  const nameEls = Array.from(document.querySelectorAll('.fs-gname'));
  const labelEls = Array.from(document.querySelectorAll('.fs-glabel:not(.fs-glabel-split)'));
  const splitEls = Array.from(document.querySelectorAll('.fs-gsplit'));
  const splitLabelEls = Array.from(document.querySelectorAll('.fs-glabel-split'));
  const headEls = Array.from(document.querySelectorAll('.fs-ghead'));
  const dutyEls = Array.from(document.querySelectorAll('.fs-gduty'));
  const sinkEls = Array.from(document.querySelectorAll('.fs-gsink'));

  // Each role is measured against its own cells (now fixed in both
  // dimensions) and grown to the largest size that fits every one of them.
  // SPLIT cells are measured apart from names on purpose: one shared fit across
  // both would measure the half-height SPLIT row and drag every real name down
  // to that size.
  maxFitFontSize(nameEls, 220, 14);
  const labelPx = maxFitFontSize(labelEls, 90, 12);
  maxFitFontSize(splitEls, 90, 10);
  // Capped at the shared job-label size: left to its own fit, a short word like
  // "Dishwasher" in a half-height row grows LARGER than "Kitchen Porter" above
  // it, which reads as emphasis on exactly the row we are de-emphasising.
  maxFitFontSize(splitLabelEls, Math.max(10, labelPx), 10);
  maxFitFontSize(headEls, 110, 12);
  maxFitFontSize(dutyEls, 56, 10);
  maxFitFontSize(sinkEls, 36, 10);
}

function fitFullscreen(){
  // Two passes: the first sizes fonts; applying them can nudge a wrapping
  // cell's height, so a second pass re-measures against the settled layout.
  fitJobRows();
  requestAnimationFrame(fitJobRows);
}

window.addEventListener('resize', ()=>{
  if(fullscreenBlockId) fitFullscreen();
});

function updateFullscreenTimers(){
  const dateEl = document.getElementById('fsDate');
  if(dateEl) dateEl.textContent = formatFullscreenDate(new Date());

  const timersEl = document.getElementById('fsTimers');
  if(!timersEl || !fullscreenBlockId) return;
  const block = state.blocks[fullscreenBlockId];
  if(!block) return;
  const day = block.day;
  const posIdx = state.slots[day].indexOf(fullscreenBlockId);
  const schedule = BELL_SCHEDULES[fullscreenScheduleKey];
  const blockTimes = schedule.blocks[posIdx];

  if(!blockTimes){
    timersEl.innerHTML = `<div class="fs-timer-card fs-na">No bell time set for position ${posIdx+1}. This schedule covers the four standard daily blocks.</div>`;
    return;
  }

  const now = new Date();
  const end = timeStrToDateToday(blockTimes.end);
  const cleanupStart = new Date(end.getTime() - CLEANUP_LEAD_MIN*60000);
  const msToEnd = end - now;
  const msToCleanup = cleanupStart - now;
  const classOver = msToEnd <= 0;
  const pastCleanup = !classOver && msToCleanup <= 0;

  timersEl.innerHTML = `
    <div class="fs-timer-card ${pastCleanup?'fs-alert':''}">
      <div class="fs-timer-label">Time until cleanup bell</div>
      <div class="fs-timer-value">${classOver ? 'Done' : (pastCleanup ? 'Clean up now' : formatCountdown(msToCleanup))}</div>
    </div>
    <div class="fs-timer-card ${classOver?'fs-over':''}">
      <div class="fs-timer-label">Time left in class</div>
      <div class="fs-timer-value">${classOver ? 'Class ended' : formatCountdown(msToEnd)}</div>
    </div>
  `;
}

document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    if(fullscreenBlockId){ closeFullscreen(); return; }
    if(document.getElementById('absenceModalBg').classList.contains('show')){ closeAbsenceModal(); return; }
    if(document.getElementById('historyModalBg').classList.contains('show')){ closeHistoryModal(); return; }
  }

  // Ctrl/Cmd+Z undoes the last rotation — but only outside a text field, where
  // the browser's own undo is what was meant. A rotation ends in render(),
  // which destroys focus, so activeElement is the body at exactly the moment
  // this is wanted.
  if((e.ctrlKey || e.metaKey) && !e.shiftKey && String(e.key).toLowerCase() === 'z'){
    const t = e.target;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if(!lastRotation) return;
    e.preventDefault();
    undoLastRotation();
  }
});

// --- SEAT KEYBOARD NAVIGATION ---
// Tab keeps its native left-to-right walk across kitchens. Enter and the up/down
// arrows move down one kitchen's column instead, which is the order a roster is
// actually filled in.
let seatNavByKeyboard = false;

function seatAt(blockId, ki, r){
  return document.querySelector(
    `input.seat[data-block="${blockId}"][data-k="${ki}"][data-r="${r}"]`);
}

function moveSeatFocus(el, delta, wrap){
  let ki = +el.dataset.k, r = +el.dataset.r + delta;
  if(r >= MAX_KITCHEN){
    if(!wrap || ki >= NUM_KITCHENS - 1) return;
    ki++; r = 0;
  }else if(r < 0){
    if(!wrap || ki <= 0) return;
    ki--; r = MAX_KITCHEN - 1;
  }
  const target = seatAt(el.dataset.block, ki, r);
  if(!target) return;
  seatNavByKeyboard = true;
  target.focus();
}

document.addEventListener('keydown', e=>{
  if(e.key === 'Tab'){ seatNavByKeyboard = true; return; }
  const el = e.target;
  if(!(el.classList && el.classList.contains('seat') && el.dataset.block)) return;
  // Enter carries on into the next kitchen so a whole roster can be typed
  // straight through; the arrows are spatial and stop at the kitchen's edge.
  let delta = 0, wrap = false;
  if(e.key === 'Enter'){ delta = e.shiftKey ? -1 : 1; wrap = true; }
  else if(e.key === 'ArrowDown') delta = 1;
  else if(e.key === 'ArrowUp') delta = -1;
  else return;
  e.preventDefault();
  moveSeatFocus(el, delta, wrap);
});

document.addEventListener('mousedown', e=>{
  if(e.target.classList && e.target.classList.contains('seat')) seatNavByKeyboard = false;
});

// Arriving by keyboard selects the whole name, so typing replaces it. Arriving by
// click leaves the caret where it was aimed, so fixing one letter of "Kelly A."
// never wipes the name.
document.addEventListener('focusin', e=>{
  const el = e.target;
  if(seatNavByKeyboard && el.classList && el.classList.contains('seat')) el.select();
  seatNavByKeyboard = false;
});

// Rotation history
//
// Kept in its own localStorage key, NOT on `state`, for one hard reason:
// saveState() serialises the whole of `state` and updateSeat() calls it on
// every keystroke. At the 90-per-block cap this store runs to roughly half a
// megabyte, so living on `state` would mean re-stringifying half a megabyte
// per character while a roster of a hundred names is typed in. Writes here
// happen only when a rotation is recorded — about twice a day.
//
// Single-teacher tool, so two tabs open on the same browser each hold their
// own copy of this and the last write wins. That is already true of `state`.
const HISTORY_KEY = 'kitchenRotationTool_history_v1';
const HISTORY_CAP = 90;           // rotations kept per block
const HISTORY_SOFT_MAX = 1500000; // chars; trim before the browser throws

let historyStore = loadHistory();
let historyWriteDisabled = false; // set after a quota failure, until reload

function emptyHistory(){ return { v:1, titleSets: [], records: {} }; }

function loadHistory(){
  try{
    const raw = localStorage.getItem(HISTORY_KEY);
    if(!raw) return emptyHistory();
    return normalizeHistory(JSON.parse(raw));
  }catch(e){ return emptyHistory(); }   // storage can throw on READ in private mode
}

// The history-side counterpart to normalizeState: never trust what comes back
// off disk or out of a backup file.
function normalizeHistory(parsed){
  const out = emptyHistory();
  if(!parsed || typeof parsed !== 'object') return out;
  out.titleSets = Array.isArray(parsed.titleSets)
    ? parsed.titleSets.filter(t=>Array.isArray(t)).map(t=>t.map(x=>String(x==null?'':x)))
    : [];
  const recs = (parsed.records && typeof parsed.records === 'object') ? parsed.records : {};
  Object.keys(recs).forEach(id=>{
    if(!Array.isArray(recs[id])) return;
    const clean = recs[id].filter(r=> r && typeof r === 'object' && Array.isArray(r.k));
    if(clean.length) out.records[id] = clean.slice(-HISTORY_CAP);
  });
  return out;
}

function writeHistory(){
  if(historyWriteDisabled) return false;
  try{
    let json = JSON.stringify(historyStore);
    // Trim ahead of the limit rather than waiting to be thrown at: some
    // browsers report quota against the whole origin, so the exception can
    // arrive from a write that is not itself the large one.
    if(json.length > HISTORY_SOFT_MAX){ trimHistoryTo(Math.floor(HISTORY_CAP*0.75)); json = JSON.stringify(historyStore); }
    localStorage.setItem(HISTORY_KEY, json);
    return true;
  }catch(e){
    // The rotation itself already happened and has been saved. Losing the
    // record of it must never take the rotation down with it, so this never
    // rethrows.
    try{
      trimHistoryTo(Math.max(20, Math.floor(HISTORY_CAP*0.75)));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(historyStore));
      return true;
    }catch(e2){
      historyWriteDisabled = true;   // one warning, not one per rotation
      showToast('Out of storage. The rotation happened but was not recorded. Export your participation CSV from Settings, then clear history.');
      return false;
    }
  }
}

function trimHistoryTo(cap){
  Object.keys(historyStore.records).forEach(id=>{
    const arr = historyStore.records[id];
    if(arr.length > cap) arr.splice(0, arr.length - cap);
  });
}

// Job titles are renameable, so a record that did not pin down the titles in
// force on the day would silently relabel a year of history the first time a
// seat is renamed — this tool has already been through one such rename. Storing
// an index into a dictionary costs a few bytes instead of fifty per record.
function titleSetIndex(){
  const want = JSON.stringify(state.jobTitles);
  const at = historyStore.titleSets.findIndex(t=>JSON.stringify(t) === want);
  if(at >= 0) return at;
  historyStore.titleSets.push(state.jobTitles.slice());
  return historyStore.titleSets.length - 1;
}

function newBatchId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

// Snapshot of what a block JUST FINISHED — call this before advanceBlock()
// touches anything. Returns null for a class with nobody in it, so prep periods
// and all-absent days never reach the gradebook.
function buildRotationRecord(blockId, batchId){
  const block = state.blocks[blockId];
  if(!block) return null;
  const staffed = staffedKitchenIdxs(block);
  if(staffed.length === 0) return null;

  refreshDuties(blockId, false);   // no increment; guarantees the display matches the screen

  const kitchens = staffed.map(ki=>{
    // Display order, not stored order: seatOrder puts present students first,
    // so the job a student actually held is the DISPLAY row's title. Recording
    // raw seat order would credit the wrong job to the wrong student on every
    // day somebody was out.
    const order = seatOrder(block, ki);
    return {
      i: ki,
      s: order.map(si => block.kitchens[ki].students[si] || ''),
      du: (block._dutyDisplay && block._dutyDisplay[ki]) || '',
      cs: (block._centerSinkDisplay && block._centerSinkDisplay[ki]) ? 1 : 0,
      ab: order.map((si,row)=> isAbsent(block, ki, si) ? row : -1).filter(r=>r >= 0)
    };
  });

  // _id rides along only as far as appendHistory, which uses it as the map key
  // and strips it — the key already names the block, so storing it twice would
  // just be a second thing that can disagree with the first.
  return { _id: blockId, b: batchId, d: todayStamp(), cn: block.className, ts: titleSetIndex(), k: kitchens };
}

function appendHistory(batch){
  if(!batch || !batch.length) return;
  batch.forEach(rec=>{
    const id = rec._id;
    delete rec._id;
    if(!historyStore.records[id]) historyStore.records[id] = [];
    const arr = historyStore.records[id];
    arr.push(rec);
    if(arr.length > HISTORY_CAP) arr.splice(0, arr.length - HISTORY_CAP);
  });
  writeHistory();
}

function removeHistoryBatch(batchId){
  let touched = false;
  Object.keys(historyStore.records).forEach(id=>{
    const before = historyStore.records[id].length;
    historyStore.records[id] = historyStore.records[id].filter(r=>r.b !== batchId);
    if(historyStore.records[id].length !== before) touched = true;
  });
  if(touched) writeHistory();
  return touched;
}

function deleteBlockHistory(blockId){
  if(historyStore.records[blockId]){ delete historyStore.records[blockId]; writeHistory(); }
}

function historyFor(blockId){ return historyStore.records[blockId] || []; }
function historyCount(){
  return Object.keys(historyStore.records).reduce((n,id)=>n + historyStore.records[id].length, 0);
}

// Theme
// Kept in its own localStorage key rather than in state, so it's a
// per-device display preference and isn't carried around by data backups.
const THEME_KEY = 'kitchenRotationTool_theme';

function loadTheme(){
  try{
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  }catch(e){ return 'light'; }
}

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.innerHTML = (theme === 'dark') ? ICON_SUN + ' Light' : ICON_MOON + ' Dark';
}

function toggleTheme(){
  const next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
  applyTheme(next);
  // Theme swap can shift text metrics slightly; re-fit if fullscreen is open.
  if(fullscreenBlockId) fitFullscreen();
}

// Web fonts arrive after first paint, and the fullscreen fitter sizes text by
// measuring it. A measurement taken against fallback metrics produces the
// wrong size the moment the real face swaps in, so re-fit once fonts settle.
// Wrapped in a guard because document.fonts is absent in older engines, and
// the promise rejects if a font fails to load (offline, or a blocked domain)
// in which case the fallback stack is already correct and no re-fit is needed.
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(()=>{
    if(fullscreenBlockId) fitFullscreen();
  }).catch(()=>{});
}

// Init
applyTheme(loadTheme());
render();
