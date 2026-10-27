const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./harness');

test('advancing moves everyone down one job and the bottom name to the top', () => {
  const app = createApp();
  app.setRoster('A1', [['a', 'b', 'c', 'd']]);
  app.run(`advanceBlock('A1')`);
  assert.deepEqual(app.students('A1', 0), ['d', 'a', 'b', 'c']);
  app.run(`advanceBlock('A1')`);
  assert.deepEqual(app.students('A1', 0), ['c', 'd', 'a', 'b']);
});

test('a short kitchen re-seats from the top so blanks stay at the bottom', () => {
  const app = createApp();
  app.setRoster('A1', [['a', '', 'b', '', '']]);
  app.run(`advanceBlock('A1')`);
  assert.deepEqual(app.students('A1', 0), ['b', 'a', '', '', '']);
});

test('a rotation clears attendance and moves the duty cursor', () => {
  const app = createApp();
  app.setRoster('A1', [['a', 'b'], ['c', 'd']]);
  app.setDuties(['d1', 'd2', 'd3'], ['A1']);
  app.run(`setAbsent(state.blocks.A1, 0, 1, true)`);
  app.run(`advanceBlock('A1')`);
  assert.equal(app.get('state.blocks.A1.dutyIndex'), 1);
  assert.equal(app.get('state.blocks.A1.centerSink'), 1);
  assert.equal(app.get('state.blocks.A1.absent.flat().some(Boolean)'), false);
});

test('a class with everyone out still turns its seats but keeps its duty', () => {
  const app = createApp();
  app.setRoster('A1', [['a', 'b']]);
  app.setDuties(['d1', 'd2'], ['A1']);
  app.run(`setAbsent(state.blocks.A1, 0, 0, true); setAbsent(state.blocks.A1, 0, 1, true)`);
  app.run(`advanceBlock('A1')`);
  assert.deepEqual(app.students('A1', 0), ['b', 'a']);
  assert.equal(app.get('state.blocks.A1.dutyIndex'), 0);
  assert.equal(app.get('state.blocks.A1.centerSink'), 0);
});

test('Rotate A Day advances every A class, records history, and can be undone', () => {
  const app = createApp();
  app.setRoster('A1', [['a', 'b']]);
  app.setRoster('A2', [['c', 'd']]);
  app.run(`rotateDay('A')`);
  assert.deepEqual(app.students('A1', 0), ['b', 'a']);
  assert.deepEqual(app.students('A2', 0), ['d', 'c']);
  assert.equal(app.get('historyCount()'), 2);   // A3 is empty, so it is not recorded
  assert.equal(app.el('undoBtn').textContent, 'Undo: Rotate A Day');

  app.run('undoLastRotation()');
  assert.deepEqual(app.students('A1', 0), ['a', 'b']);
  assert.deepEqual(app.students('A2', 0), ['c', 'd']);
  assert.equal(app.get('historyCount()'), 0);
  assert.equal(app.get('lastRotation'), null);
});

test('undo keeps attendance taken after the rotation, by name', () => {
  const app = createApp();
  app.setRoster('A1', [['a', 'b', 'c']]);
  app.run(`advanceBlockAction('A1')`);                 // c, a, b
  app.run(`setAbsent(state.blocks.A1, 0, 1, true)`);   // 'a' is out
  app.run('undoLastRotation()');                       // a, b, c
  assert.deepEqual(app.students('A1', 0), ['a', 'b', 'c']);
  assert.deepEqual(app.get('state.blocks.A1.absent[0]'), [true, false, false, false, false]);
});

test('rotating the same day twice asks first, and a "no" changes nothing', () => {
  const asked = [];
  let answer = false;
  const app = createApp({ confirm: msg => { asked.push(msg); return answer; } });
  app.setRoster('A1', [['a', 'b']]);
  app.run(`rotateDay('A')`);
  assert.equal(asked.length, 0);

  app.run(`rotateDay('A')`);
  assert.equal(asked.length, 1);
  assert.deepEqual(app.students('A1', 0), ['b', 'a']);
  assert.equal(app.get('historyCount()'), 1);

  answer = true;
  app.run(`rotateDay('A')`);
  assert.deepEqual(app.students('A1', 0), ['a', 'b']);
  assert.equal(app.get('historyCount()'), 2);
});

test('restore to original puts back the saved seating and resets the cursors', () => {
  const app = createApp();
  app.setRoster('A1', [['a', 'b', 'c']]);
  app.setDuties(['d1', 'd2'], ['A1']);
  app.run(`advanceBlock('A1'); advanceBlock('A1')`);
  app.run(`restoreBlockOriginal('A1')`);
  assert.deepEqual(app.students('A1', 0), ['a', 'b', 'c']);
  assert.equal(app.get('state.blocks.A1.dutyIndex'), 0);
  assert.equal(app.get('lastRotation'), null);
});

test('toasts name the period a class sits in, not its internal id', () => {
  const app = createApp();
  app.setRoster('A1', [['a', 'b']]);
  app.run(`updatePosition('A1', '4')`);   // A1 moves into the empty fourth period
  app.run(`restoreBlockOriginal('A1')`);
  assert.equal(app.lastToast(), 'A4: restored to saved original.');
});
