// --- KEYBOARD: Escape, undo shortcut, and seat-grid navigation ---

document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    // Topmost first: the fullscreen board can sit over an open modal.
    if(fullscreenBlockId){ closeFullscreen(); return; }
    if(document.getElementById('absenceModalBg').classList.contains('show')){ closeAbsenceModal(); return; }
    if(document.getElementById('historyModalBg').classList.contains('show')){ closeHistoryModal(); return; }
    if(document.getElementById('importModalBg').classList.contains('show')){ closeImportModal(); return; }
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
