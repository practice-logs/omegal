/* ===== NexusChat v2 – Notifications (Real-time Fixed) ===== */
import { db, ref, onValue, remove, update, get, push } from '../utils/firebase.js';
import { esc, timeAgo } from '../utils/helpers.js';
import { toast } from '../ui/toast.js';

let _meUid = null;
let _myUsername = null;
let _prevCount = 0;    // track count to detect NEW notifications
let _unsubs = [];

export function initNotifications(uid, username) {
  _meUid = uid;
  _myUsername = username;
  _prevCount = 0;
  // Unsubscribe any previous listener
  _unsubs.forEach(fn => { try { fn(); } catch {} });
  _unsubs = [];

  // ★ FIX: onValue fires immediately and on every change = real-time
  const u = onValue(ref(db, `notifications/${uid}`), snap => {
    if (!snap.exists()) { updateBadge(0); renderNotifs([]); _prevCount = 0; return; }
    const notifs = Object.entries(snap.val())
      .map(([id, n]) => ({ id, ...n }))
      .sort((a, b) => b.ts - a.ts);
    const unread = notifs.filter(n => !n.read).length;

    // ★ FIX: Show in-app toast for brand-new notifications
    if (unread > _prevCount && _prevCount >= 0) {
      const newest = notifs.find(n => !n.read);
      if (newest) showNotifToast(newest);
    }
    _prevCount = unread;

    updateBadge(unread);
    renderNotifs(notifs);
  });
  _unsubs.push(u);
}

export function destroyNotifications() {
  _unsubs.forEach(fn => { try { fn(); } catch {} });
  _unsubs = [];
}

function showNotifToast(n) {
  if (n.type === 'room_invite') {
    toast(`📨 <strong>${esc(n.fromName)}</strong> invited you to <strong>${esc(n.roomName)}</strong>`, 'info');
  } else if (n.type === 'friend_add') {
    toast(`👤 <strong>${esc(n.fromName)}</strong> added you as a friend!`, 'ok');
  } else if (n.text) {
    toast(esc(n.text), 'info');
  }
}

export function updateBadge(n) {
  ['notifHdrDot', 'nbd-notif', 'bn-notif-dot'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = n > 0 ? 'flex' : 'none'; el.textContent = n > 0 ? n : ''; }
  });
}

export function renderNotifs(notifs) {
  const list = document.getElementById('npList');
  if (!list) return;
  if (!notifs.length) {
    list.innerHTML = '<div class="np-empty"><i class="fas fa-bell-slash"></i><span>No notifications yet</span></div>';
    return;
  }
  list.innerHTML = notifs.slice(0, 40).map(n => {
    const ago = timeAgo(n.ts);
    const dismissBtn = `<button class="ni-dismiss" title="Dismiss" onclick="event.stopPropagation();window._dismissN('${n.id}')"><i class="fas fa-times"></i></button>`;
    if (n.type === 'room_invite') return `
      <div class="ni${n.read ? '' : ' unread'}" id="ni-${n.id}">
        <div class="ni-ava"><img src="${n.fromAva || ''}" alt=""/></div>
        <div class="ni-cnt">
          <div class="ni-txt"><strong>${esc(n.fromName)}</strong> invited you to <strong>${esc(n.roomName)}</strong></div>
          <div class="ni-time">${ago}</div>
          <div class="ni-acts">
            <button class="btn btn-xs btn-primary" onclick="window._acceptInvite('${n.id}','${n.roomId}','${esc(n.roomName || '')}')"><i class="fas fa-check"></i> Join</button>
            <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();window._dismissN('${n.id}')"><i class="fas fa-times"></i> Dismiss</button>
          </div>
        </div>${dismissBtn}
      </div>`;
    if (n.type === 'friend_add') return `
      <div class="ni${n.read ? '' : ' unread'}" id="ni-${n.id}">
        <div class="ni-ava"><img src="${n.fromAva || ''}" alt=""/></div>
        <div class="ni-cnt">
          <div class="ni-txt"><strong>${esc(n.fromName)}</strong> added you as a friend!</div>
          <div class="ni-time">${ago}</div>
          <div class="ni-acts">
            <button class="btn btn-xs btn-primary" onclick="window._openProfilePage && window._openProfilePage('${n.from}');window._dismissN('${n.id}')"><i class="fas fa-user"></i> View</button>
            <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();window._dismissN('${n.id}')"><i class="fas fa-times"></i></button>
          </div>
        </div>${dismissBtn}
      </div>`;
    return `
      <div class="ni${n.read ? '' : ' unread'}" id="ni-${n.id}">
        <div class="ni-ico">🔔</div>
        <div class="ni-cnt"><div class="ni-txt">${esc(n.text || 'Notification')}</div><div class="ni-time">${ago}</div></div>
        ${dismissBtn}
      </div>`;
  }).join('');
}

export async function dismissN(uid, id) {
  const el = document.getElementById('ni-' + id);
  if (el) { el.style.opacity = '0'; el.style.transform = 'translateX(40px)'; el.style.transition = 'all .22s ease'; setTimeout(() => el.remove(), 230); }
  await remove(ref(db, `notifications/${uid}/${id}`));
}

export async function markAllRead(uid) {
  const s = await get(ref(db, `notifications/${uid}`));
  if (!s.exists()) return;
  const ups = {};
  Object.keys(s.val()).forEach(k => { ups[k + '/read'] = true; });
  await update(ref(db, `notifications/${uid}`), ups);
}

export async function clearAllNotifs(uid) {
  if (!confirm('Clear all notifications?')) return;
  try {
    await remove(ref(db, `notifications/${uid}`));
    const list = document.getElementById('npList');
    if (list) list.innerHTML = '<div class="np-empty"><i class="fas fa-bell-slash"></i><span>No notifications yet</span></div>';
    updateBadge(0);
    toast('All notifications cleared', 'ok');
  } catch { toast('Failed to clear notifications', 'err'); }
}

export async function sendInviteNotif(db, fromUid, fromName, fromAva, toUid, roomId, roomName, joinCode, link) {
  await push(ref(db, `notifications/${toUid}`), {
    type: 'room_invite', from: fromUid, fromName, fromAva: fromAva || '',
    roomId, roomName, link, joinCode: joinCode || '',
    ts: Date.now(), read: false
  });
}

export async function sendFriendNotif(db, fromUid, fromName, fromAva, toUid) {
  await push(ref(db, `notifications/${toUid}`), {
    type: 'friend_add', from: fromUid, fromName, fromAva: fromAva || '',
    ts: Date.now(), read: false
  });
}
