// --- ICONS ---
// Inline SVG strings. The CSP allows images only from 'self' and data:, and
// inline markup keeps every icon recolourable through currentColor.

// Full-screen board icons: sized by .fs-icon, mostly filled shapes.
const ICON_CLOSE = '<svg class="fs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
const ICON_DROPLET = '<svg class="fs-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c-.3 0-.6.14-.78.38C9.7 5.2 5.25 11.6 5.25 15.5a6.75 6.75 0 0 0 13.5 0c0-3.9-4.45-10.3-5.97-12.62a.95.95 0 0 0-.78-.38z"/></svg>';
const ICON_MOON = '<svg class="fs-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8z"/></svg>';
const ICON_SUN = '<svg class="fs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><line x1="12" y1="1.8" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.2"/><line x1="1.8" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.2" y2="12"/><line x1="4.6" y1="4.6" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.4" y2="19.4"/><line x1="4.6" y1="19.4" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.4" y2="4.6"/></svg>';

// Line icons for buttons and menus: one stroke style, sized by .icon.
const I = (p,extra='') => `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON_KEBAB    = I('<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>','icon-solo');
const ICON_EXPAND   = I('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>');
const ICON_SAVE     = I('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>');
const ICON_RESTORE  = I('<polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/>');
const ICON_IMPORT   = I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');
const TRASH_PATHS   = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>';
const ICON_TRASH      = I(TRASH_PATHS);
const ICON_TRASH_SOLO = I(TRASH_PATHS, 'icon-solo');
const ICON_ABSENT  = I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/>');
const ICON_HISTORY = I('<path d="M3 12a9 9 0 1 0 2.6-6.4"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/>');
