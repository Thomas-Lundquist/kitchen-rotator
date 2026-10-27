// --- SETTINGS TAB: duties, job titles, records, backup ---

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
  let html = '<tr><th>Duty</th>' + ids.map(id=>`<th>${blockLabel(id)}</th>`).join('') + '<th></th></tr>';
  state.duties.forEach((d, idx)=>{
    html += `<tr>
      <td><input type="text" value="${escapeAttr(d.text)}" onchange="updateDutyText(${idx}, this.value)"></td>
      ${ids.map(id=>`<td><input type="checkbox" ${d.apply[id]?'checked':''} onchange="toggleDutyApply(${idx}, '${id}', this.checked)"></td>`).join('')}
      <td><button class="btn-danger" onclick="removeDuty(${idx})" aria-label="Remove duty">${ICON_TRASH_SOLO}</button></td>
    </tr>`;
  });
  if(state.duties.length === 0){
    html += `<tr><td colspan="${ids.length + 2}">No duties yet. Add one below.</td></tr>`;
  }
  tbl.innerHTML = html;
}

// Job titles
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

// Participation records
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

// Backup and restore (manual, local file)
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
      lastRotation = null;   // its snapshot describes the roster just replaced
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
