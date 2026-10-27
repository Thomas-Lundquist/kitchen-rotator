// --- ROTATION HISTORY: participation records ---
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
//
// Record shape, kept terse because there can be hundreds of them:
//   { b: batchId, d: 'YYYY-MM-DD', cn: className, ts: titleSets index,
//     k: [ { i: kitchen idx, s: names in display order, du: duty,
//            cs: 1 if center sink, ab: display rows that were absent } ] }
const HISTORY_KEY = 'kitchenRotationTool_history_v1';
const HISTORY_CAP = 90;           // rotations kept per block
const HISTORY_SOFT_MAX = 1500000; // chars; trim before the browser throws

let historyStore;                 // assigned by main.js, like `state`
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

// --- PARTICIPATION CSV ---

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
