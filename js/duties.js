// --- DUTIES: extra duties and the center sink ---

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

// Recomputes the derived _dutyDisplay and _centerSinkDisplay maps. With
// `increment` it also moves the block's rotation cursors on one step; without
// it, it only redraws from where the cursors already are, which is what every
// render path wants.
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
