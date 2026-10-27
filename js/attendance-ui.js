// --- ATTENDANCE UI: the register modal and the seat right-click menu ---

let absenceTargetBlock = null;

function openAbsenceModal(blockId){
  absenceTargetBlock = blockId;
  const block = state.blocks[blockId];
  document.getElementById('absenceModalTitle').textContent =
    `Attendance — ${blockLabel(blockId)} ${block.className}`;
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
