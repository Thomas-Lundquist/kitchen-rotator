const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./harness');

test('a record credits each job to the student who held it on screen', () => {
  const app = createApp();
  app.setRoster('A1', [['a', 'b', 'c']]);
  // 'a' is out, so b and c move up into Manager and Head Chef for the day.
  app.run(`setAbsent(state.blocks.A1, 0, 0, true)`);
  const rec = app.get(`buildRotationRecord('A1', 'batch1')`);
  assert.deepEqual(rec.k[0].s, ['b', 'c', 'a', '', '']);
  assert.deepEqual(rec.k[0].ab, [2]);
  assert.equal(rec.b, 'batch1');
});

test('a class with nobody in it produces no record', () => {
  const app = createApp();
  assert.equal(app.get(`buildRotationRecord('A1', 'x')`), null);
});

test('participation rows mark absences and skip SPLIT jobs', () => {
  const app = createApp();
  app.setRoster('A1', [['a', 'b']]);
  app.setDuties(['Sweep'], ['A1']);
  app.run(`setAbsent(state.blocks.A1, 0, 1, true)`);
  app.run(`advanceBlockAction('A1')`);
  const rows = app.get(`buildParticipationRows(['A1'])`);
  assert.equal(rows.length, 3);   // header + two students
  const [, first, second] = rows;
  assert.deepEqual(first.slice(1), ['A', 'A1', 'Culinary 2', 'K1', 'Manager', 'a', 'Present', 'Sweep', 'Yes']);
  assert.deepEqual(second.slice(5, 8), ['Head Chef', 'b', 'Absent']);
});

test('records keep the job titles in force on the day', () => {
  const app = createApp();
  app.setRoster('A1', [['a']]);
  app.run(`advanceBlockAction('A1')`);
  app.run(`updateJobTitle(0, 'Boss')`);
  app.run(`advanceBlockAction('A1')`);
  const titles = app.get(`buildParticipationRows(['A1']).slice(1).map(r => r[5])`);
  assert.deepEqual(titles, ['Manager', 'Boss']);
  assert.equal(app.get('historyStore.titleSets.length'), 2);
});

test('each class keeps at most HISTORY_CAP records', () => {
  const app = createApp();
  app.setRoster('A1', [['a']]);
  const cap = app.get('HISTORY_CAP');
  app.run(`for(let i = 0; i < ${cap + 5}; i++) appendHistory([buildRotationRecord('A1', 'b' + i)])`);
  assert.equal(app.get(`historyFor('A1').length`), cap);
  assert.equal(app.get(`historyFor('A1')[0].b`), 'b5');
});

test('history survives a reload, and junk in storage is dropped', () => {
  const app = createApp();
  app.setRoster('A1', [['a']]);
  app.run(`advanceBlockAction('A1')`);
  const stored = JSON.parse(app.storage.get('kitchenRotationTool_history_v1'));
  stored.records.A1.push(null, { no: 'k' });
  stored.records.B1 = 'nonsense';

  const reloaded = createApp({ storage: {
    kitchenRotationTool_v1: app.storage.get('kitchenRotationTool_v1'),
    kitchenRotationTool_history_v1: JSON.stringify(stored)
  }});
  assert.equal(reloaded.get(`historyFor('A1').length`), 1);
  assert.equal(reloaded.get(`historyStore.records.B1`), undefined);
});
