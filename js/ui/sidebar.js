/* ===== NexusChat v2 – Sidebar Controls ===== */

export function openSb() {
  document.getElementById('chSb')?.classList.add('open');
  document.getElementById('chBd')?.classList.add('show');
}
export function closeSb() {
  document.getElementById('chSb')?.classList.remove('open');
  document.getElementById('chBd')?.classList.remove('show');
}
export function checkSb() {
  document.getElementById('chSb')?.classList.contains('open') ? closeSb() : openSb();
}

/** Toggle the channel sidebar visibility (desktop toggle button) */
export function toggleChSb() {
  const app = document.getElementById('app');
  const chSb = document.getElementById('chSb');
  const btn = document.getElementById('chSbToggleBtn');
  const hidden = app.classList.toggle('no-chsb');
  if (btn) btn.title = hidden ? 'Show channels' : 'Hide channels';
  if (btn) btn.querySelector('i').className = hidden ? 'fas fa-columns' : 'fas fa-sidebar';
  localStorage.setItem('nc_chsb', hidden ? '0' : '1');
}

/** Restore sidebar hidden state from localStorage */
export function restoreChSbState() {
  const saved = localStorage.getItem('nc_chsb');
  if (saved === '0') {
    document.getElementById('app')?.classList.add('no-chsb');
  }
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 820) closeSb();
});
