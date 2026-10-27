// --- HISTORY UI: one class's rotation history modal ---

let historyTargetBlock = null;
let historyFilter = 'all';

function openHistoryModal(blockId){
  historyTargetBlock = blockId;
  const block = state.blocks[blockId];
  document.getElementById('historyModalTitle').textContent =
    `Rotation history — ${blockLabel(blockId)} ${block.className}`;
  setHistoryFilter('all');
  document.getElementById('historyModalBg').classList.add('show');
}

function closeHistoryModal(){
  document.getElementById('historyModalBg').classList.remove('show');
  historyTargetBlock = null;
}

function setHistoryFilter(which){
  historyFilter = which;
  document.getElementById('histAll').classList.toggle('on', which === 'all');
  document.getElementById('histWeek').classList.toggle('on', which === 'week');
  renderHistoryBody();
}

function renderHistoryBody(){
  const recs = historyFor(historyTargetBlock).slice().reverse();   // newest first
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const cutoff = dateStamp(weekAgo);
  const shown = historyFilter === 'week' ? recs.filter(r=>r.d >= cutoff) : recs;

  const body = document.getElementById('historyBody');
  if(shown.length === 0){
    body.innerHTML = `<p class="hint">${recs.length === 0
      ? 'Nothing recorded for this class yet. A record is written each time it rotates.'
      : 'Nothing in the last seven days.'}</p>`;
    return;
  }

  body.innerHTML = shown.map(rec=>{
    const titles = historyStore.titleSets[rec.ts] || state.jobTitles;
    const kitchens = rec.k.map(kr=>{
      const absent = new Set(kr.ab || []);
      const held = kr.s.map((name, row)=> !isRealStudent(name) ? '' :
          `${escapeHtml(name)} <span class="${absent.has(row)?'hist-absent':''}">(${escapeHtml(titles[row] || ('Seat '+(row+1)))}${absent.has(row)?', out':''})</span>`)
        .filter(Boolean).join(', ');
      const bits = [];
      if(kr.du) bits.push(`<span class="hist-duty">${escapeHtml(kr.du)}</span>`);
      if(kr.cs) bits.push(`<span class="hist-sink">Center Sink</span>`);
      return `<div class="hist-k"><b>K${kr.i+1}</b> — ${bits.join(' · ') || 'no duty'}<br>${held}</div>`;
    }).join('');
    return `<div class="hist-entry"><div class="hist-date">${escapeHtml(formatHistoryDate(rec.d))}</div>${kitchens}</div>`;
  }).join('');
}
