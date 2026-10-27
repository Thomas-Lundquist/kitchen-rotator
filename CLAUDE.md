# CLAUDE.md

A static, dependency-free browser app that rotates culinary students through
kitchen seats, job titles and duties. Used by one teacher, often opened straight
from disk (`file://`). See README.md for what it does from the user's side.

## Commands

- `npm test`: Node's built-in test runner (`node --test`). No install step.
- Run the app: open `index.html`. To drive it in a browser tool, serve the folder
  on localhost. That origin has its own empty localStorage, so it never touches
  the teacher's real data, which lives under the `file://` origin.

## Architecture: rules that will break things if ignored

**Classic scripts, one global scope.** `index.html` loads `js/*.js` as plain
`<script>` tags. Do not convert to ES modules: the markup and generated HTML use
inline `onclick="fn()"` handlers that need globals, and Chrome refuses module
scripts on `file://`. A new file needs its own `<script>` tag (a test enforces
that every `js/` file is listed).

**Files only define; `main.js` starts.** At load time a file may declare
functions and constants and register `document`/`window` listeners. It must not
call into another file, because that file may not have loaded yet. `state` and
`historyStore` are declared without a value (`let state;`) and assigned in
`main.js`, which must stay the last script.

**No network, ever.** The CSP in `index.html` sets `connect-src 'none'`,
`form-action 'none'` and `script-src 'self'`. Do not add fetches, CDN scripts or
analytics. Files reach the user only through `downloadBlob()`. Only Google Fonts
are allowed in.

**Saved data must keep loading.** Storage keys: `kitchenRotationTool_v1`
(state), `kitchenRotationTool_history_v1` (history), `kitchenRotationTool_theme`.
Everything read from storage or from a backup file goes through
`normalizeState()` / `normalizeHistory()`, which upgrade three older save shapes
and repair missing or short arrays. When the shape changes, extend those
functions and add a test in `tests/state.test.js`. Never assume fields exist on
loaded data.

## Data model

- `state.blocks[id]` is one class. The `id` (`A1`, `B3`, …) is a permanent
  internal identity that history and duty checkboxes key on. The label the
  teacher sees is the period it sits in now, from `blockLabel(id)`, and the two
  diverge once a class is moved. Use `blockLabel` in anything user-facing.
- `state.slots.A/B` are always four entries, a block id or `null` (prep period).
- `kitchens[ki].students` in stored order **is the rotation cycle**. Absence
  never reorders it.
- **SPLIT is derived, never stored.** An empty seat in an active kitchen renders
  as SPLIT. `updateSeat` turns a typed "SPLIT" into `''`.
- `block.absent[ki][seat]` is indexed by **stored** seat. `seatOrder(block, ki)`
  maps display row → stored seat (present, then absent, then blank). In the grid
  `data-r` is the display row and `data-ci` the stored seat, and edits write to
  `data-ci`.
- **Active** kitchen = has names (column renders). **Staffed** = someone
  present today. Duties, center sink and history use staffed; seat rotation uses
  active.
- `_dutyDisplay` / `_centerSinkDisplay` are derived caches rebuilt by
  `refreshDuties()`. They get saved incidentally but are never a source of truth.

## Behaviors that are easy to break

- `refreshDuties(id, false)` is safe to call from any render path.
  `refreshDuties(id, true)` moves the rotation cursors, and only `advanceBlock`
  should pass `true`. It reassigns duties for the **whole day**, because one
  physical kitchen must not repeat a duty across periods.
- In `rotateDay`, every history record is built **before** any block advances,
  since advancing one block rewrites the day's duty display for the others.
  History is appended only if `saveState()` succeeded, and before `render()`.
- Undo is one in-memory step (`lastRotation`). Anything that replaces or
  re-seats a roster (import, restore original, save original, remove class, load
  backup) must set `lastRotation = null`.
- Typing in a seat must not re-render the panel, or focus is lost on every key.
  `updateSeat` uses `refreshBlockChrome()` to patch classes and placeholders in
  place. Changes that move names between inputs (attendance) do re-render.
- Dates use `dateStamp()`/`todayStamp()`, the local calendar date. Never
  `toISOString()`, which is UTC and rolls over mid-afternoon in the US.
- Escape user text: `escapeHtml()` for element content, `escapeAttr()` inside
  double-quoted attributes.
- The fullscreen fitter measures real layout, so the overlay must be visible
  before `renderFullscreen()` runs.

## Style

Match the existing code: 2-space indent, compact `if(x){ ... }` and
`function f(){`, template-string HTML, no frameworks. Comments are dense and
explain **why**, usually the bug or constraint that forced a choice. Keep that
up when changing behavior, and update a comment when it stops being true. Toast
text is plain and specific about what happened.

## Tests

`tests/harness.js` runs the real scripts in a `vm` context with a fake DOM and
localStorage. `createApp({ storage, confirm })` returns `run(code)`,
`get(expr)` (values cross out via JSON, because cross-realm objects fail
`deepStrictEqual`), `setRoster`, `setDuties`, `students`, `el(id)` and
`lastToast()`. Changes to rotation, duties, attendance, history or migration
should come with a test. The harness can't measure layout, so check fullscreen
sizing in a real browser.
