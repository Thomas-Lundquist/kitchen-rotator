// --- THEME ---
// Kept in its own localStorage key rather than in state, so it's a
// per-device display preference and isn't carried around by data backups.
const THEME_KEY = 'kitchenRotationTool_theme';

function loadTheme(){
  try{
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  }catch(e){ return 'light'; }
}

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.innerHTML = (theme === 'dark') ? ICON_SUN + ' Light' : ICON_MOON + ' Dark';
}

function toggleTheme(){
  const next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
  applyTheme(next);
  // Theme swap can shift text metrics slightly; re-fit if fullscreen is open.
  if(fullscreenBlockId) fitFullscreen();
}
