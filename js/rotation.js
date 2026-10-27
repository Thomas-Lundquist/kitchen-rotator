// --- ROTATION: advancing seats, the saved original, and undo ---

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
  render();
  showToast(`${blockLabel(blockId)}: current layout saved as the new original.`);
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
  showToast(`${blockLabel(blockId)}: restored to saved original.`);
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

// --- ROTATE ACTIONS ---

// The per-card Advance button as a user action: snapshot, advance, record.
// advanceBlock itself stays the bare mechanism, because rotateDay calls it in a
// loop and a snapshot taken inside it would leave only the last block.
function advanceBlockAction(blockId){
  const batchId = newBatchId();
  const rec = buildRotationRecord(blockId, batchId);   // BEFORE advancing
  snapshotBlocks([blockId], `Advance ${blockLabel(blockId)}`);
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
