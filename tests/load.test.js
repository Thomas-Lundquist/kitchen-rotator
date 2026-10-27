const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp, scriptPaths, ROOT } = require('./harness');

test('index.html lists only scripts that exist, ending with main.js', () => {
  const srcs = scriptPaths();
  assert.ok(srcs.length > 1);
  for(const src of srcs) assert.ok(fs.existsSync(path.join(ROOT, src)), `${src} is missing`);
  assert.equal(srcs[srcs.length - 1], 'js/main.js');
});

test('every js/ file is loaded by index.html', () => {
  const listed = new Set(scriptPaths());
  for(const f of fs.readdirSync(path.join(ROOT, 'js'))){
    assert.ok(listed.has(`js/${f}`), `js/${f} is never loaded`);
  }
});

test('a fresh browser starts with the default six classes and renders', () => {
  const app = createApp();
  assert.deepEqual(app.get('state.slots'), { A: ['A1','A2','A3',null], B: ['B1','B2','B3',null] });
  assert.match(app.el('panel-A').innerHTML, /data-block-card="A1"/);
  assert.match(app.el('panel-A').innerHTML, /A4 prep period/);
});

test('a populated class renders on the board and on the fullscreen view', () => {
  const app = createApp();
  app.setRoster('A1', [['Kelly A.', 'Norah B.', 'Cache B.'], ['Dan C.']]);
  app.setDuties(['Wipe shelves'], ['A1']);
  app.run('render()');
  const panel = app.el('panel-A').innerHTML;
  assert.match(panel, /value="Kelly A\."/);
  assert.match(panel, /placeholder="SPLIT"/);

  app.run(`openFullscreen('A1')`);
  const fs = app.el('fsContent').innerHTML;
  assert.match(fs, /Kelly A\./);
  assert.match(fs, /Wipe shelves/);
  assert.match(fs, /<option value="friday"/);
  app.run('closeFullscreen()');
});

test('user text is escaped where it is rendered', () => {
  const app = createApp();
  app.setRoster('A1', [['<b>x</b>', 'Tom "T" & Co']]);
  app.run('render()');
  // Inside a quoted attribute only " and & need escaping.
  assert.match(app.el('panel-A').innerHTML, /value="Tom &quot;T&quot; &amp; Co"/);
  // As element text, markup must not survive.
  app.run(`openFullscreen('A1')`);
  const fs = app.el('fsContent').innerHTML;
  assert.ok(!fs.includes('<b>x</b>'));
  assert.match(fs, /&lt;b&gt;x&lt;\/b&gt;/);
});
