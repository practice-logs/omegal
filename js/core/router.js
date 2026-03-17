/* ===== NexusChat v2 – Router ===== */

const ALL_VIEWS = [
  'vWelcome', 'vChat', 'vRandom', 'vDiscover',
  'vUserSearch', 'vProfile', 'vNotifs', 'vSettings'
];

const NAV_IDS = [
  'nb-global', 'nb-random', 'nb-discover', 'nb-usersearch',
  'nb-myrooms', 'nb-notifications', 'nb-settings'
];
const BOT_IDS = [
  'bn-global', 'bn-random', 'bn-usersearch', 'bn-settings', 'bn-home'
];

/** Show one view, hide all others */
export function showView(id) {
  ALL_VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = 'none';
  });
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

/** Set active nav button */
export function setNavActive(id) {
  NAV_IDS.forEach(k => document.getElementById(k)?.classList.remove('on'));
  BOT_IDS.forEach(k => document.getElementById(k)?.classList.remove('on'));
  if (id) {
    document.getElementById('nb-' + id)?.classList.add('on');
    document.getElementById('bn-' + id)?.classList.add('on');
  }
}

/** Update browser tab title + header breadcrumb */
export function setHdr(name, meta) {
  const hRN = document.getElementById('hRN');
  const hRM = document.getElementById('hRM');
  if (hRN) hRN.innerHTML = `<i class="fas fa-hashtag" style="color:var(--textD);font-size:.72rem;"></i>&nbsp;${name}`;
  if (hRM) hRM.innerHTML = meta || '';
  document.title = name + ' — NexusChat';
}

/** Open / close modals */
export function openM(id)  { document.getElementById(id)?.classList.add('open'); }
export function closeM(id) { document.getElementById(id)?.classList.remove('open'); }

/** Wire modal-overlay click-outside-to-close */
export function initModals() {
  document.querySelectorAll('.modal-ov').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el) el.classList.remove('open');
    });
  });
}
