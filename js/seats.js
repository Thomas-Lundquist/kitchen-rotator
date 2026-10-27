// --- SEATS: who holds a job, and who is here today ---

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
