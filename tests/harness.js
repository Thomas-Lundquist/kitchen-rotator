// Loads the app's real scripts into a Node vm context with just enough of a
// fake browser (DOM, localStorage, timers) to run them. The scripts are read
// in the order index.html lists them, so a test run also proves that order
// works — main.js runs and renders exactly as it does on page load.
//
// Values cross back out through JSON (see get()): objects built inside the vm
// have that realm's prototypes, which assert.deepStrictEqual rejects.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function scriptPaths(){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
}

function fakeElement(){
  const classes = new Set();
  const attrs = {};
  return {
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle(c, force){
        const on = force === undefined ? !classes.has(c) : !!force;
        if(on) classes.add(c); else classes.delete(c);
        return on;
      }
    },
    style: {}, dataset: {}, innerHTML: '', textContent: '', value: '',
    setAttribute(k, v){ attrs[k] = String(v); },
    getAttribute(k){ return k in attrs ? attrs[k] : null; },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    addEventListener(){}, focus(){}, select(){}, click(){},
    getBoundingClientRect(){ return { top:0, bottom:0, left:0, right:0, width:0, height:0 }; }
  };
}

// storage: initial localStorage contents, { key: string }.
// confirm: stands in for window.confirm; receives the message.
function createApp({ storage = {}, confirm = () => true } = {}){
  const store = new Map(Object.entries(storage));
  const elements = new Map();
  const document = {
    getElementById(id){
      if(!elements.has(id)) elements.set(id, fakeElement());
      return elements.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => fakeElement(),
    documentElement: fakeElement(),
    addEventListener(){}
  };
  const ctx = {
    document,
    localStorage: {
      getItem: k => store.has(k) ? store.get(k) : null,
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: k => { store.delete(k); }
    },
    setTimeout: () => 0, clearTimeout(){},
    setInterval: () => 0, clearInterval(){},
    requestAnimationFrame(){},
    addEventListener(){},
    innerWidth: 1280,
    confirm,
    console
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for(const src of scriptPaths()){
    vm.runInContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), ctx, { filename: src });
  }

  const run = code => vm.runInContext(code, ctx);
  const app = {
    run,
    get: expr => {
      const json = run(`JSON.stringify(${expr})`);
      return json === undefined ? undefined : JSON.parse(json);
    },
    storage: store,
    el: id => document.getElementById(id),
    lastToast: () => document.getElementById('toast').textContent,

    // Seats a block directly: kitchens[i] is kitchen i's names, top seat first.
    // Clears attendance and makes this seating the block's saved original.
    setRoster(blockId, kitchens){
      run(`(() => {
        const b = state.blocks[${JSON.stringify(blockId)}];
        const ks = ${JSON.stringify(kitchens)};
        b.kitchens = Array.from({length: NUM_KITCHENS}, emptyKitchen);
        ks.forEach((names, i) => {
          b.kitchens[i].students = names.slice();
          b.kitchens[i].original = names.slice();
        });
        b.absent = emptyAbsentGrid();
        b.absentDate = '';
        saveState();
      })()`);
    },
    students: (blockId, ki) => app.get(`state.blocks[${JSON.stringify(blockId)}].kitchens[${ki}].students`),
    setDuties(texts, blockIds){
      run(`state.duties = ${JSON.stringify(texts)}.map(text => ({
        text, apply: Object.fromEntries(${JSON.stringify(blockIds)}.map(id => [id, true]))
      }))`);
    }
  };
  return app;
}

module.exports = { createApp, scriptPaths, ROOT };
