/* ===== NexusChat v2 – Random Match (WebRTC P2P, Auto-reconnect, Resume) ===== */
import { db, ref, set, get, push, onValue, remove, onDisconnect, update } from '../utils/firebase.js';
import { toast } from '../ui/toast.js';
import { esc } from '../utils/helpers.js';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// ── State ──
let me = null, myP = null;
let pc = null, localStream = null, vidRoomId = null;
let vidUnsubs = [], mTmr = null, mCnt = 0;
let isMuted = false, isCamOff = false, isBlurred = false;
let matchMode = 'chat';
let onEnterRandRoom = null;   // callback from app.js for text-mode rooms
let _autoReconnect = true;    // set false when user manually ends call
let _resumeState = null;      // { mode, roomId } when user navigates away mid-session
let _onResume = null;         // callback: () => resume the session

export function initRandom(meUser, myProfile, enterRandRoomCb) {
  me = meUser;
  myP = myProfile;
  onEnterRandRoom = enterRandRoomCb;
}

export function setResumeCallback(cb) { _onResume = cb; }

/** Returns current resume state (or null) */
export function getResumeState() { return _resumeState; }
export function clearResumeState() { _resumeState = null; }

// ───────────────────────────────────
// START MATCH
// ───────────────────────────────────
export async function startMatch(mode = 'chat') {
  matchMode = mode;
  _autoReconnect = true;
  _resumeState = null;

  document.getElementById('rIdle').style.display = 'none';
  document.getElementById('rSearching').style.display = 'flex';

  const orb = document.getElementById('rSearchOrb');
  if (orb) orb.style.background = mode === 'video'
    ? 'linear-gradient(135deg,var(--accent2),#FF8C00)'
    : 'linear-gradient(135deg,var(--accent),var(--accent2))';
  const lbl = document.getElementById('rSearchLbl');
  if (lbl) lbl.textContent = mode === 'video' ? 'Searching for a video stranger...' : 'Searching for a stranger...';

  mCnt = 0;
  clearInterval(mTmr);
  mTmr = setInterval(() => {
    mCnt++;
    const m = Math.floor(mCnt / 60), s = mCnt % 60;
    const el = document.getElementById('mTimer');
    if (el) el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);

  const queue = mode === 'video' ? 'videoQueue' : 'matchQueue';
  await set(ref(db, `${queue}/${me.uid}`), { uid: me.uid, username: myP.username, ts: Date.now(), mode });
  onDisconnect(ref(db, `${queue}/${me.uid}`)).remove();

  // Listen for other users in queue
  const qu = onValue(ref(db, queue), async snap => {
    if (!snap.exists()) return;
    const others = Object.entries(snap.val()).filter(([uid]) => uid !== me.uid);
    if (!others.length) return;
    others.sort((a, b) => a[1].ts - b[1].ts);
    const [sUid] = others[0];
    if (me.uid < sUid) {
      const rRef = push(ref(db, 'rooms'));
      const rid = rRef.key;
      await set(rRef, {
        name: mode === 'video' ? 'Video Chat' : 'Random Chat',
        type: 'random', mode, owner: me.uid, ownerName: myP.username,
        members: { [me.uid]: true, [sUid]: true },
        createdAt: Date.now(), active: true
      });
      await set(ref(db, `randomMatch/${me.uid}`), { roomId: rid, mode });
      await set(ref(db, `randomMatch/${sUid}`), { roomId: rid, mode });
    }
  });

  // Listen for our match assignment
  const mu = onValue(ref(db, `randomMatch/${me.uid}`), async snap => {
    if (!snap.exists()) return;
    const { roomId, mode: m } = snap.val();
    clearInterval(mTmr);
    qu(); mu(); // unsubscribe queue listeners
    await remove(ref(db, `${queue}/${me.uid}`));
    await remove(ref(db, `randomMatch/${me.uid}`));
    document.getElementById('rSearching').style.display = 'none';
    if (m === 'video') enterVideoRoom(roomId);
    else if (onEnterRandRoom) onEnterRandRoom(roomId);
  });
}

// ───────────────────────────────────
// CANCEL MATCH
// ───────────────────────────────────
export async function cancelMatch() {
  clearInterval(mTmr);
  const queue = matchMode === 'video' ? 'videoQueue' : 'matchQueue';
  await remove(ref(db, `${queue}/${me.uid}`));
  await remove(ref(db, `randomMatch/${me.uid}`));
  resetRandomUI();
}

// ───────────────────────────────────
// NEXT STRANGER (text mode)
// ───────────────────────────────────
export async function nextStranger(currentRandRoom, cleanListenersCb, showViewCb) {
  if (currentRandRoom) {
    await update(ref(db, `rooms/${currentRandRoom}`), { active: false });
    await remove(ref(db, `rooms/${currentRandRoom}`));
  }
  document.getElementById('randCtrl')?.remove();
  cleanListenersCb();
  showViewCb('vRandom');
  resetRandomUI();
  startMatch('chat');
}

// ───────────────────────────────────
// RESUME SESSION
// ───────────────────────────────────
/** Call when user navigates away from random/video view */
export function onNavigateAway(mode, roomId) {
  if (!roomId) return;
  _resumeState = { mode, roomId };
  showResumeBanner(mode);
}

function showResumeBanner(mode) {
  const banner = document.getElementById('resumeBanner');
  if (!banner) return;
  const icon = mode === 'video' ? '🎥' : '💬';
  const label = mode === 'video' ? 'Video Call' : 'Random Chat';
  banner.innerHTML = `
    <span>${icon} ${label} in progress —</span>
    <button class="btn btn-xs btn-primary" onclick="window._resumeSession()"><i class="fas fa-undo"></i> Resume</button>
    <button class="btn btn-xs btn-ghost" onclick="window._endAndDismiss()"><i class="fas fa-times"></i></button>
  `;
  banner.classList.add('show');
}

export function hideResumeBanner() {
  document.getElementById('resumeBanner')?.classList.remove('show');
}

// ───────────────────────────────────
// VIDEO ROOM ENTRY
// ───────────────────────────────────
export async function enterVideoRoom(rid) {
  vidRoomId = rid;

  const rVideoEl = document.getElementById('rVideo');
  const rIdleEl = document.getElementById('rIdle');
  const rSearchEl = document.getElementById('rSearching');
  if (rIdleEl) rIdleEl.style.display = 'none';
  if (rSearchEl) rSearchEl.style.display = 'none';
  if (rVideoEl) rVideoEl.style.display = 'flex';

  _setVidStatus('warn', 'Connecting...');
  document.getElementById('vidMsgs').innerHTML = '';

  // Get local media
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
    document.getElementById('localVideo').srcObject = localStream;
  } catch {
    toast('Camera/mic access denied. Using audio only.', 'warn');
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { localStream = null; }
  }

  // Peer connection
  pc = new RTCPeerConnection(RTC_CONFIG);
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  const remoteStream = new MediaStream();
  document.getElementById('remoteVideo').srcObject = remoteStream;

  pc.ontrack = e => {
    e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    document.getElementById('vidRemoteOverlay').style.display = 'none';
    _setVidStatus('ok', 'Connected');
  };

  pc.onicecandidate = async e => {
    if (e.candidate)
      await push(ref(db, `signaling/${rid}/candidates/${me.uid}`), e.candidate.toJSON());
  };

  // ★ FIX: Auto-reconnect when stranger disconnects
  pc.onconnectionstatechange = () => {
    const state = pc?.connectionState;
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      _setVidStatus('err', 'Disconnected');
      if (_autoReconnect) {
        toast('Stranger left. Finding a new one...', 'info');
        setTimeout(async () => {
          await cleanupVideoCall();
          resetRandomUI();
          const vRandom = document.getElementById('vRandom');
          if (vRandom && vRandom.style.display !== 'none') {
            setTimeout(() => startMatch('video'), 400);
          }
          // If user navigated away, update resume banner
          if (_resumeState) showResumeBanner('video');
        }, 1500);
      }
    }
  };

  // ★ FIX: Watch Firebase room active flag (stranger closed device)
  const roomWatcher = onValue(ref(db, `rooms/${rid}/active`), snap => {
    if (snap.exists() && snap.val() === false) {
      if (!pc || pc.connectionState === 'closed') return;
      toast('Stranger disconnected. Finding a new one...', 'info');
      setTimeout(async () => {
        await cleanupVideoCall();
        resetRandomUI();
        if (_autoReconnect) setTimeout(() => startMatch('video'), 400);
      }, 1200);
    }
  });
  vidUnsubs.push(roomWatcher);

  // Signal: offerer = room owner
  const s = await get(ref(db, `rooms/${rid}`));
  const room = s.val();
  const isOfferer = room.owner === me.uid;
  const otherUid = isOfferer ? Object.keys(room.members).find(u => u !== me.uid) : room.owner;

  if (isOfferer) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await set(ref(db, `signaling/${rid}/offer`), { type: offer.type, sdp: offer.sdp, from: me.uid });
    const u = onValue(ref(db, `signaling/${rid}/answer`), async snap => {
      if (!snap.exists()) return;
      if (pc.signalingState === 'have-local-offer')
        await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
    });
    vidUnsubs.push(u);
  } else {
    const u = onValue(ref(db, `signaling/${rid}/offer`), async snap => {
      if (!snap.exists() || pc.signalingState !== 'stable') return;
      await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await set(ref(db, `signaling/${rid}/answer`), { type: answer.type, sdp: answer.sdp, from: me.uid });
    });
    vidUnsubs.push(u);
  }

  if (otherUid) {
    const cu = onValue(ref(db, `signaling/${rid}/candidates/${otherUid}`), snap => {
      if (!snap.exists()) return;
      Object.values(snap.val()).forEach(async c => {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      });
    });
    vidUnsubs.push(cu);
  }

  // In-call Firebase messages
  const mu = onValue(ref(db, `messages/${rid}`), snap => {
    if (!snap.exists()) return;
    const msgs = Object.values(snap.val()).sort((a, b) => a.timestamp - b.timestamp);
    const vidMsgs = document.getElementById('vidMsgs');
    vidMsgs.innerHTML = '';
    msgs.forEach(m => {
      if (m.uid === 'system') return;
      const div = document.createElement('div');
      div.className = 'vid-msg' + (m.uid === me.uid ? ' own' : '');
      div.innerHTML = `<span class="vid-msg-name">${m.uid === me.uid ? 'You' : 'Stranger'}</span><span class="vid-msg-text">${esc(m.text)}</span>`;
      vidMsgs.appendChild(div);
    });
    vidMsgs.scrollTop = vidMsgs.scrollHeight;
  });
  vidUnsubs.push(mu);

  _watchRemoteReacts(rid);
  await push(ref(db, `messages/${rid}`), { uid: 'system', text: '🎥 Video connected! You can also chat below.', timestamp: Date.now() });
}

// ───────────────────────────────────
// VIDEO CONTROLS
// ───────────────────────────────────
export function toggleMute() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0]; if (!track) return;
  isMuted = !isMuted; track.enabled = !isMuted;
  document.getElementById('btnMute').innerHTML = `<i class="fas fa-microphone${isMuted ? '-slash' : ''}"></i>`;
  document.getElementById('btnMute').classList.toggle('off', isMuted);
}
export function toggleCam() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0]; if (!track) return;
  isCamOff = !isCamOff; track.enabled = !isCamOff;
  document.getElementById('btnCam').innerHTML = `<i class="fas fa-video${isCamOff ? '-slash' : ''}"></i>`;
  document.getElementById('btnCam').classList.toggle('off', isCamOff);
}
export function toggleBlur() {
  isBlurred = !isBlurred;
  document.getElementById('localVideo').style.filter = isBlurred ? 'blur(8px)' : 'none';
  document.getElementById('btnBlur').classList.toggle('on', isBlurred);
}
export async function endVideoCall() {
  _autoReconnect = false;
  _resumeState = null;
  hideResumeBanner();
  await cleanupVideoCall();
}
export async function nextVideoStranger() {
  _autoReconnect = true;
  await cleanupVideoCall();
  resetRandomUI();
  const vRandom = document.getElementById('vRandom');
  if (vRandom) vRandom.style.display = 'flex';
  setTimeout(() => startMatch('video'), 300);
}

export async function sendVidMsg() {
  const inp = document.getElementById('vidInp');
  const text = inp.value.trim();
  if (!text || !vidRoomId) return;
  inp.value = '';
  await push(ref(db, `messages/${vidRoomId}`), { uid: me.uid, username: myP.username, text, timestamp: Date.now() });
}

// ───────────────────────────────────
// REACTIONS
// ───────────────────────────────────
export function sendReact(emoji) {
  burstReact(emoji);
  if (vidRoomId) push(ref(db, `signaling/${vidRoomId}/reactions`), { emoji, from: me.uid, ts: Date.now() });
}
function burstReact(emoji) {
  const burst = document.getElementById('reactBurst');
  if (!burst) return;
  for (let i = 0; i < 5; i++) {
    const el = document.createElement('div');
    el.className = 'react-float'; el.textContent = emoji;
    el.style.left = (20 + Math.random() * 60) + '%';
    el.style.animationDuration = (0.8 + Math.random() * 0.7) + 's';
    el.style.fontSize = (1.5 + Math.random()) + 'rem';
    burst.appendChild(el); setTimeout(() => el.remove(), 1800);
  }
}
function _watchRemoteReacts(rid) {
  const u = onValue(ref(db, `signaling/${rid}/reactions`), snap => {
    if (!snap.exists()) return;
    const items = Object.values(snap.val()).filter(r => r.from !== me.uid && Date.now() - r.ts < 3000);
    if (items.length) burstReact(items[items.length - 1].emoji);
  });
  vidUnsubs.push(u);
}

// ───────────────────────────────────
// CLEANUP
// ───────────────────────────────────
export async function cleanupVideoCall() {
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (vidRoomId) {
    await remove(ref(db, `signaling/${vidRoomId}`));
    await update(ref(db, `rooms/${vidRoomId}`), { active: false });
    await remove(ref(db, `rooms/${vidRoomId}`));
    vidRoomId = null;
  }
  vidUnsubs.forEach(fn => { try { fn(); } catch {} }); vidUnsubs = [];
  const rv = document.getElementById('remoteVideo');
  const lv = document.getElementById('localVideo');
  if (rv) rv.srcObject = null;
  if (lv) lv.srcObject = null;
  document.getElementById('vidRemoteOverlay').style.display = 'flex';
  isMuted = false; isCamOff = false; isBlurred = false;
}

export function resetRandomUI() {
  const rIdle = document.getElementById('rIdle');
  const rSearch = document.getElementById('rSearching');
  const rVideo = document.getElementById('rVideo');
  if (rIdle) rIdle.style.display = 'flex';
  if (rSearch) rSearch.style.display = 'none';
  if (rVideo) rVideo.style.display = 'none';
  _setVidStatus('warn', 'Connecting...');
  document.getElementById('vidRemoteOverlay').style.display = 'flex';
  const btnMute = document.getElementById('btnMute');
  const btnCam = document.getElementById('btnCam');
  const btnBlur = document.getElementById('btnBlur');
  if (btnMute) { btnMute.innerHTML = '<i class="fas fa-microphone"></i>'; btnMute.classList.remove('off'); }
  if (btnCam) { btnCam.innerHTML = '<i class="fas fa-video"></i>'; btnCam.classList.remove('off'); }
  if (btnBlur) btnBlur.classList.remove('on');
  clearInterval(mTmr);
}

export function getVidRoomId() { return vidRoomId; }

function _setVidStatus(type, text) {
  const el = document.getElementById('vidStatus');
  if (!el) return;
  const colors = { warn: 'var(--warn)', ok: 'var(--ok)', err: 'var(--err)' };
  el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${colors[type] || 'var(--warn)'};margin-right:.3rem;display:inline-block;"></span>${text}`;
}
