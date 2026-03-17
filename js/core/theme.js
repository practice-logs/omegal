/* ===== NexusChat v2 – Theme Manager ===== */

const STORAGE_KEY = 'nc_theme';

/** Apply a theme (dark | light) to the document */
export function applyTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  localStorage.setItem(STORAGE_KEY, name);
  // Sync all toggle buttons
  document.querySelectorAll('#tDark').forEach(el => {
    el.className = 'toggle' + (name === 'dark' ? ' on' : '');
  });
  // Sync theme icon in header if present
  const ico = document.getElementById('thIco');
  if (ico) ico.className = name === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

/** Read saved theme (default: dark) */
export function getSavedTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'dark';
}

/** Toggle between dark and light */
export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/** Init: apply saved theme immediately */
export function initTheme() {
  applyTheme(getSavedTheme());
}
