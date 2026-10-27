// --- ROSTER IMPORT ---

let importTargetBlock = null;

function openImportModal(blockId){
  importTargetBlock = blockId;
  document.getElementById('importModalTitle').textContent = `Import roster into ${blockLabel(blockId)}`;
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

// Pulls the Student column out of an attendance export. Returns the raw
// names, or a string saying why there are none.
function namesFromAttendanceCSV(text){
  const rows = parseCSV(text.replace(/^﻿/, '')).filter(r => r.length > 1 || (r[0] && r[0].trim()));
  if(rows.length < 2) return 'That file could not be read as CSV.';

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
  if(idx === -1) return 'Could not find a "Student" column in that file.';

  const names = [];
  for(let r=headerRowIdx+1; r<rows.length; r++){
    const raw = rows[r][idx];
    if(raw && raw.trim()) names.push(raw.trim());
  }
  return names.length ? names : 'No student names found in that file.';
}

function handleAttendanceFile(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let result;
    try{ result = namesFromAttendanceCSV(String(e.target.result)); }
    catch(err){ result = 'That file could not be read as CSV.'; }
    if(typeof result === 'string'){ showToast(result); return; }
    document.getElementById('importText').value = result.join('\n');
    showToast(`Loaded ${result.length} students. Check the list, then choose Import.`);
  };
  reader.readAsText(file);
  input.value = '';
}

// Converts "Archer, Kelly Noel" -> "Kelly A." (first name + last initial).
// Lines with no comma are assumed to already be a plain first name and pass through as-is.
function parseNameEntry(raw){
  const s = raw.trim().replace(/^["']+|["']+$/g, '');
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

// Deals shuffled names round-robin into as many kitchens as computeGroupCount
// picks, so kitchen sizes never differ by more than one.
function groupNames(names){
  const numGroups = computeGroupCount(names.length);
  const groups = Array.from({length:numGroups}, ()=>[]);
  names.forEach((n,i)=> groups[i % numGroups].push(n));
  return groups;
}

function confirmImport(){
  const raw = document.getElementById('importText').value;
  const names = raw.split(/\r?\n/).map(parseNameEntry).filter(Boolean);
  if(names.length === 0){ showToast('No names entered.'); return; }
  shuffle(names);
  const groups = groupNames(names);

  const block = state.blocks[importTargetBlock];
  block.kitchens = Array.from({length:NUM_KITCHENS}, emptyKitchen);
  let dropped = 0;
  groups.forEach((g, ci)=>{
    // Only a class of more than NUM_KITCHENS * MAX_KITCHEN students gets here.
    const seated = g.slice(0, MAX_KITCHEN);
    dropped += g.length - seated.length;
    block.kitchens[ci].students = seated.slice();
    block.kitchens[ci].original = seated.slice();
  });
  block.dutyIndex = 0;
  block.centerSink = 0;
  // Brand new students, so yesterday's attendance means nothing — and an
  // undo would restore a roster these names never sat in.
  block.absent = emptyAbsentGrid();
  block.absentDate = '';
  lastRotation = null;
  refreshDuties(importTargetBlock, false);
  saveState();
  closeImportModal();
  render();
  const label = blockLabel(importTargetBlock);
  showToast(dropped
    ? `Only ${NUM_KITCHENS * MAX_KITCHEN} students fit in ${label}. ${dropped} were left out.`
    : `Imported ${names.length} students into ${groups.length} kitchens for ${label}.`);
}
