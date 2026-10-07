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
    dutyIndex: 0, centerSink: 0
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
        if(id) blocks[id] = Object.assign(blankBlock(day, 1), parsed.blocks[id] || {});
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



function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    showToast('This browser would not save your changes. Use Download backup to keep a copy.');
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

// Rotation
function advanceBlock(blockId){
  const block = state.blocks[blockId];
  const active = activeKitchenIdxs(block);

  // Only real names rotate, and they always re-seat from the top: a kitchen of
  // 3 holds the first 3 job titles and the jobs below them read SPLIT. Empty
  // seats used to ride along in the roster, which marched a phantom student
  // through the titles and left Manager unfilled while Kitchen Porter was
  // staffed — backwards from the rule the UI states.
  active.forEach(ki=>{
    const k = block.kitchens[ki];
    const names = k.students.filter(isRealStudent);
    if(names.length > 1) names.unshift(names.pop());
    k.students = k.students.map((_, i) => names[i] || '');
  });

  refreshDuties(blockId, true);
  saveState();
}

function saveBlockOriginal(blockId){
  const block = state.blocks[blockId];
  block.kitchens.forEach(k=>{ k.original = k.students.slice(); });
  block.dutyIndex = 0;
  block.centerSink = 0;
  refreshDuties(blockId, false);
  saveState();
  showToast(`${blockId}: current layout saved as the new original.`);
}

function restoreBlockOriginal(blockId){
  const block = state.blocks[blockId];
  block.kitchens.forEach(k=>{
    // Same top-down seating a rotation produces, so Restore and Advance can
    // never disagree about where a short kitchen's names sit.
    const cleanOrig = k.original.filter(isRealStudent);
    const len = Math.max(k.students.length, cleanOrig.length);
    k.students = Array.from({length: len}, (_, i) => cleanOrig[i] || '');
  });
  block.dutyIndex = 0;
  block.centerSink = 0;
  refreshDuties(blockId, false);
  saveState();
  render();
  showToast(`${blockId}: restored to saved original.`);
}

// Rotates only the blocks scheduled for one day — A and B days never run
// on the same day, so "rotate everything regardless of day" was never
// actually the useful action; the header button tracks whichever day
// tab is currently open instead (see switchTab).
function rotateDay(day){
  state.slots[day].filter(Boolean).forEach(id=>advanceBlock(id));
  render();
  showToast(`All ${day} Day blocks rotated.`);
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

    activeKitchenIdxs(block).forEach((ki, seat)=>{
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
  const active = activeKitchenIdxs(block);

  if(increment && active.length > 0){
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
  const centerSinkByKitchen = {};
  const staffed = new Set(active);
  const wantOdd = block.centerSink === 0;
  active.forEach(ki=>{
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
}

// The derived look of one seat. Shared by the initial render and the in-place
// refresh below so the two can never drift apart.
function seatChrome(block, active, ki, r){
  const isEmpty = !active.includes(ki);
  const isSplitSlot = !isEmpty && !isRealStudent(block.kitchens[ki].students[r]);
  return {
    isEmpty, isSplitSlot,
    placeholder: (isEmpty && r===0) ? '+ add kitchen' : (isSplitSlot ? 'SPLIT' : '')
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
    const c = seatChrome(block, active, +el.dataset.k, +el.dataset.r);
    el.classList.toggle('empty', c.isEmpty);
    el.classList.toggle('split-placeholder', c.isSplitSlot);
    el.placeholder = c.placeholder; // never el.value: that is what the user is typing
  });
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
          <button class="btn-primary" onclick="advanceBlock('${id}'); render();">Advance</button>
          <button class="btn-quiet" onclick="openFullscreen('${id}')">${ICON_EXPAND}Full screen</button>
          <button class="btn-quiet menu-trigger" onclick="openMenu(event, this, blockMenuHtml('${id}'))" aria-label="More actions">${ICON_KEBAB}</button>
        </div>
      </div>
      <div class="kitchen-grid">`;

    const active = activeKitchenIdxs(block);

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
        const c = seatChrome(block, active, ki, r);
        const raw = block.kitchens[ki].students[r] || '';
        const val = isRealStudent(raw) ? raw : '';
        const hint = c.placeholder ? ` placeholder="${c.placeholder}"` : '';
        html += `<input class="seat ${c.isSplitSlot?'split-placeholder':''} ${c.isEmpty?'empty':''}" value="${escapeAttr(val)}"${hint}
          data-block="${id}" data-k="${ki}" data-r="${r}"
          oninput="updateSeat('${id}',${ki},${r},this.value)">`;
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

  const ok = confirm(`Remove the class at ${day}${posIdx+1}? This deletes its roster and duty history and makes ${day}${posIdx+1} a prep period. This can't be undone (unless you have a backup).`);
  if(!ok) return;

  state.slots[day][posIdx] = null;
  delete state.blocks[blockId];
  state.duties.forEach(d=>{ delete d.apply[blockId]; });
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
function downloadBackup(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `kitchen-rotation-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
      state = parsed;
      saveState();
      render();
      showToast('Backup loaded.');
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
    <button onclick="saveBlockOriginal('${id}'); render();">${ICON_SAVE}Save as original</button>
    <button onclick="restoreBlockOriginal('${id}');">${ICON_RESTORE}Restore to original</button>
    <button onclick="openImportModal('${id}');">${ICON_IMPORT}Import roster</button>
    <button onclick="removeClass('${id}');" style="color:var(--bad);">${ICON_TRASH}Remove this class</button>
  `;
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
  const active = activeKitchenIdxs(block);

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
      if(active.some(ki => isRealStudent(block.kitchens[ki].students[r]))) usedRows = r + 1;
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
        const name = block.kitchens[ki].students[r];
        gridHtml += isRealStudent(name)
          ? `<div class="fs-gname">${escapeHtml(name)}</div>`
          : `<div class="fs-gsplit">SPLIT</div>`;
      });
    }

    gridHtml += `<div class="fs-glabel fs-glabel-duty">Extra Duty</div>`;
    active.forEach(ki=>{
      const dutyText = (block._dutyDisplay && block._dutyDisplay[ki]) || '';
      gridHtml += `<div class="fs-gduty">${dutyText ? escapeHtml(dutyText) : 'None'}</div>`;
    });

    gridHtml += `<div class="fs-glabel">Center Sink</div>`;
    active.forEach(ki=>{
      const hasSink = !!(block._centerSinkDisplay && block._centerSinkDisplay[ki]);
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
  if(e.key === 'Escape' && fullscreenBlockId) closeFullscreen();
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
