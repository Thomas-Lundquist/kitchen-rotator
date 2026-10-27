// --- INIT ---
// Loaded last. Everything above only defines things; this is where the app
// starts. Loading state runs migrations that call into seats.js and util.js,
// so it has to wait until every script has been read.
state = loadState();
historyStore = loadHistory();
applyTheme(loadTheme());
render();
