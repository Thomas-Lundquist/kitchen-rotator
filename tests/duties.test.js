const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./harness');

const full = n => Array.from({length: n}, (_, i) => [`s${i}a`, `s${i}b`, `s${i}c`]);

test('one physical kitchen never draws the same duty twice in a day', () => {
  const app = createApp();
  ['A1', 'A2', 'A3'].forEach(id => app.setRoster(id, full(4)));
  app.setDuties(['d1', 'd2', 'd3', 'd4'], ['A1', 'A2', 'A3']);

  for(let day = 0; day < 6; day++){
    const byBlock = app.get(`assignDayDuties('A')`);
    for(let ki = 0; ki < 4; ki++){
      const drawn = ['A1', 'A2', 'A3'].map(id => byBlock[id][ki]);
      assert.equal(new Set(drawn).size, 3, `rotation ${day}, K${ki+1} drew ${drawn}`);
    }
    app.run(`state.slots.A.filter(Boolean).forEach(id => advanceBlock(id))`);
  }
});

test('two kitchens in one block get different duties when the pool allows', () => {
  const app = createApp();
  app.setRoster('A1', full(3));
  app.setDuties(['d1', 'd2', 'd3'], ['A1']);
  const out = app.get(`assignDayDuties('A').A1`);
  assert.equal(new Set(Object.values(out)).size, 3);
});

test('a kitchen with everyone out draws no duty', () => {
  const app = createApp();
  app.setRoster('A1', [['a'], ['b']]);
  app.setDuties(['d1', 'd2'], ['A1']);
  app.run(`setAbsent(state.blocks.A1, 1, 0, true); refreshDuties('A1', false)`);
  const display = app.get('state.blocks.A1._dutyDisplay');
  assert.ok(display[0]);
  assert.equal(display[1], undefined);
});

test('paired kitchens take turns at the center sink', () => {
  const app = createApp();
  app.setRoster('A1', full(2));   // K1 and K2 share a sink
  app.run(`refreshDuties('A1', false)`);
  assert.deepEqual(app.get('state.blocks.A1._centerSinkDisplay'), { 0: true, 1: false });
  app.run(`refreshDuties('A1', true)`);
  assert.deepEqual(app.get('state.blocks.A1._centerSinkDisplay'), { 0: false, 1: true });
});

test('a kitchen whose sink partner is empty keeps the sink every rotation', () => {
  const app = createApp();
  // Only K5 and K7 staffed; their partners K6 and K8 are empty.
  app.setRoster('A1', [[], [], [], [], ['a'], [], ['b']]);
  for(let i = 0; i < 3; i++){
    app.run(`refreshDuties('A1', true)`);
    assert.deepEqual(app.get('state.blocks.A1._centerSinkDisplay'), { 4: true, 6: true });
  }
});
