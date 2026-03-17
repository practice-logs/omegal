/* ===== NexusChat v2 – Toast Notifications ===== */
export function toast(msg, type = 'info') {
  const icons = { ok: 'fa-check-circle', err: 'fa-exclamation-circle', info: 'fa-info-circle', warn: 'fa-exclamation-triangle' };
  const box = document.getElementById('toast-box');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i>${msg}`;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 3000);
}
