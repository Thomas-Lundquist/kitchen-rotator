// --- BOARD: the A/B day panels, class cards and seat editing ---

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

function render(){
  renderDayPanel('A');
  renderDayPanel('B');
  renderDutyTable();
  renderJobTitleTable();
  renderHistorySection();
  refreshUndoBtn();
  if(fullscreenBlockId) renderFullscreen();
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
    // Populates _dutyDisplay without moving the rotation, and expires
    // yesterday's absences before anything below reads them.
    refreshDuties(id, false);
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

    // Duty row — tallest cell in this row (e.g. a long wrapped duty) sets the
    // height for the WHOLE row, so every kitchen's row stays level.
    html += `<div class="duty label-row">Extra Duty</div>`;
    for(let ki=0; ki<NUM_KITCHENS; ki++){
      const isEmpty = !active.includes(ki);
      const dutyText = (block._dutyDisplay && block._dutyDisplay[ki]) || '';
      html += `<div class="duty ${isEmpty?'empty':''}" data-k="${ki}">${dutyText ? escapeHtml(dutyText) : ''}</div>`;
    }

    // Center Sink row — same row-level height rule as the duty row.
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

// --- CLASS EDITING ---

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
  const label = blockLabel(blockId);

  const ok = confirm(`Remove the class at ${label}? This deletes its roster, its duty rotation and its participation records, and makes ${label} a prep period. Export the participation CSV first if you still need it. This can't be undone (unless you have a backup).`);
  if(!ok){ render(); return; }   // puts the period dropdown back if that is what asked

  state.slots[day][posIdx] = null;
  delete state.blocks[blockId];
  state.duties.forEach(d=>{ delete d.apply[blockId]; });
  deleteBlockHistory(blockId);   // the confirm above promises this
  lastRotation = null;
  saveState();
  render();
  showToast(`${label} is now a prep period.`);
}

function updateCourse(blockId, val){
  const block = state.blocks[blockId];
  block.course = parseInt(val, 10);
  block.className = block.course === 2 ? 'Culinary 2' : 'Culinary 1';
  saveState();
  render();
}

// `ci` is the STORED seat index (data-ci), not the display row.
function updateSeat(blockId, kIdx, ci, val){
  const k = state.blocks[blockId].kitchens[kIdx];
  while(k.students.length <= ci) k.students.push('');
  // SPLIT is derived now, so typing it by hand just clears the seat: the cell
  // shows the marker either way and the saved data stays honest about who is
  // actually in the kitchen.
  k.students[ci] = isSplit(val) ? '' : val;
  // An emptied seat holds nobody, so it cannot hold an absence either. Renaming
  // one keeps the mark, which is what fixing a typo in an absent name needs.
  if(!isRealStudent(k.students[ci])) absentRow(state.blocks[blockId], kIdx)[ci] = false;
  saveState();
  // In-place, so the SPLIT markers and duty row keep up as you type without the
  // focused input being torn out from under you. The full-screen view is a
  // separate DOM, so rebuilding that one is harmless.
  refreshBlockChrome(blockId);
  if(fullscreenBlockId === blockId) renderFullscreen();
}

// --- DROPDOWN MENU ---
// One shared menu element, filled per use: the class card's kebab menu and the
// right-click menu on a seat.

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
    <button onclick="saveBlockOriginal('${id}');">${ICON_SAVE}Save as original</button>
    <button onclick="restoreBlockOriginal('${id}');">${ICON_RESTORE}Restore to original</button>
    <button onclick="openImportModal('${id}');">${ICON_IMPORT}Import roster</button>
    <button onclick="removeClass('${id}');" style="color:var(--bad);">${ICON_TRASH}Remove this class</button>
  `;
}
