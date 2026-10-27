// --- CSV: reading attendance exports, writing participation records ---

// Minimal correct CSV parser: handles quoted fields, commas/newlines inside
// quotes, and "" escaped quotes. Needed because attendance exports quote
// fields like "Archer, Kelly Noel" (comma inside) and messy HTML-log cells.
function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ',') { row.push(field); field=''; }
      else if(c === '\r') { /* skip */ }
      else if(c === '\n') { row.push(field); rows.push(row); row=[]; field=''; }
      else field += c;
    }
  }
  if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
  return rows;
}

// Quote only where quoting is required. Deliberately no formula-injection
// guard: the usual fix prefixes a quote or space to anything starting with
// = + - @, which corrupts the student name this file exists to be matched on.
// Everything here is the teacher's own roster and their own typed duty text.
function csvField(v){
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rows){
  // CRLF and a UTF-8 BOM, or Excel on Windows mangles accented names. The
  // attendance import strips a leading BOM, so the tool can reread its own
  // exports.
  return '﻿' + rows.map(r=>r.map(csvField).join(',')).join('\r\n') + '\r\n';
}
