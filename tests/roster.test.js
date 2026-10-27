const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./harness');

const app = createApp();
const call = (fn, ...args) => app.get(`${fn}(...${JSON.stringify(args)})`);

test('roster names shorten to first name and last initial', () => {
  assert.equal(call('parseNameEntry', 'Archer, Kelly Noel'), 'Kelly A.');
  assert.equal(call('parseNameEntry', '  "bagley, Norah Kathleen" '), 'Norah B.');
  assert.equal(call('parseNameEntry', 'Cache'), 'Cache');
  assert.equal(call('parseNameEntry', 'Bowman,'), 'Bowman');
  assert.equal(call('parseNameEntry', '   '), '');
});

test('kitchen count aims for 4 a kitchen, preferring 3s to 5s', () => {
  const sizes = n => call('groupNames', Array.from({length: n}, (_, i) => `s${i}`)).map(g => g.length);
  assert.deepEqual(sizes(12), [4, 4, 4]);
  assert.deepEqual(sizes(10), [4, 3, 3]);
  assert.deepEqual(sizes(27), [4, 4, 4, 4, 4, 4, 3]);
  assert.deepEqual(sizes(5), [5]);
  assert.equal(call('computeGroupCount', 0), 0);
  assert.equal(call('computeGroupCount', 2), 1);
  assert.equal(call('computeGroupCount', 41), 8);   // capped at the room's 8 kitchens
});

test('group sizes never differ by more than one', () => {
  for(let n = 1; n <= 40; n++){
    const sizes = call('groupNames', Array.from({length: n}, (_, i) => `s${i}`)).map(g => g.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `n=${n}: ${sizes}`);
    assert.ok(Math.max(...sizes) <= 5, `n=${n}: ${sizes}`);
  }
});

test('the Student column is found below a title row, and a BOM is ignored', () => {
  const csv = '﻿Previous Days,Student Information\r\n'
            + 'Period,Student,ID\r\n'
            + '1,"Archer, Kelly Noel",100\r\n'
            + '1,"Bagley, Norah",101\r\n'
            + '1,,102\r\n';
  assert.deepEqual(call('namesFromAttendanceCSV', csv), ['Archer, Kelly Noel', 'Bagley, Norah']);
});

test('an attendance file without a Student column says so', () => {
  assert.equal(call('namesFromAttendanceCSV', 'Name,ID\nKelly,1\n'),
               'Could not find a "Student" column in that file.');
  assert.equal(call('namesFromAttendanceCSV', ''), 'That file could not be read as CSV.');
});

test('CSV quoting round-trips through the parser', () => {
  const rows = [['a', 'b, c'], ['say "hi"', 'line\nbreak']];
  const text = app.get(`toCSV(${JSON.stringify(rows)})`);
  assert.ok(text.startsWith('﻿'));
  assert.deepEqual(call('parseCSV', text.slice(1)), rows);
});

test('importing a roster seats every student and resets the class', () => {
  const a = createApp();
  a.run(`importTargetBlock = 'A2'`);
  a.el('importText').value = Array.from({length: 22}, (_, i) => `Last${i}, First${i}`).join('\n');
  a.run('confirmImport()');
  const seated = a.get(`state.blocks.A2.kitchens.flatMap(k => k.students)`);
  assert.equal(seated.length, 22);
  assert.equal(new Set(seated).size, 22);
  assert.match(a.lastToast(), /Imported 22 students into 6 kitchens for A2/);
});

test('importing more students than the room holds says how many were left out', () => {
  const a = createApp();
  a.run(`importTargetBlock = 'A1'`);
  a.el('importText').value = Array.from({length: 45}, (_, i) => `S${i}`).join('\n');
  a.run('confirmImport()');
  assert.equal(a.get(`state.blocks.A1.kitchens.flatMap(k => k.students).length`), 40);
  assert.equal(a.lastToast(), 'Only 40 students fit in A1. 5 were left out.');
});
