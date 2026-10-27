# Kitchen Rotation Tool

A browser tool for a culinary classroom. It seats students in eight kitchens,
rotates them through five job titles each class day, and hands out extra duties
and center-sink turns so that the work is shared fairly, then shows the result
on a full-screen board for the class.

It is a single static page with no server, no account and no build step. Student
names never leave the browser.

## Using it

1. Open `index.html` in a browser. (Or put the folder on any static host.)
2. On a class card, open the **⋮** menu → **Import roster**. Upload an attendance
   CSV export (the `Student` column is found automatically) or paste names one
   per line. `Archer, Kelly Noel` becomes `Kelly A.`. Students are shuffled into
   kitchens of about four.
3. In **Settings → Extra duties**, add duties and tick the classes each applies to.
4. At the **end** of each class day, press **Rotate A Day** / **Rotate B Day**.
   Everyone moves to the next job, and the duties move to the next kitchen.
   Rotating records what the class just finished, so rotate at the end, not the
   start.
5. **Full screen** on a card shows the board for the room: names sized to fill
   the screen, today's duties, and countdowns to the cleanup bell and the end of
   class.

### Day to day

- **Attendance**: ⋮ → **Attendance…**, or right-click a name. Absent students
  drop below the present ones, so whoever is in takes the top jobs, and an absent
  student's job reads **SPLIT**. Marks clear at the next rotation or overnight.
- **Undo**: the **Undo** button (or Ctrl+Z outside a text box) reverses the last
  rotation, including its history entry. It holds one step and does not survive a
  page reload.
- **Typing names in**: Enter and ↑/↓ move down a kitchen's column; Enter carries
  on into the next kitchen. Tab moves across kitchens.
- **Moving a class**: the period dropdown on a card moves the class to another
  period, swapping with whatever is there. Choosing **Prep** removes the class.
- **Save / Restore original**: ⋮ → **Save as original** remembers the current
  seating; **Restore to original** puts it back.

### Rules the rotation follows

- A kitchen with fewer than five students fills the top job titles. The jobs
  below them read **SPLIT** and are shared by the kitchen.
- A kitchen is a physical station, so the same kitchen number never draws the
  same extra duty twice in one day, across all of that day's classes, as long as
  there are enough duties to go round.
- Kitchens share center sinks in pairs (K1/K2, K3/K4, K5/K6, K7/K8) and take
  turns. A kitchen whose partner is empty has the sink every time.
- A kitchen whose whole crew is absent gets no duty. A class with nobody present
  does not move its duty rotation, and its day is not recorded.

## Your data

Everything is stored in this browser's `localStorage`, and nowhere else. A
Content Security Policy in `index.html` blocks the page from sending anything
anywhere; the only outside requests it may make are for Google Fonts.

That means **clearing the browser's site data deletes everything**. Use
**Settings → Download backup** regularly. The backup file holds the rosters,
duties and the participation history, and **Load backup** restores it.

**Settings → Participation records** exports a CSV of who held which job, who
was absent, and each kitchen's duty, for every recorded rotation (the last 90
per class).

## Development

No dependencies. Edit the files and reload the page.

```
index.html      page structure, modals, Content Security Policy, script order
style.css       all styling, light and dark themes
js/             the app, as plain scripts sharing one global scope
tests/          Node test suite
```

| File | What it holds |
|---|---|
| `js/util.js` | escaping, local-date helpers, toast, file download |
| `js/icons.js` | inline SVG icons |
| `js/state.js` | data shape, migration of old saves, load/save |
| `js/seats.js` | SPLIT, active vs staffed kitchens, attendance, seat order |
| `js/duties.js` | day-wide duty assignment and center-sink turns |
| `js/history.js` | participation records and the CSV export |
| `js/csv.js` | CSV parsing and writing |
| `js/rotation.js` | advancing, save/restore original, undo, Rotate Day |
| `js/roster.js` | roster import and kitchen grouping |
| `js/board.js` | A/B day panels, seat editing, class moves, dropdown menu |
| `js/settings.js` | Settings tab: duties, job titles, records, backup |
| `js/attendance-ui.js` | attendance modal and right-click menu |
| `js/history-ui.js` | per-class history modal |
| `js/fullscreen.js` | classroom board, bell schedules, text fitting |
| `js/keyboard.js` | Escape, Ctrl+Z, seat-grid navigation |
| `js/theme.js` | light/dark theme |
| `js/main.js` | startup; always loaded last |

### Tests

```
npm test
```

Requires Node 18 or newer. The suite loads the real scripts, in the order
`index.html` lists them, into a Node `vm` context with a small fake DOM, and
covers rotation, duties, attendance, undo, history, import parsing and the
migration of old saves.
