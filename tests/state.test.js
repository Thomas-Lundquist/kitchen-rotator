const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./harness');

const KEY = 'kitchenRotationTool_v1';
const load = saved => createApp({ storage: { [KEY]: JSON.stringify(saved) } });

test('unreadable storage falls back to a fresh state', () => {
  const app = createApp({ storage: { [KEY]: '{not json' } });
  assert.deepEqual(app.get('Object.keys(state.blocks)'), ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
});

test('changes are saved to localStorage', () => {
  const app = createApp();
  app.setRoster('B2', [['x']]);
  const saved = JSON.parse(app.storage.get(KEY));
  assert.deepEqual(saved.blocks.B2.kitchens[0].students, ['x']);
});

test('a current-shape save without an attendance grid is repaired', () => {
  const app = load({
    blocks: { A1: { day: 'A', course: 2, kitchens: [{ students: ['a'], original: ['a'] }] } },
    duties: [], jobTitles: ['1', '2', '3', '4', '5'],
    slots: { A: ['A1'], B: [] }, nextNum: { A: 2, B: 1 }
  });
  assert.deepEqual(app.get('state.slots'), { A: ['A1', null, null, null], B: [null, null, null, null] });
  assert.equal(app.get('state.blocks.A1.absent.length'), 8);
  assert.equal(app.get('state.blocks.A1.absent[0].length'), 5);
  assert.deepEqual(app.get('state.jobTitles'), ['1', '2', '3', '4', '5']);
});

test('the superseded default job titles are upgraded', () => {
  const app = load({
    blocks: {}, duties: [], slots: { A: [], B: [] }, nextNum: { A: 1, B: 1 },
    jobTitles: ['Head Chef', 'Sous Chef', 'Prep Cook', 'Dishwasher', 'Cleanup Crew']
  });
  assert.deepEqual(app.get('state.jobTitles'), ['Manager', 'Head Chef', 'Sous Chef', 'Kitchen Porter', 'Dishwasher']);
});

test('the order-array save shape migrates to slots', () => {
  const app = load({
    blocks: { A1: { day: 'A' }, A2: { day: 'A' }, B1: { day: 'B' } },
    order: { A: ['A2', 'A1'], B: ['B1'] }, nextNum: { A: 3, B: 2 }, duties: [{ text: 'd', apply: {} }]
  });
  assert.deepEqual(app.get('state.slots'), { A: ['A2', 'A1', null, null], B: ['B1', null, null, null] });
  assert.deepEqual(app.get('state.nextNum'), { A: 3, B: 2 });
  assert.equal(app.get('state.duties.length'), 1);
});

test('the original slot-number save shape migrates to slots', () => {
  const app = load({
    blocks: { A1: { day: 'A', slot: 2 }, A4: { day: 'A', slot: 1 }, B1: { day: 'B', slot: 1 } }
  });
  assert.deepEqual(app.get('state.slots.A'), ['A4', 'A1', null, null]);
  assert.equal(app.get('state.nextNum.A'), 5);
  assert.equal(app.get('"slot" in state.blocks.A1'), false);
});

test("yesterday's absences expire on load", () => {
  const app = load({
    blocks: { A1: { day: 'A', kitchens: [{ students: ['a'], original: ['a'] }],
                    absent: [[true]], absentDate: '2000-01-01' } },
    duties: [], slots: { A: ['A1'], B: [] }, nextNum: { A: 2, B: 1 }
  });
  assert.equal(app.get('state.blocks.A1.absent[0][0]'), false);
  assert.equal(app.get('state.blocks.A1.absentDate'), '');
});

test('removing a class frees its period and deletes its records', () => {
  const app = createApp();
  app.setRoster('A2', [['a', 'b']]);
  app.setDuties(['d1'], ['A1', 'A2']);
  app.run(`advanceBlockAction('A2')`);
  app.run(`removeClass('A2')`);
  assert.deepEqual(app.get('state.slots.A'), ['A1', null, 'A3', null]);
  assert.equal(app.get('state.blocks.A2'), undefined);
  assert.deepEqual(app.get('state.duties[0].apply'), { A1: true });
  assert.equal(app.get('historyCount()'), 0);
});

test('a new class takes the next unused number', () => {
  const app = createApp();
  app.run(`startNewClass('A', 3)`);
  assert.equal(app.get('state.slots.A[3]'), 'A4');
  assert.equal(app.get('state.nextNum.A'), 5);
});

test('moving a class onto an occupied period swaps the two', () => {
  const app = createApp();
  app.run(`updatePosition('A1', '3')`);
  assert.deepEqual(app.get('state.slots.A'), ['A3', 'A2', 'A1', null]);
});

test('typing SPLIT into a seat stores an empty seat', () => {
  const app = createApp();
  app.setRoster('A1', [['a', 'b']]);
  app.run(`updateSeat('A1', 0, 1, 'split')`);
  assert.deepEqual(app.students('A1', 0), ['a', '']);
});
