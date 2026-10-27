// --- FULLSCREEN BOARD: the classroom display, bell timers and text fitting ---

// Bell schedule
// Position within a day (1st, 2nd, 3rd, 4th block of that day) maps
// directly to these times, regardless of A or B day — both day types use
// the same four daily time blocks (e.g. "1A/5B" share one time slot).
// Typos in the source schedule (4th block listed as "am") corrected to PM.
const BELL_SCHEDULES = {
  monThu: { label:'Monday–Thursday', blocks: [
    {start:'07:30', end:'08:55'},
    {start:'09:01', end:'10:33'},
    {start:'11:14', end:'12:39'},
    {start:'12:45', end:'14:10'}
  ]},
  friday: { label:'Friday (Late Start)', blocks: [
    {start:'08:30', end:'09:42'},
    {start:'09:48', end:'11:00'},
    {start:'11:40', end:'12:52'},
    {start:'12:58', end:'14:10'}
  ]}
};
const CLEANUP_LEAD_MIN = 10;

function defaultScheduleKey(){
  return new Date().getDay() === 5 ? 'friday' : 'monThu';
}

let fullscreenScheduleKey = defaultScheduleKey();
let fullscreenBlockId = null;
let fullscreenTimer = null;

function timeStrToDateToday(hhmm){
  const [h,m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatFullscreenDate(d){
  return d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
}

function formatCountdown(ms){
  if(ms < 0) ms = 0;
  const totalSec = Math.floor(ms/1000);
  const m = Math.floor(totalSec/60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function openFullscreen(blockId){
  fullscreenBlockId = blockId;
  // Must become visible BEFORE rendering: the font-fitting pass measures
  // element widths/heights, and everything measures 0 while display:none,
  // which makes every size appear to "fit" and pins text at maximum size.
  document.getElementById('fullscreenOverlay').classList.add('show');
  renderFullscreen();
  if(fullscreenTimer) clearInterval(fullscreenTimer);
  fullscreenTimer = setInterval(updateFullscreenTimers, 1000);
}

function closeFullscreen(){
  document.getElementById('fullscreenOverlay').classList.remove('show');
  if(fullscreenTimer){ clearInterval(fullscreenTimer); fullscreenTimer = null; }
  fullscreenBlockId = null;
}

function changeFullscreenSchedule(val){
  fullscreenScheduleKey = val;
  updateFullscreenTimers();
}

function renderFullscreen(){
  const block = state.blocks[fullscreenBlockId];
  if(!block) return;
  refreshDuties(fullscreenBlockId, false);   // also expires yesterday's absences

  const label = blockLabel(fullscreenBlockId);
  const active = activeKitchenIdxs(block);
  const staffed = staffedKitchenIdxs(block);
  // Display row -> stored seat, per kitchen. Identity when nobody is out.
  const orders = {};
  active.forEach(ki=>{ orders[ki] = seatOrder(block, ki); });

  // Shared-label grid: job titles appear ONCE down the left column instead
  // of repeated inside every kitchen — same pattern as the main page. This
  // gives each kitchen's name column the full row width to itself, since it
  // no longer has to share space with a title string, so names can be sized
  // dramatically larger. Cells are emitted row-major so CSS Grid auto-aligns
  // every row's height across all kitchens (duty text wrapping in one
  // kitchen no longer drags that row out of line with the others).
  let gridHtml = '';
  if(active.length > 0){
    // minmax(0,1fr) caps each kitchen column at an EQUAL share of the width
    // so long names can't push a column wider than its fraction (which was
    // causing the grid to run off-screen). The label column is a fixed width.
    // Job rows nobody fills still render — they read SPLIT, which is what tells
    // the kitchen that work is shared — but at half height. With e.g. 27
    // students in 7 kitchens nobody has a 5th seat, so a full-height Dishwasher
    // row would eat height the real name rows could be using.
    let usedRows = 0;
    for(let r=0; r<MAX_KITCHEN; r++){
      if(active.some(ki => isRealStudent(block.kitchens[ki].students[orders[ki][r]]))) usedRows = r + 1;
    }
    if(usedRows === 0) usedRows = 1;
    const splitRows = MAX_KITCHEN - usedRows;

    const cols = `minmax(0,240px) repeat(${active.length}, minmax(0,1fr))`;
    // All rows are fr fractions (min 0) so they ALWAYS sum to exactly the
    // grid's height and can never be pushed past it by their content. The
    // header and each used name row give up 1/8 of their height (0.7->0.6125,
    // 1->0.875); duty gets all of that back on top of its base 1.1 so the
    // extra-duty text has more room to grow legible. Sink stays at 0.7.
    const dutyFr = 1.1 + (0.7 - 0.6125) + usedRows * (1 - 0.875);
    const rows = `minmax(0,0.6125fr) repeat(${usedRows}, minmax(0,0.875fr))`
      + (splitRows > 0 ? ` repeat(${splitRows}, minmax(0,0.5fr))` : '')
      + ` minmax(0,${dutyFr}fr) minmax(0,0.7fr)`;
    gridHtml += `<div class="fs-grid" style="grid-template-columns:${cols}; grid-template-rows:${rows}">`;

    gridHtml += `<div class="fs-ghead">&nbsp;</div>`;
    active.forEach(ki=>{ gridHtml += `<div class="fs-ghead">K${ki+1}</div>`; });

    for(let r=0; r<MAX_KITCHEN; r++){
      const splitRow = r >= usedRows;
      gridHtml += `<div class="fs-glabel ${splitRow?'fs-glabel-split':''}">${escapeHtml(state.jobTitles[r])}</div>`;
      active.forEach(ki=>{
        const ci = orders[ki][r];
        const name = block.kitchens[ki].students[ci];
        if(!isRealStudent(name)){ gridHtml += `<div class="fs-gsplit">SPLIT</div>`; return; }
        // Out today: the name stays at full size and a veil lies ON TOP of the
        // cell. An overlay takes no height from the grid, where a stacked
        // ABSENT line would have cost every other name on the board a row.
        gridHtml += isAbsent(block, ki, ci)
          ? `<div class="fs-gname fs-gaway">${escapeHtml(name)}<span class="fs-away-veil"><b>ABSENT</b><i>SPLIT</i></span></div>`
          : `<div class="fs-gname">${escapeHtml(name)}</div>`;
      });
    }

    gridHtml += `<div class="fs-glabel fs-glabel-duty">Extra Duty</div>`;
    active.forEach(ki=>{
      // A kitchen with nobody in today draws no duty at all, rather than
      // "None" — there is a difference between no duty and no one to do it.
      if(!staffed.includes(ki)){ gridHtml += `<div class="fs-gduty fs-gduty-out">&nbsp;</div>`; return; }
      const dutyText = (block._dutyDisplay && block._dutyDisplay[ki]) || '';
      gridHtml += `<div class="fs-gduty">${dutyText ? escapeHtml(dutyText) : 'None'}</div>`;
    });

    gridHtml += `<div class="fs-glabel">Center Sink</div>`;
    active.forEach(ki=>{
      const hasSink = staffed.includes(ki) && !!(block._centerSinkDisplay && block._centerSinkDisplay[ki]);
      gridHtml += `<div class="fs-gsink ${hasSink?'active':''}">${hasSink ? ICON_DROPLET+' Center Sink' : ''}</div>`;
    });

    gridHtml += `</div>`;
  } else {
    gridHtml = '<div class="fs-empty">No kitchens in use for this block.</div>';
  }

  const scheduleOptions = Object.keys(BELL_SCHEDULES).map(key=>
    `<option value="${key}" ${fullscreenScheduleKey===key?'selected':''}>${escapeHtml(BELL_SCHEDULES[key].label)}</option>`).join('');

  document.getElementById('fsContent').innerHTML = `
    <div class="fs-header">
      <div class="fs-label"><span class="fs-label-id">${label}</span><span class="fs-label-class">${escapeHtml(block.className)}</span></div>
      <div class="fs-date" id="fsDate">${formatFullscreenDate(new Date())}</div>
      <div class="fs-header-controls">
        <div class="fs-schedule-picker">
          <select onchange="changeFullscreenSchedule(this.value)">${scheduleOptions}</select>
        </div>
        <button class="btn-outline" onclick="closeFullscreen()">${ICON_CLOSE} Close</button>
      </div>
    </div>
    <div class="fs-timers" id="fsTimers"></div>
    ${gridHtml}
  `;
  updateFullscreenTimers();
  fitFullscreen();
}

// Fullscreen fit-to-screen
// fitJobRows() runs after every render: since the job title appears only once
// per row (in the shared label column) instead of inside every kitchen's cell,
// each text role — names, labels, kitchen headers, duties, sinks — gets its
// own max-fit: one shared font size per role, as LARGE as possible while
// every cell of that role still fits. Names get the most room since they no
// longer compete with title text for space.
//
// The grid box is locked to the screen first (full width via width:100vw,
// full leftover height via flex + fixed row fractions), so every cell has a
// real, final width AND height BEFORE any font is sized. There is no page
// scaling anymore — the earlier scale transform is exactly what was shrinking
// everything toward one corner. We just grow each text role's font as large
// as fits its cells in BOTH dimensions.

// Returns true if EVERY element fits inside its cell (no overflow) in both
// width and height at whatever font size is currently applied. A 1px
// tolerance absorbs sub-pixel rounding.
function allFit(elements){
  for(const el of elements){
    // A zero-sized cell means layout isn't ready (e.g. still display:none).
    // Treat that as "doesn't fit" so the search can't conclude that every
    // size fits and pin text at the maximum.
    if(el.clientWidth <= 0 || el.clientHeight <= 0) return false;
    if(el.scrollWidth > el.clientWidth + 1) return false;
    if(el.scrollHeight > el.clientHeight + 1) return false;
  }
  return true;
}

// Binary-searches for the LARGEST integer font size (between min and max)
// at which every element still fits its cell, then applies that one shared
// size to all of them — so names are uniform and none overflow. This
// replaces the old ratio estimate, which mis-measured at the trial size
// (integer rounding made fitting text report a ratio of exactly 1, so it
// never grew past the base size and long names overflowed).
function maxFitFontSize(elements, maxSizePx, minSizePx){
  if(elements.length === 0) return maxSizePx;

  let lo = minSizePx, hi = maxSizePx, best = minSizePx;
  while(lo <= hi){
    const mid = Math.floor((lo + hi) / 2);
    elements.forEach(el=>{ el.style.fontSize = mid + 'px'; });
    if(allFit(elements)){
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  elements.forEach(el=>{ el.style.fontSize = best + 'px'; });
  return best;
}

function fitJobRows(){
  const nameEls = Array.from(document.querySelectorAll('.fs-gname'));
  const labelEls = Array.from(document.querySelectorAll('.fs-glabel:not(.fs-glabel-split)'));
  const splitEls = Array.from(document.querySelectorAll('.fs-gsplit'));
  const splitLabelEls = Array.from(document.querySelectorAll('.fs-glabel-split'));
  const headEls = Array.from(document.querySelectorAll('.fs-ghead'));
  const dutyEls = Array.from(document.querySelectorAll('.fs-gduty'));
  const sinkEls = Array.from(document.querySelectorAll('.fs-gsink'));

  // Each role is measured against its own cells (now fixed in both
  // dimensions) and grown to the largest size that fits every one of them.
  // SPLIT cells are measured apart from names on purpose: one shared fit across
  // both would measure the half-height SPLIT row and drag every real name down
  // to that size.
  maxFitFontSize(nameEls, 220, 14);
  const labelPx = maxFitFontSize(labelEls, 90, 12);
  maxFitFontSize(splitEls, 90, 10);
  // Capped at the shared job-label size: left to its own fit, a short word like
  // "Dishwasher" in a half-height row grows LARGER than "Kitchen Porter" above
  // it, which reads as emphasis on exactly the row we are de-emphasising.
  maxFitFontSize(splitLabelEls, Math.max(10, labelPx), 10);
  maxFitFontSize(headEls, 110, 12);
  maxFitFontSize(dutyEls, 56, 10);
  maxFitFontSize(sinkEls, 36, 10);
}

function fitFullscreen(){
  // Two passes: the first sizes fonts; applying them can nudge a wrapping
  // cell's height, so a second pass re-measures against the settled layout.
  fitJobRows();
  requestAnimationFrame(fitJobRows);
}

window.addEventListener('resize', ()=>{
  if(fullscreenBlockId) fitFullscreen();
});

// Web fonts arrive after first paint, and the fullscreen fitter sizes text by
// measuring it. A measurement taken against fallback metrics produces the
// wrong size the moment the real face swaps in, so re-fit once fonts settle.
// Wrapped in a guard because document.fonts is absent in older engines, and
// the promise rejects if a font fails to load (offline, or a blocked domain)
// in which case the fallback stack is already correct and no re-fit is needed.
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(()=>{
    if(fullscreenBlockId) fitFullscreen();
  }).catch(()=>{});
}

function updateFullscreenTimers(){
  const dateEl = document.getElementById('fsDate');
  if(dateEl) dateEl.textContent = formatFullscreenDate(new Date());

  const timersEl = document.getElementById('fsTimers');
  if(!timersEl || !fullscreenBlockId) return;
  const block = state.blocks[fullscreenBlockId];
  if(!block) return;
  const posIdx = state.slots[block.day].indexOf(fullscreenBlockId);
  const schedule = BELL_SCHEDULES[fullscreenScheduleKey];
  const blockTimes = schedule.blocks[posIdx];

  if(!blockTimes){
    timersEl.innerHTML = `<div class="fs-timer-card fs-na">No bell time set for position ${posIdx+1}. This schedule covers the four standard daily blocks.</div>`;
    return;
  }

  const now = new Date();
  const end = timeStrToDateToday(blockTimes.end);
  const cleanupStart = new Date(end.getTime() - CLEANUP_LEAD_MIN*60000);
  const msToEnd = end - now;
  const msToCleanup = cleanupStart - now;
  const classOver = msToEnd <= 0;
  const pastCleanup = !classOver && msToCleanup <= 0;

  timersEl.innerHTML = `
    <div class="fs-timer-card ${pastCleanup?'fs-alert':''}">
      <div class="fs-timer-label">Time until cleanup bell</div>
      <div class="fs-timer-value">${classOver ? 'Done' : (pastCleanup ? 'Clean up now' : formatCountdown(msToCleanup))}</div>
    </div>
    <div class="fs-timer-card ${classOver?'fs-over':''}">
      <div class="fs-timer-label">Time left in class</div>
      <div class="fs-timer-value">${classOver ? 'Class ended' : formatCountdown(msToEnd)}</div>
    </div>
  `;
}
