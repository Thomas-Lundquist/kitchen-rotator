// --- SHARED HELPERS ---
// Small pieces with no knowledge of the app's state, used across every file.

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// For text placed inside a double-quoted attribute, e.g. value="...". The
// ampersand goes first, or a name typed as "R&amp;D" would read back as "R&D".
function escapeAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }

// LOCAL calendar date, not toISOString(): that reports UTC, which in a US
// timezone has already rolled over to tomorrow by late afternoon. A rotation
// at the end of a 3pm class would have been filed under the next day, and
// absences would have expired mid-afternoon.
function dateStamp(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayStamp(){ return dateStamp(new Date()); }

// "2026-10-08" -> "Thu, Oct 8". Built from the parts rather than new Date(iso),
// which would parse a bare date as UTC midnight and show the day before.
function formatHistoryDate(iso){
  const parts = String(iso).split('-');
  if(parts.length !== 3) return iso;
  const d = new Date(+parts[0], +parts[1]-1, +parts[2]);
  return isNaN(d) ? iso : d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 3200);
}

// The one way this tool hands a file to the browser, shared by the JSON backup
// and the participation CSV. A blob URL plus a detached anchor is what the CSP
// allows: connect-src 'none' rules out uploading anything anywhere.
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
