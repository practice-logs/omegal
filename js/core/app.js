/* ===== NexusChat v2 – App Core (Rooms, Messages, Settings, Profiles) ===== */
import {
  auth, db,
  onAuthStateChanged, signOut,
  ref, set, get, push, onValue, remove, onDisconnect, update, query, limitToLast
} from '../utils/firebase.js';
import { esc, timeAgo, playChime } from '../utils/helpers.js';
import { toast }                   from '../ui/toast.js';
import { showView, setNavActive, setHdr, openM, closeM, initModals } from './router.js';
import { initTheme, applyTheme }   from './theme.js';
import { openSb, closeSb, checkSb as _checkSb, toggleChSb, restoreChSbState } from '../ui/sidebar.js';
import {
  initNotifications, destroyNotifications,
  dismissN as _dismissN, markAllRead, clearAllNotifs,
  sendInviteNotif, sendFriendNotif
} from '../features/notifications.js';
import {
  initRandom, startMatch, cancelMatch, nextStranger,
  getResumeState, clearResumeState,
  onNavigateAway, hideResumeBanner,
  toggleMute, toggleCam, toggleBlur,
  endVideoCall, nextVideoStranger,
  sendVidMsg, sendReact, resetRandomUI, cleanupVideoCall, getVidRoomId
} from '../features/random.js';

// ── App state ─────────────────────────────────────────────────
let me = null, myP = null;
let activeRoom = null, activeType = null;
let unsubs = [], typTO = null, isTyping = false;
let randRoom = null, replyTo = null, pinId = null, prevView = null;
let prefs = JSON.parse(localStorage.getItem('nc_prefs') || '{"sound":true}');
let crIcoB64 = null, crIcoEmoji = '🏠', msgCache = {};
let ppopUid = null, ppopUN = '';

const ICOS = ['🏠','🎮','🎵','🎨','📚','🌍','🔥','✨','💬','🚀','🎯','🏆','👾','🎤','💡','🌙','⚡','🦋','🎭','🌈','🐶','🍕','🎲','🛸','🧠'];
const ECAT = { '😀':'Smileys','👋':'People','🐶':'Animals','🍎':'Food','⚽':'Sports','✈️':'Travel','💡':'Objects','❤️':'Symbols' };
const EMS  = {
  Smileys: ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😏','😒','😔','😢','😭','😤','😱','🥺','😳','😴','🤩','🤔','🤫','🥳','🫡','😇','🤗'],
  People:  ['👋','🤚','🖐️','✋','👌','✌️','🤞','👍','👎','✊','👊','🤛','🤜','👏','🙌','🙏','💪','🤝','💅'],
  Animals: ['🐶','🐱','🐭','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐺','🦄','🐬','🦈','🐊'],
  Food:    ['🍎','🍊','🍋','🍇','🍓','🫐','🍒','🍔','🍟','🍕','🌮','🌯','🍜','🍣','🍩','🍪','🎂','🍰','🧁','☕','🍵','🧃','🍺','🍷'],
  Sports:  ['⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏓','🥊','🎯','⛳','🎮','🕹️','🎲'],
  Travel:  ['✈️','🚀','🚗','🏎️','🚢','🚆','🏠','🏡','🏢','🗽','🏰','🌋','🏔️','🏖️'],
  Objects: ['💡','🔦','💰','💎','🔧','🔑','📱','💻','📷','📺','🎙️','🎚️'],
  Symbols: ['❤️','🧡','💛','💚','💙','💜','🖤','💔','❣️','💕','💯','✅','❌','⚠️','🔔','🎵','🎶']
};

// ─────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────
export function boot() {
  initTheme();
  initModals();
  restoreChSbState();
  exposeGlobals();

  // Auth gate
  onAuthStateChanged(auth, async u => {
    if (!u) { location.href = '../pages/login.html'; return; }
    me = u;

    const s = await get(ref(db, `users/${me.uid}`));
    if (!s.exists()) { location.href = '../pages/create-username.html'; return; }
    myP = s.val();

    const defaultAva = `https://ui-avatars.com/api/?name=${encodeURIComponent(myP.username||'U')}&background=7C6FFF&color=fff&bold=true&size=80`;
    const ava = myP.avatar || defaultAva;
    setEl('hAvaImg',  el => el.src = ava);
    setEl('sAvaImg',  el => el.src = ava);
    setEl('sUN',      el => el.textContent = myP.username);
    setEl('sEmail',   el => el.textContent = me.email);
    setEl('sJoined',  el => el.textContent = 'Joined ' + new Date(myP.createdAt||Date.now()).toLocaleDateString());
    setEl('sBio',     el => el.value = myP.bio || '');
    setEl('sStatus',  el => el.value = myP.statusMsg || '');
    if (myP.searchable === false) document.getElementById('tSrch')?.classList.remove('on');

    // Show sidebar toggle on desktop
    setEl('chSbToggleBtn', el => el.style.display = '');

    setupPresence();
    loadRooms();
    initEmoji();
    initIcoGrid();
    applyPrefs();
    initNotifications(me.uid, myP.username);
    initRandom(me, myP, enterRandRoom);

    // Re-bind dismissN with correct uid
    window._dismissN = id => _dismissN(me.uid, id);

    // Deep-link room
    const urlRoom = new URLSearchParams(location.search).get('room');
    if (urlRoom) setTimeout(() => joinById(urlRoom), 600);
  });
}

function setEl(id, fn) {
  const el = document.getElementById(id);
  if (el) fn(el);
}

// ─────────────────────────────────────────────────────────────
// PRESENCE
// ─────────────────────────────────────────────────────────────
function setupPresence() {
  const pr = ref(db, `presence/${me.uid}`);
  set(pr, { online: true, lastSeen: Date.now(), username: myP.username, uid: me.uid });
  onDisconnect(pr).set({ online: false, lastSeen: Date.now() });
}

// ─────────────────────────────────────────────────────────────
// ROOMS — sidebar list
// ─────────────────────────────────────────────────────────────
function loadRooms() {
  const u = onValue(ref(db, 'rooms'), snap => {
    const owned = [], joined = [];
    if (snap.exists()) {
      Object.entries(snap.val()).forEach(([id, r]) => {
        if (r.type === 'random') return;
        if (r.owner === me.uid)          owned.push({ id, ...r });
        else if (r.members?.[me.uid])    joined.push({ id, ...r });
      });
    }
    setEl('myRL',     el => el.innerHTML = owned.length  ? owned.map(roomHTML).join('')  : '<div style="padding:.32rem .58rem;font-size:.73rem;color:var(--textD);">No rooms yet</div>');
    setEl('joinedRL', el => el.innerHTML = joined.map(roomHTML).join(''));
  });
  unsubs.push(u);
}

function roomHTML(r) {
  const ico  = r.iconB64 ? `<img src="${r.iconB64}" alt=""/>` : (r.iconEmoji || '🏠');
  const tc   = r.type === 'ghost' ? 'cgh' : 'cp';
  const tl   = r.type === 'ghost' ? 'Ghost' : 'Private';
  const own  = r.owner === me.uid;
  return `<div class="ri" id="ri-${r.id}" onclick="window._goRoom('${r.id}','${r.type||'personal'}')">
    <div class="ricon">${ico}</div>
    <span class="rname">${esc(r.name)}</span>
    <span class="rchip ${tc}">${tl}</span>
    ${own ? `<button class="ri-del" onmouseenter="this.style.color='var(--err)'" onmouseleave="this.style.color='var(--textD)'" onclick="event.stopPropagation();window._deleteRoom('${r.id}')" title="Delete"><i class="fas fa-trash-alt"></i></button>` : ''}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────
function checkNavigateAway() {
  const rVideoEl = document.getElementById('rVideo');
  const vChatEl  = document.getElementById('vChat');
  const inVideo      = rVideoEl && rVideoEl.style.display !== 'none';
  const inRandChat   = vChatEl  && vChatEl.style.display  !== 'none' && activeType === 'random';
  if (inVideo && getVidRoomId()) onNavigateAway('video', getVidRoomId());
  else if (inRandChat && randRoom) onNavigateAway('chat', randRoom);
}

export function goNav(n) {
  checkNavigateAway();
  cleanListeners();
  setNavActive(n);
  if (n === 'random') {
    showView('vRandom');
    setHdr('Random Match', '<i class="fas fa-random"></i> Omegle-style');
    resetRandomUI();
  } else {
    showView('vWelcome');
  }
}

export function goView(v) {
  checkNavigateAway();
  cleanListeners();
  const map = { discover:'vDiscover', usersearch:'vUserSearch', notifications:'vNotifs', settings:'vSettings', welcome:'vWelcome' };
  prevView = v;
  setNavActive(v);
  showView(map[v] || 'vWelcome');
  if (v === 'discover')      { loadDiscover(); setHdr('Discover Rooms',''); }
  else if (v === 'usersearch')   setHdr('Find Users','');
  else if (v === 'notifications'){ setHdr('Notifications',''); markAllRead(me?.uid); }
  else if (v === 'settings')     setHdr('Settings','');
  else if (v === 'welcome')      setHdr('NexusChat','');
}

export function goBack() {
  prevView && prevView !== 'profile' ? goView(prevView) : showView('vWelcome');
}

// ─────────────────────────────────────────────────────────────
// JOIN ROOM
// ─────────────────────────────────────────────────────────────
export async function goRoom(roomId, type) {
  checkNavigateAway();
  cleanListeners();
  activeRoom = roomId; activeType = type;

  document.querySelectorAll('.ri').forEach(el => el.classList.remove('on'));
  document.getElementById('ri-' + roomId)?.classList.add('on');
  setNavActive(roomId === 'global' ? 'global' : null);
  document.getElementById('bn-global')?.classList.toggle('on', roomId === 'global');
  showView('vChat');

  let name = 'Global Chat', meta = '<i class="fas fa-globe"></i> Public community room';

  if (roomId !== 'global') {
    const s = await get(ref(db, `rooms/${roomId}`));
    if (!s.exists()) { toast('Room not found!', 'err'); return; }
    const r = s.val();
    name = r.name;
    meta = r.type === 'ghost' ? '<i class="fas fa-ghost"></i> Ghost — anonymous' : '<i class="fas fa-lock"></i> Private Room';
    if (r.owner !== me.uid) await update(ref(db, `rooms/${roomId}/members`), { [me.uid]: true });

    // Invite / room info button — owner only
    const infoBtn = document.getElementById('roomInfoBtn');
    if (infoBtn) {
      if (r.owner === me.uid) {
        infoBtn.style.display = 'inline-flex';
        window._activeRoomCode = r.joinCode;
        window._activeRoomLink = `${location.origin}${location.pathname}?room=${roomId}`;
      } else {
        infoBtn.style.display = 'none';
      }
    }

    // Leave room button — non-owner joined members
    const leaveBtn = document.getElementById('leaveRoomBtn');
    if (leaveBtn) leaveBtn.style.display = r.owner !== me.uid ? 'inline-flex' : 'none';

    // Show action bar if anything to show
    const bar = document.getElementById('chatActionBar');
    if (bar) bar.classList.toggle('show', r.owner !== me.uid || r.owner === me.uid);
  } else {
    document.getElementById('roomInfoBtn').style.display  = 'none';
    document.getElementById('leaveRoomBtn').style.display = 'none';
    document.getElementById('chatActionBar')?.classList.remove('show');
  }

  setHdr(name, meta);
  loadPinned(roomId);
  subMessages(roomId);
  subTyping(roomId);
  const ta = document.getElementById('chatTa');
  if (ta) ta.placeholder = type === 'ghost' ? 'Chat anonymously...' : 'Message...';
}

export async function joinById(idOrCode) {
  const val = (idOrCode || document.getElementById('joinInp')?.value || '').trim();
  if (!val) { toast('Enter a room ID or join code', 'err'); return; }
  let roomId = val, snap = await get(ref(db, `rooms/${val}`));
  if (!snap.exists()) {
    const cs = await get(ref(db, `joinCodes/${val.toUpperCase()}`));
    if (!cs.exists()) { toast('Room not found!', 'err'); return; }
    roomId = cs.val(); snap = await get(ref(db, `rooms/${roomId}`));
    if (!snap.exists()) { toast('Room not found!', 'err'); return; }
  }
  closeM('joinModal');
  goRoom(roomId, snap.val().type || 'personal');
}

export async function leaveRoom() {
  if (!activeRoom || activeRoom === 'global') return;
  if (!confirm('Leave this room?')) return;
  await update(ref(db, `rooms/${activeRoom}/members`), { [me.uid]: null });
  toast('Left room', 'ok');
  cleanListeners();
  activeRoom = null; activeType = null;
  showView('vWelcome');
  setHdr('NexusChat', '');
}

// ─────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────
function subMessages(roomId) {
  const path = roomId === 'global' ? 'messages/global' : `messages/${roomId}`;
  const wrap = document.getElementById('msgsWrap');
  wrap.innerHTML = '<div class="smsg"><i class="fas fa-circle-notch fa-spin"></i>&nbsp;Loading...</div>';
  msgCache = {};
  const rendered = new Set();

  const u = onValue(query(ref(db, path), limitToLast(120)), snap => {
    if (!snap.exists()) {
      wrap.innerHTML = '<div class="smsg"><i class="fas fa-comments"></i>&nbsp;No messages yet — say hello! 👋</div>';
      return;
    }
    const data = snap.val(); const ids = Object.keys(data);
    if (rendered.size === 0) {
      wrap.innerHTML = ''; wrap._lastDate = null;
      ids.forEach(id => { const m={id,...data[id]}; msgCache[id]=m; rendered.add(id); renderMsg(m,wrap); });
      scrollBottom(); return;
    }
    ids.forEach(id => {
      const m = { id, ...data[id] };
      if (!rendered.has(id)) {
        rendered.add(id); msgCache[id]=m; renderMsg(m,wrap); scrollBottom();
        if (m.uid !== me.uid && m.uid !== 'system') playChime(prefs);
      } else {
        msgCache[id]=m; updateMsgEl(id,m);
      }
    });
  });
  unsubs.push(u);
}

function updateMsgEl(id, m) {
  const bbl = document.getElementById('bbl-' + id);
  if (bbl) {
    if (m.deleted) {
      bbl.className = 'bbl del'; bbl.innerHTML = '<em>Message deleted</em>';
    } else if (m.text) {
      bbl.className = 'bbl' + (bbl.classList.contains('hl') ? ' hl' : '');
      let html = esc(m.text).replace(/\n/g,'<br>').replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
      if (m.imageUrl) html += `<img class="mimg" src="${m.imageUrl}" onclick="window._openImg('${m.imageUrl}')"/>`;
      if (m.gifUrl)   html += `<img class="mgif" src="${m.gifUrl}" loading="lazy" onclick="window._openImg('${m.gifUrl}')"/>`;
      bbl.innerHTML = html;
    }
  }
  const reacEl = document.getElementById('reacts-' + id);
  if (m.reactions && Object.keys(m.reactions).length) {
    const html = Object.entries(m.reactions).map(([em,us]) => {
      const cnt=Object.keys(us).length, mine=!!us[me.uid];
      return `<span class="rchp${mine?' mine':''}" onclick="window._toggleReact('${id}','${em}')">${em}<span class="rcnt">${cnt}</span></span>`;
    }).join('');
    if (reacEl) { reacEl.innerHTML=html; reacEl.style.display='flex'; }
    else {
      const b = document.getElementById('bbl-'+id);
      if (b) { const rd=document.createElement('div'); rd.id='reacts-'+id; rd.className='reacts'; rd.innerHTML=html; b.parentNode.insertBefore(rd,b.nextSibling); }
    }
  } else if (reacEl) { reacEl.innerHTML=''; reacEl.style.display='none'; }
}

function renderMsg(m, c) {
  if (!m.text && !m.imageUrl && !m.gifUrl) return;
  if (m.uid === 'system') {
    const d=document.createElement('div'); d.className='smsg'; d.id='msg-'+m.id;
    d.innerHTML=`<i class="fas fa-info-circle"></i>&nbsp;${esc(m.text)}`; c.appendChild(d); return;
  }
  if (m.timestamp) {
    const ds = new Date(m.timestamp).toDateString();
    if (c._lastDate !== ds) {
      c._lastDate = ds;
      const sep=document.createElement('div'); sep.className='dsep';
      const t=new Date().toDateString(), y=new Date(Date.now()-86400000).toDateString();
      sep.textContent = ds===t?'Today':ds===y?'Yesterday':new Date(m.timestamp).toLocaleDateString([],{month:'long',day:'numeric'});
      c.appendChild(sep);
    }
  }
  const own=m.uid===me.uid, ghost=activeType==='ghost';
  const name = ghost&&!own ? '👻 Ghost' : esc(m.username||'?');
  const ava  = ghost&&!own
    ? 'https://ui-avatars.com/api/?name=G&background=FF5FA0&color=fff&bold=true&size=80'
    : (m.avatar||`https://ui-avatars.com/api/?name=${encodeURIComponent(m.username||'?')}&background=7C6FFF&color=fff&bold=true&size=80`);
  const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
  const reacts = m.reactions
    ? Object.entries(m.reactions).map(([em,us])=>{const cnt=Object.keys(us).length,mine=!!us[me.uid];return`<span class="rchp${mine?' mine':''}" onclick="window._toggleReact('${m.id}','${em}')">${em}<span class="rcnt">${cnt}</span></span>`;}).join('')
    : '';
  const replyH = m.replyTo
    ? `<div class="rprev" onclick="window._scrollToMsg('${m.replyTo.id}')"><div class="rprev-name"><i class="fas fa-reply"></i> ${esc(m.replyTo.username||'?')}</div><span>${esc((m.replyTo.text||'').slice(0,55)+(m.replyTo.text?.length>55?'...':''))}</span></div>`
    : '';
  let bub = m.deleted ? '<em>Message deleted</em>'
    : (m.text ? esc(m.text).replace(/\n/g,'<br>').replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>') : '');
  if (!m.deleted && m.imageUrl) bub += `<img class="mimg" src="${m.imageUrl}" onclick="window._openImg('${m.imageUrl}')"/>`;
  if (!m.deleted && m.gifUrl)   bub += `<img class="mgif" src="${m.gifUrl}" loading="lazy" onclick="window._openImg('${m.gifUrl}')"/>`;
  const receipt = own ? `<div class="receipt${m.seenBy&&Object.keys(m.seenBy).length>1?' seen':''}"><i class="fas fa-check-double"></i></div>` : '';
  const acts = `<div class="macts">
    <button class="mac" onclick="window._showReactBar(event,'${m.id}')"><i class="fas fa-smile"></i></button>
    <button class="mac" onclick="window._setReply('${m.id}','${esc(m.username||'')}','${esc((m.text||'').slice(0,55))}')"><i class="fas fa-reply"></i></button>
    ${own&&!m.deleted?`<button class="mac" onclick="window._editMsg('${m.id}','${esc(m.text||'')}')"><i class="fas fa-pen"></i></button>`:''}
    ${own?`<button class="mac red" onclick="window._deleteMsg('${m.id}')"><i class="fas fa-trash-alt"></i></button>`:''}
    <button class="mac" id="pinbtn-${m.id}" onclick="window._togglePin('${m.id}','${esc((m.text||m.gifUrl||'Image').slice(0,55))}')"><i class="fas fa-thumbtack"></i></button>
    <button class="mac" onclick="window._reportMsg('${m.id}')"><i class="fas fa-flag"></i></button>
  </div>`;

  const div=document.createElement('div'); div.className='mg'+(own?' own':''); div.id='msg-'+m.id;
  div.innerHTML=`
    ${!own?`<div class="mava" onclick="window._showPpop(event,'${m.uid}','${esc(m.username||'')}','${ava}')"><img src="${ava}" alt="${name}" loading="lazy"/></div>`:''}
    <div class="mbody">
      ${replyH}
      <div class="mmeta">
        ${!own?`<span class="mname" onclick="window._showPpop(event,'${m.uid}','${esc(m.username||'')}','${ava}')">${name}</span>`:''}
        <span class="mtime">${time}</span>
        ${m.edited&&!m.deleted?'<span class="medit">(edited)</span>':''}
      </div>
      <div class="bbl${m.deleted?' del':''}" id="bbl-${m.id}">${bub}</div>
      ${reacts?`<div class="reacts" id="reacts-${m.id}">${reacts}</div>`:''}
      ${receipt}
    </div>
    ${own?`<div class="mava" style="cursor:default;"><img src="${myP.avatar||''}" alt="You" loading="lazy"/></div>`:''}
    ${acts}`;
  c.appendChild(div);

  // Long-press for mobile actions
  let lp=null;
  div.addEventListener('touchstart',e=>{lp=setTimeout(()=>{document.querySelectorAll('.mg.touched').forEach(x=>x.classList.remove('touched'));div.classList.add('touched');e.preventDefault();},480);},{passive:false});
  div.addEventListener('touchend',()=>clearTimeout(lp));
  div.addEventListener('touchmove',()=>clearTimeout(lp));
}

export function scrollToMsg(id) {
  const el=document.getElementById('msg-'+id);
  if(el){el.scrollIntoView({behavior:'smooth',block:'center'});const b=document.getElementById('bbl-'+id);b?.classList.add('hl');setTimeout(()=>b?.classList.remove('hl'),1800);}
}
function scrollBottom(){const w=document.getElementById('msgsWrap');requestAnimationFrame(()=>{w.scrollTop=w.scrollHeight;});}

// ── Send ──────────────────────────────────────────────────────
export async function sendMsg() {
  const ta=document.getElementById('chatTa'); const text=ta.value.trim();
  if(!text||!activeRoom)return;
  const now=Date.now(); if(now-(window._ls||0)<700){toast('Slow down!','warn');return;} window._ls=now;
  const path=activeRoom==='global'?'messages/global':`messages/${activeRoom}`;
  const msg={uid:me.uid,username:myP.username,avatar:myP.avatar||'',text,timestamp:Date.now(),edited:false,deleted:false};
  if(replyTo){msg.replyTo={id:replyTo.id,username:replyTo.username,text:replyTo.text};}
  ta.value=''; ta.style.height='auto'; updateCct(); cancelReply(); clearTy();
  await push(ref(db,path),msg).catch(()=>toast('Send failed','err'));
}
export function onInput(){const ta=document.getElementById('chatTa');updateCct();ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,128)+'px';sendTy();}
export function onKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}}
function updateCct(){const v=document.getElementById('chatTa').value.length;const el=document.getElementById('cct');if(el)el.textContent=`${v}/500`;}

// ── Typing ────────────────────────────────────────────────────
function sendTy(){if(!activeRoom)return;if(!isTyping){isTyping=true;set(ref(db,`typing/${activeRoom}/${me.uid}`),{username:myP.username,ts:Date.now()});}clearTimeout(typTO);typTO=setTimeout(clearTy,2000);}
function clearTy(){if(!activeRoom)return;isTyping=false;remove(ref(db,`typing/${activeRoom}/${me.uid}`));}
function subTyping(rid){
  const u=onValue(ref(db,`typing/${rid}`),snap=>{
    const bar=document.getElementById('typingBar');
    if(!snap.exists()){bar.innerHTML='';return;}
    const typers=Object.values(snap.val()).filter(t=>t.username!==myP.username&&Date.now()-t.ts<4000).map(t=>t.username);
    if(!typers.length){bar.innerHTML='';return;}
    const n=typers.length===1?typers[0]:typers.length===2?typers.join(' & '):`${typers[0]} +${typers.length-1}`;
    bar.innerHTML=`<span class="td"></span><span class="td"></span><span class="td"></span>&nbsp;${esc(n)} ${typers.length===1?'is':'are'} typing...`;
  });
  unsubs.push(u);
}

// ── Pinned ────────────────────────────────────────────────────
function loadPinned(rid){
  const pr=rid==='global'?ref(db,'pinned/global'):ref(db,`pinned/${rid}`);
  const u=onValue(pr,snap=>{
    const bar=document.getElementById('pinnedBar');
    document.querySelectorAll('[id^="pinbtn-"]').forEach(b=>b.classList.remove('pin-active'));
    if(!snap.exists()){bar.classList.remove('show');pinId=null;return;}
    const p=snap.val(); pinId=p.msgId;
    const pt=document.getElementById('pinTxt'); if(pt)pt.textContent=p.text||'';
    bar.classList.add('show');
    document.getElementById('pinbtn-'+pinId)?.classList.add('pin-active');
  });
  unsubs.push(u);
}
export async function pinMsg(msgId,text){const p=activeRoom==='global'?'pinned/global':`pinned/${activeRoom}`;await set(ref(db,p),{msgId,text,by:me.uid,ts:Date.now()});toast('Pinned!','ok');}
export async function unpinMsg(){const p=activeRoom==='global'?'pinned/global':`pinned/${activeRoom}`;await remove(ref(db,p));document.getElementById('pinnedBar').classList.remove('show');pinId=null;toast('Unpinned','ok');}
export async function togglePin(msgId,text){if(pinId===msgId)await unpinMsg();else await pinMsg(msgId,text);}

// ── Message actions ───────────────────────────────────────────
function msgPath(id){return activeRoom==='global'?`messages/global/${id}`:`messages/${activeRoom}/${id}`;}
export async function editMsg(msgId,old){const n=prompt('Edit message:',old);if(!n||n===old)return;await update(ref(db,msgPath(msgId)),{text:n,edited:true});}
export async function deleteMsg(msgId){if(!confirm('Delete?'))return;await update(ref(db,msgPath(msgId)),{deleted:true,text:'',imageUrl:null,gifUrl:null});}
export async function clearMsgs(rid){if(!confirm('Clear ALL messages?'))return;await remove(ref(db,`messages/${rid}`));toast('Cleared','ok');}
export async function reportMsg(msgId){const r=prompt('Reason:');if(!r)return;await push(ref(db,'reports'),{messageId:msgId,reporter:me.uid,reason:r,roomId:activeRoom,ts:Date.now()});toast('Reported','ok');}

// ── Reactions ─────────────────────────────────────────────────
export function showReactBar(e,msgId){
  e.stopPropagation();e.preventDefault();
  document.getElementById('qrbar')?.remove();
  const ems=['👍','❤️','😂','😮','😢','🔥','🎉','💯','😍','🤯'];
  const bar=document.createElement('div');bar.id='qrbar';
  bar.style.cssText='position:fixed;z-index:9998;background:var(--panel);border:1px solid var(--border2);border-radius:var(--rPill);padding:.26rem .36rem;display:flex;gap:.16rem;box-shadow:var(--sh);';
  bar.style.left=Math.min(e.clientX-80,window.innerWidth-260)+'px';
  bar.style.top=Math.max(e.clientY-54,8)+'px';
  ems.forEach(em=>{const b=document.createElement('button');b.className='epbtn';b.textContent=em;b.style.fontSize='1.2rem';b.onclick=async()=>{bar.remove();const path=`${msgPath(msgId)}/reactions/${em}/${me.uid}`;const s=await get(ref(db,path));if(s.exists())await remove(ref(db,path));else await set(ref(db,path),true);};bar.appendChild(b);});
  document.body.appendChild(bar);
  const close=()=>{bar.remove();document.removeEventListener('click',close);};
  setTimeout(()=>document.addEventListener('click',close),80);
}
export async function toggleReact(msgId,emoji){const path=`${msgPath(msgId)}/reactions/${emoji}/${me.uid}`;const s=await get(ref(db,path));if(s.exists())await remove(ref(db,path));else await set(ref(db,path),true);}

// ── Reply ─────────────────────────────────────────────────────
export function setReply(id,un,txt){replyTo={id,username:un,text:txt};const n=document.getElementById('rctxName');const p=document.getElementById('rctxPrev');if(n)n.textContent=un;if(p)p.textContent=txt;document.getElementById('rctxEl')?.classList.add('show');const ta=document.getElementById('chatTa');if(ta){ta.classList.add('ron');ta.focus();}}
export function cancelReply(){replyTo=null;document.getElementById('rctxEl')?.classList.remove('show');document.getElementById('chatTa')?.classList.remove('ron');}

// ── Image ─────────────────────────────────────────────────────
export async function sendImage(e){
  const f=e.target.files[0];if(!f||!activeRoom)return;
  if(f.size>2*1024*1024){toast('Max 2MB','err');return;}
  const r=new FileReader();
  r.onload=async ev=>{const p=activeRoom==='global'?'messages/global':`messages/${activeRoom}`;await push(ref(db,p),{uid:me.uid,username:myP.username,avatar:myP.avatar||'',text:'',imageUrl:ev.target.result,timestamp:Date.now(),edited:false,deleted:false});};
  r.readAsDataURL(f);e.target.value='';
}
export function openImg(src){
  const ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn .18s ease;';
  const cb=document.createElement('button');cb.innerHTML='<i class="fas fa-times"></i>';cb.style.cssText='position:absolute;top:16px;right:16px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.3);color:#fff;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;';cb.onclick=()=>ov.remove();
  const img=document.createElement('img');img.src=src;img.style.cssText='max-width:92vw;max-height:90vh;border-radius:var(--r);box-shadow:var(--sh);cursor:default;';img.onclick=e=>e.stopPropagation();
  ov.onclick=()=>ov.remove();ov.appendChild(cb);ov.appendChild(img);document.body.appendChild(ov);
}

// ── Msg search ────────────────────────────────────────────────
export function toggleMsgSearch(){const el=document.getElementById('msgSB');el.classList.toggle('open');if(el.classList.contains('open'))document.getElementById('msSrchInp')?.focus();else{const c=document.getElementById('msSrchCnt');if(c)c.textContent='';document.querySelectorAll('.bbl.hl').forEach(b=>b.classList.remove('hl'));}}
export function searchMsgs(q){document.querySelectorAll('.bbl.hl').forEach(b=>b.classList.remove('hl'));const c=document.getElementById('msSrchCnt');if(!q){if(c)c.textContent='';return;}const m=Object.values(msgCache).filter(x=>x.text&&x.text.toLowerCase().includes(q.toLowerCase()));if(c)c.textContent=`${m.length} found`;m.forEach(msg=>{document.getElementById('bbl-'+msg.id)?.classList.add('hl');});if(m.length)scrollToMsg(m[0].id);}

// ── Emoji ─────────────────────────────────────────────────────
let eCat='Smileys';
export function initEmoji(){
  const tabs=document.getElementById('epTabs');if(!tabs)return;
  Object.entries(ECAT).forEach(([e,cat])=>{const b=document.createElement('button');b.className='eptab'+(cat===eCat?' on':'');b.textContent=e;b.title=cat;b.onclick=()=>{eCat=cat;document.querySelectorAll('.eptab').forEach(x=>x.classList.remove('on'));b.classList.add('on');renderEmoji(EMS[cat]);};tabs.appendChild(b);});
  renderEmoji(EMS[eCat]);
}
function renderEmoji(ems){const g=document.getElementById('epGrid');if(!g)return;g.innerHTML='';ems.forEach(e=>{const b=document.createElement('button');b.className='epbtn';b.textContent=e;b.onclick=()=>{const ta=document.getElementById('chatTa');if(ta){ta.value+=e;ta.focus();updateCct();}closeEP();};g.appendChild(b);});}
export function toggleEmoji(){document.getElementById('epicker')?.classList.toggle('open');}
function closeEP(){document.getElementById('epicker')?.classList.remove('open');}
document.addEventListener('click',e=>{
  if(!e.target.closest('#epWrap'))closeEP();
  if(!e.target.closest('.mg'))document.querySelectorAll('.mg.touched').forEach(el=>el.classList.remove('touched'));
});

// ── Icon grid ─────────────────────────────────────────────────
export function initIcoGrid(){
  const g=document.getElementById('icoGrid');if(!g)return;
  ICOS.forEach(ic=>{const b=document.createElement('button');b.style.cssText='width:40px;height:40px;border-radius:8px;border:1.5px solid var(--border2);background:var(--panel2);cursor:pointer;font-size:1.32rem;display:flex;align-items:center;justify-content:center;transition:all .14s;';b.textContent=ic;b.onmouseenter=()=>{b.style.borderColor='var(--accent)';b.style.background='var(--panel3)';};b.onmouseleave=()=>{b.style.borderColor='var(--border2)';b.style.background='var(--panel2)';};b.onclick=()=>{crIcoEmoji=ic;crIcoB64=null;const p=document.getElementById('crIcoPrev');if(p){p.innerHTML=ic;p.style.background='linear-gradient(135deg,var(--accent),var(--accent2))';}closeM('icoModal');};g.appendChild(b);});
}
export function previewRoomIco(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{crIcoB64=ev.target.result;const p=document.getElementById('crIcoPrev');if(p){p.innerHTML=`<img src="${crIcoB64}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;"/>`;p.style.background='none';}};r.readAsDataURL(f);}

// ── Create room ───────────────────────────────────────────────
export async function createRoom(){
  const name=document.getElementById('crName').value.trim();if(!name){toast('Enter a room name','err');return;}
  const desc=document.getElementById('crDesc').value.trim();
  const cat=document.getElementById('crCat').value;
  const tags=document.getElementById('crTags').value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,5);
  const type=document.getElementById('crType').value;
  const joinCode=Math.floor(100000+Math.random()*900000).toString();
  const rRef=push(ref(db,'rooms'));const id=rRef.key;
  await set(rRef,{name,desc,cat,tags,type,iconEmoji:crIcoEmoji,iconB64:crIcoB64||null,owner:me.uid,ownerName:myP.username,createdAt:Date.now(),members:{[me.uid]:true},isPublic:!!cat,joinCode});
  await set(ref(db,`joinCodes/${joinCode}`),id);
  closeM('crModal');['crName','crDesc','crTags'].forEach(fid=>{const el=document.getElementById(fid);if(el)el.value='';});
  crIcoB64=null;crIcoEmoji='🏠';const p=document.getElementById('crIcoPrev');if(p){p.innerHTML='🏠';p.style.background='linear-gradient(135deg,var(--accent),var(--accent2))';}
  const link=`${location.origin}${location.pathname}?room=${id}`;
  const jc=document.getElementById('rcJoinCode');const rl=document.getElementById('rcInviteLink');
  if(jc)jc.textContent=joinCode;if(rl)rl.value=link;
  window._rcCode=joinCode;window._rcLink=link;
  openM('roomCreatedModal');
  goRoom(id,type);
}
export async function deleteRoom(rid){
  if(!confirm('Delete this room?'))return;
  const s=await get(ref(db,`rooms/${rid}`));if(!s.exists()||s.val().owner!==me.uid){toast('Permission denied','err');return;}
  const code=s.val().joinCode;
  await remove(ref(db,`rooms/${rid}`));await remove(ref(db,`messages/${rid}`));await remove(ref(db,`pinned/${rid}`));if(code)await remove(ref(db,`joinCodes/${code}`));
  toast('Room deleted','ok');if(activeRoom===rid){activeRoom=null;showView('vWelcome');}
}
export function showRoomInfo(){
  const code=window._activeRoomCode,link=window._activeRoomLink;
  if(!code&&!link){toast('No invite info','err');return;}
  const jc=document.getElementById('rcJoinCode');const rl=document.getElementById('rcInviteLink');
  if(jc)jc.textContent=code;if(rl)rl.value=link;
  window._rcCode=code;window._rcLink=link;openM('roomCreatedModal');
}
export function copyL(link,rid){navigator.clipboard.writeText(link).then(()=>toast('Link copied!','ok')).catch(()=>navigator.clipboard.writeText(rid).then(()=>toast('ID copied!','ok')));}

// ── Discover ──────────────────────────────────────────────────
let dCat='all';
export function loadDiscover(){
  get(ref(db,'rooms')).then(snap=>{
    const g=document.getElementById('dGrid');if(!g)return;
    if(!snap.exists()){g.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--textD);">No public rooms yet.</div>';return;}
    const rooms=Object.entries(snap.val()).map(([id,r])=>({id,...r})).filter(r=>r.type!=='random'&&r.isPublic);
    const fil=dCat==='all'?rooms:rooms.filter(r=>r.cat===dCat);
    if(!fil.length){g.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--textD);">No rooms in this category.</div>';return;}
    g.innerHTML=fil.map(r=>{const ico=r.iconB64?`<img src="${r.iconB64}" style="width:100%;height:100%;object-fit:cover;border-radius:7px;"/>`:(r.iconEmoji||'🏠');const tags=(r.tags||[]).map(t=>`<span class="dtag">${esc(t)}</span>`).join('');return`<div class="dcard" onclick="window._goRoom('${r.id}','${r.type||'personal'}')"><div class="dcard-top"><div class="dico">${ico}</div><div><div class="dname">${esc(r.name)}</div><div class="dtype">${r.cat||'General'}</div></div></div>${r.desc?`<div class="ddesc">${esc(r.desc)}</div>`:''}<div class="dfoot"><div class="dtags">${tags}</div><span>${new Date(r.createdAt).toLocaleDateString()}</span></div></div>`;}).join('');
  });
}
export function dFilter(cat,el){dCat=cat;document.querySelectorAll('.dfc').forEach(c=>c.classList.remove('on'));el.classList.add('on');loadDiscover();}

// ── User search ───────────────────────────────────────────────
let usTO=null;
export function searchUsers(q){
  clearTimeout(usTO);const res=document.getElementById('uSrchRes');
  if(!q){res.innerHTML='<div style="text-align:center;color:var(--textD);padding:2rem;font-size:.82rem;">Type a username to search</div>';return;}
  res.innerHTML='<div style="text-align:center;color:var(--textD);padding:1rem;"><i class="fas fa-circle-notch fa-spin" style="font-size:1.1rem;color:var(--accent);"></i></div>';
  usTO=setTimeout(async()=>{
    const snap=await get(ref(db,'usernames'));
    if(!snap.exists()){res.innerHTML='<div style="text-align:center;color:var(--textD);padding:1rem;font-size:.82rem;">No users found</div>';return;}
    const matches=Object.entries(snap.val()).filter(([un])=>un.toLowerCase().includes(q.toLowerCase())).slice(0,15);
    if(!matches.length){res.innerHTML='<div style="text-align:center;color:var(--textD);padding:1rem;font-size:.82rem;">No users found</div>';return;}
    const profiles=await Promise.all(matches.map(async([,uid])=>{try{const s=await get(ref(db,`users/${uid}`));return s.exists()?{uid,...s.val()}:null;}catch{return null;}}));
    const valid=profiles.filter(p=>p&&p.searchable!==false&&p.username);
    if(!valid.length){res.innerHTML='<div style="text-align:center;color:var(--textD);padding:1rem;font-size:.82rem;">No visible users found</div>';return;}
    res.innerHTML=valid.map(u=>{const av=u.avatar||`https://ui-avatars.com/api/?name=${encodeURIComponent(u.username)}&background=7C6FFF&color=fff&bold=true&size=80`;return`<div style="display:flex;align-items:center;gap:.62rem;padding:.6rem .68rem;background:var(--panel);border:1px solid var(--border2);border-radius:var(--rSm);margin-bottom:.38rem;cursor:pointer;transition:border-color .15s;" onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor='var(--border2)'" onclick="window._openProfilePage('${u.uid}')"><div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0;"><img src="${av}" style="width:100%;height:100%;object-fit:cover;"/></div><div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:.85rem;">${esc(u.username)}</div><div style="font-size:.71rem;color:var(--textD);">${esc(u.statusMsg||'')}</div></div><div style="display:flex;gap:.3rem;"><button class="btn btn-xs btn-primary" onclick="event.stopPropagation();window._openProfilePage('${u.uid}')"><i class="fas fa-user"></i></button><button class="btn btn-xs btn-secondary" onclick="event.stopPropagation();window._sendInvite('${u.uid}','${esc(u.username)}')"><i class="fas fa-paper-plane"></i> Invite</button></div></div>`;}).join('');
  },380);
}

// ── Full profile page ─────────────────────────────────────────
let profileUid=null;
export async function openProfilePage(uid){
  prevView='usersearch';profileUid=uid;showView('vProfile');setHdr('User Profile','');
  setEl('pvAvaImg',el=>el.src='');setEl('pvName',el=>el.textContent='Loading...');
  setEl('pvUN',el=>el.textContent='');setEl('pvBio',el=>{el.innerHTML='';el.style.display='none';});
  setEl('pvStats',el=>el.innerHTML='');setEl('pvActions',el=>el.innerHTML='');
  setEl('pvInfoContent',el=>el.innerHTML='');setEl('pvFriendsSection',el=>el.style.display='none');
  const snap=await get(ref(db,`users/${uid}`));if(!snap.exists()){toast('User not found','err');return;}
  const u={uid,...snap.val()};
  const av=u.avatar||`https://ui-avatars.com/api/?name=${encodeURIComponent(u.username)}&background=7C6FFF&color=fff&bold=true&size=80`;
  setEl('pvAvaImg',el=>el.src=av);setEl('pvName',el=>el.textContent=u.username);setEl('pvUN',el=>el.textContent='@'+u.username);
  if(u.bio||u.statusMsg){setEl('pvBio',el=>{el.textContent=u.bio||u.statusMsg||'';el.style.display='block';});}
  const presSnap=await get(ref(db,`presence/${uid}`));const isOnline=presSnap.exists()&&presSnap.val().online;
  setEl('pvStatus',el=>el.innerHTML=`<span class="sdot ${isOnline?'son':'soff'}"></span> ${isOnline?'Online':'Offline'}`);
  setEl('pvStats',el=>el.innerHTML=`<div class="pv-stat"><div class="pv-stat-n">${new Date(u.createdAt||Date.now()).toLocaleDateString([],{month:'short',year:'numeric'})}</div><div class="pv-stat-l">Joined</div></div><div class="pv-stat" id="pvFriendCount"><div class="pv-stat-n">—</div><div class="pv-stat-l">Friends</div></div>`);
  setEl('pvInfoContent',el=>el.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;"><div style="background:var(--panel2);border-radius:var(--rSm);padding:.5rem .7rem;"><div style="font-size:.67rem;color:var(--textD);margin-bottom:.12rem;text-transform:uppercase;letter-spacing:.06em;">Status</div><div style="font-size:.82rem;">${esc(u.statusMsg||'Hey there!')}</div></div><div style="background:var(--panel2);border-radius:var(--rSm);padding:.5rem .7rem;"><div style="font-size:.67rem;color:var(--textD);margin-bottom:.12rem;text-transform:uppercase;letter-spacing:.06em;">Member since</div><div style="font-size:.82rem;">${new Date(u.createdAt||Date.now()).toLocaleDateString()}</div></div></div>`);
  if(uid!==me.uid){
    const fSnap=await get(ref(db,`friends/${me.uid}/${uid}`));const isFriend=fSnap.exists();
    setEl('pvActions',el=>el.innerHTML=`<button class="btn btn-sm btn-secondary" id="pvFriendActBtn" onclick="window._toggleFriendProfile('${uid}')"><i class="fas fa-${isFriend?'user-minus':'user-plus'}"></i> ${isFriend?'Unfriend':'Add Friend'}</button><button class="btn btn-sm btn-primary" onclick="window._sendInvite('${uid}','${esc(u.username)}')"><i class="fas fa-paper-plane"></i> Invite</button>`);
  }
  _loadProfileFriends(uid);
}
async function _loadProfileFriends(uid){
  const snap=await get(ref(db,`friends/${uid}`));const count=snap.exists()?Object.keys(snap.val()).length:0;
  const ce=document.getElementById('pvFriendCount');if(ce)ce.querySelector('.pv-stat-n').textContent=count;
  if(!count)return;
  setEl('pvFriendsSection',el=>el.style.display='block');
  const friendIds=Object.keys(snap.val()).slice(0,8);
  const fps=await Promise.all(friendIds.map(async fid=>{const s=await get(ref(db,`users/${fid}`));return s.exists()?{uid:fid,...s.val()}:null;}));
  setEl('pvFriendsList',el=>el.innerHTML=fps.filter(Boolean).map(f=>`<div class="friend-row" onclick="window._openProfilePage('${f.uid}')"><div class="friend-ava"><img src="${f.avatar||''}" alt="${esc(f.username)}"/><div class="sdot soff" style="border:2px solid var(--panel);"></div></div><div style="flex:1;min-width:0;"><div class="friend-name">${esc(f.username)}</div><div class="friend-sub">${esc(f.statusMsg||'')}</div></div><i class="fas fa-chevron-right" style="color:var(--textD);font-size:.76rem;"></i></div>`).join(''));
}

// ── Friends ───────────────────────────────────────────────────
export async function toggleFriendProfile(uid){
  const btn=document.getElementById('pvFriendActBtn');
  const fSnap=await get(ref(db,`friends/${me.uid}/${uid}`));
  if(fSnap.exists()){
    if(!confirm('Remove friend?'))return;
    await remove(ref(db,`friends/${me.uid}/${uid}`));await remove(ref(db,`friends/${uid}/${me.uid}`));
    if(btn)btn.innerHTML='<i class="fas fa-user-plus"></i> Add Friend';toast('Friend removed','ok');
  }else{
    await set(ref(db,`friends/${me.uid}/${uid}`),{since:Date.now()});await set(ref(db,`friends/${uid}/${me.uid}`),{since:Date.now()});
    await sendFriendNotif(db,me.uid,myP.username,myP.avatar||'',uid);
    if(btn)btn.innerHTML='<i class="fas fa-user-minus"></i> Unfriend';toast('Friend added!','ok');
  }
}
export async function toggleFriendFromPopup(){
  if(!ppopUid)return;const fSnap=await get(ref(db,`friends/${me.uid}/${ppopUid}`));
  const btn=document.getElementById('ppFriendBtn');
  if(fSnap.exists()){
    if(!confirm('Remove friend?'))return;
    await remove(ref(db,`friends/${me.uid}/${ppopUid}`));await remove(ref(db,`friends/${ppopUid}/${me.uid}`));
    if(btn)btn.innerHTML='<i class="fas fa-user-plus"></i> Add Friend';toast('Removed','ok');
  }else{
    await set(ref(db,`friends/${me.uid}/${ppopUid}`),{since:Date.now()});await set(ref(db,`friends/${ppopUid}/${me.uid}`),{since:Date.now()});
    await sendFriendNotif(db,me.uid,myP.username,myP.avatar||'',ppopUid);
    if(btn)btn.innerHTML='<i class="fas fa-user-minus"></i> Unfriend';toast('Added!','ok');
  }
}
export function openFullProfile(){if(ppopUid){closePpop();openProfilePage(ppopUid);}}

// ── Profile popup ─────────────────────────────────────────────
export async function showPpop(e,uid,un,ava){
  e.stopPropagation();ppopUid=uid;ppopUN=un;
  const pop=document.getElementById('ppop');
  const fa=ava||`https://ui-avatars.com/api/?name=${encodeURIComponent(un||'?')}&background=7C6FFF&color=fff&bold=true&size=80`;
  setEl('ppAva',el=>el.src=fa);setEl('ppName',el=>el.textContent=un);
  setEl('ppBio',el=>el.textContent='');setEl('ppSt',el=>el.innerHTML='<span class="sdot son"></span> Online');
  get(ref(db,`users/${uid}`)).then(async s=>{if(s.exists()){const u=s.val();setEl('ppBio',el=>el.textContent=u.bio||u.statusMsg||'');const fSnap=await get(ref(db,`friends/${me.uid}/${uid}`));setEl('ppFriendBtn',el=>el.innerHTML=`<i class="fas fa-user-${fSnap.exists()?'minus':'plus'}"></i> ${fSnap.exists()?'Unfriend':'Add Friend'}`);}});
  const x=Math.min(e.clientX+10,window.innerWidth-230),y=Math.min(e.clientY-20,window.innerHeight-300);
  if(pop){pop.style.left=x+'px';pop.style.top=y+'px';pop.classList.add('show');}
}
export async function fetchPpop(e,uid){const s=await get(ref(db,`users/${uid}`));if(s.exists()){const u=s.val();showPpop(e,uid,u.username,u.avatar);}}
export function closePpop(){document.getElementById('ppop')?.classList.remove('show');ppopUid=null;}
export function inviteFromPopup(){if(ppopUid)sendInvite(ppopUid,ppopUN);closePpop();}
document.addEventListener('click',e=>{if(!e.target.closest('.ppop')&&!e.target.closest('.mava')&&!e.target.closest('.urow'))closePpop();});

// ── Invite ────────────────────────────────────────────────────
export async function sendInvite(toUid,toUN){
  if(!activeRoom||activeRoom==='global'){toast('Select a private room first','err');return;}
  const snap=await get(ref(db,`rooms/${activeRoom}`));if(!snap.exists())return;
  const r=snap.val(),link=`${location.origin}${location.pathname}?room=${activeRoom}`;
  await sendInviteNotif(db,me.uid,myP.username,myP.avatar||'',toUid,activeRoom,r.name,r.joinCode||'',link);
  toast(`Invite sent to ${toUN}!`,'ok');
}
export async function acceptInvite(nid,roomId,roomName){
  await _dismissN(me.uid,nid);goRoom(roomId,'personal');toast(`Joined ${roomName}!`,'ok');
}

// ── Random match bridge ───────────────────────────────────────
export async function enterRandRoom(rid){
  showView('vChat');
  document.getElementById('randCtrl')?.remove();
  const ctrl=document.createElement('div');ctrl.id='randCtrl';ctrl.className='rand-ctrl';
  ctrl.innerHTML=`<button class="btn btn-secondary btn-sm" onclick="window._nextStranger()"><i class="fas fa-forward"></i> Next Stranger</button><button class="btn btn-danger btn-sm" onclick="window._reportStranger()"><i class="fas fa-flag"></i> Report</button><div class="rand-lbl"><i class="fas fa-circle" style="font-size:.48rem;"></i>&nbsp;Stranger connected</div>`;
  document.getElementById('vChat').insertBefore(ctrl,document.getElementById('typingBar'));
  randRoom=rid;activeRoom=rid;activeType='random';
  setHdr('Random Chat','<i class="fas fa-random"></i> 1-on-1 with a stranger');
  await push(ref(db,`messages/${rid}`),{uid:'system',text:'🎲 Stranger connected! Say hello 👋',timestamp:Date.now(),edited:false,deleted:false});
  subMessages(rid);subTyping(rid);
}
export async function resumeSession(){
  const state=getResumeState();if(!state)return;
  hideResumeBanner();
  if(state.mode==='video'){
    showView('vRandom');setNavActive('random');
    setHdr('Video Match','<i class="fas fa-video"></i> Face to face');
    ['rIdle','rSearching'].forEach(id=>document.getElementById(id).style.display='none');
    document.getElementById('rVideo').style.display='flex';
  }else{await enterRandRoom(state.roomId);}
  clearResumeState();
}
export async function endAndDismiss(){await endVideoCall();hideResumeBanner();clearResumeState();showView('vRandom');resetRandomUI();}

// ── Settings ──────────────────────────────────────────────────
export async function changeAva(e){
  const f=e.target.files[0];if(!f)return;
  if(f.size>1.3*1024*1024){toast('Max 1.3MB','err');return;}
  const r=new FileReader();r.onload=async ev=>{const b64=ev.target.result;setEl('sAvaImg',el=>el.src=b64);setEl('hAvaImg',el=>el.src=b64);await update(ref(db,`users/${me.uid}`),{avatar:b64,avatarCustom:true});myP.avatar=b64;toast('Avatar updated!','ok');};r.readAsDataURL(f);
}
export async function saveProfile(){const bio=document.getElementById('sBio')?.value.trim(),sm=document.getElementById('sStatus')?.value.trim();await update(ref(db,`users/${me.uid}`),{bio,statusMsg:sm});myP.bio=bio;myP.statusMsg=sm;toast('Saved!','ok');}
export async function togglePref(el,key){el.classList.toggle('on');await update(ref(db,`users/${me.uid}`),{[key]:el.classList.contains('on')});}
export function toggleLocal(el,key){el.classList.toggle('on');prefs[key]=el.classList.contains('on');localStorage.setItem('nc_prefs',JSON.stringify(prefs));}
export async function reqDesktop(el){el.classList.toggle('on');if(el.classList.contains('on')){const p=await Notification.requestPermission();if(p!=='granted'){el.classList.remove('on');toast('Notifications blocked','err');}}}
function applyPrefs(){if(prefs.sound===false)document.getElementById('tSnd')?.classList.remove('on');}
let unTO2=null;
export function checkUN(){
  clearTimeout(unTO2);const v=document.getElementById('sNewUN')?.value.trim(),el=document.getElementById('sUNNote');if(!v){if(el){el.textContent='';el.className='fnote';}return;}
  unTO2=setTimeout(async()=>{const s=await get(ref(db,`usernames/${v.toLowerCase()}`));if(el){if(s.exists()){el.innerHTML='<i class="fas fa-times-circle"></i> Taken';el.className='fnote err';}else{el.innerHTML='<i class="fas fa-check-circle"></i> Available';el.className='fnote ok';}}},440);
}
export async function updateUN(){
  const un=document.getElementById('sNewUN')?.value.trim();if(!un)return;
  if(!/^[a-zA-Z0-9_]{4,20}$/.test(un)){toast('Invalid username','err');return;}
  const days=(Date.now()-(myP.unLastChanged||0))/(1000*60*60*24);if(days<30){toast(`Can change in ${Math.ceil(30-days)} days`,'err');return;}
  const s=await get(ref(db,`usernames/${un.toLowerCase()}`));if(s.exists()){toast('Username taken!','err');return;}
  await remove(ref(db,`usernames/${myP.username.toLowerCase()}`));await set(ref(db,`usernames/${un.toLowerCase()}`),me.uid);await update(ref(db,`users/${me.uid}`),{username:un,unLastChanged:Date.now()});
  myP.username=un;setEl('sUN',el=>el.textContent=un);setEl('sNewUN',el=>el.value='');toast('Username updated!','ok');
}

// ── Logout ────────────────────────────────────────────────────
export async function doLogout(){
  if(!confirm('Sign out?'))return;
  await cleanupVideoCall().catch(()=>{});
  cleanListeners();clearTy();destroyNotifications();
  await remove(ref(db,`presence/${me.uid}`));
  await remove(ref(db,`matchQueue/${me.uid}`));
  await remove(ref(db,`videoQueue/${me.uid}`));
  await signOut(auth);location.href='../pages/login.html';
}

// ── Cleanup ───────────────────────────────────────────────────
export function cleanListeners(){unsubs.forEach(fn=>{try{fn();}catch{}});unsubs=[];clearTimeout(typTO);document.getElementById('randCtrl')?.remove();randRoom=null;}
export function filterRooms(q){document.querySelectorAll('.ri').forEach(el=>{const n=el.querySelector('.rname')?.textContent?.toLowerCase()||'';el.style.display=n.includes(q.toLowerCase())?'':'none';});}

// ─────────────────────────────────────────────────────────────
// GLOBAL WINDOW BINDINGS  (called from HTML onclick attrs)
// ─────────────────────────────────────────────────────────────
function exposeGlobals() {
  const W = window;
  // nav
  W.goNav = goNav; W.goView = goView; W.goBack = goBack;
  W._goRoom = goRoom; W.goRoom = goRoom;
  // modals
  W.openM = openM; W.closeM = closeM;
  // sidebar
  W.closeSb = closeSb; W.checkSb = _checkSb; W.toggleChSb = toggleChSb;
  // rooms
  W.joinById = joinById; W.leaveRoom = leaveRoom;
  W.createRoom = createRoom; W._deleteRoom = deleteRoom; W.deleteRoom = deleteRoom;
  W.showRoomInfo = showRoomInfo; W.copyL = copyL;
  W.copyRcCode = () => navigator.clipboard.writeText(W._rcCode||'').then(()=>toast('Code copied!','ok'));
  W.copyRcLink = () => navigator.clipboard.writeText(W._rcLink||'').then(()=>toast('Link copied!','ok'));
  W.previewRoomIco = previewRoomIco;
  W.filterRooms = filterRooms;
  // messages
  W.sendMsg = sendMsg; W.onInput = onInput; W.onKey = onKey;
  W._scrollToMsg = scrollToMsg; W.scrollToMsg = scrollToMsg;
  W.scrollToPin = () => { if (pinId) scrollToMsg(pinId); };
  W.closePinned = () => document.getElementById('pinnedBar')?.classList.remove('show');
  W.unpinMsg = unpinMsg; W._togglePin = togglePin;
  W._setReply = setReply; W.setReply = setReply; W.cancelReply = cancelReply;
  W._editMsg = editMsg; W._deleteMsg = deleteMsg; W._reportMsg = reportMsg;
  W.clearMsgs = clearMsgs;
  W._showReactBar = showReactBar; W.showReactBar = showReactBar;
  W._toggleReact = toggleReact;
  W.toggleEmoji = toggleEmoji;
  W.sendImage = sendImage; W._openImg = openImg; W.openImg = openImg;
  W.toggleMsgSearch = toggleMsgSearch; W.searchMsgs = searchMsgs;
  // discover
  W.dFilter = dFilter;
  // user search / profiles
  W.searchUsers = searchUsers;
  W._openProfilePage = openProfilePage; W.openProfilePage = openProfilePage;
  W._toggleFriendProfile = toggleFriendProfile;
  W.toggleFriendFromPopup = toggleFriendFromPopup; W.openFullProfile = openFullProfile;
  W._showPpop = showPpop; W.showPpop = showPpop; W.fetchPpop = fetchPpop;
  W.closePpop = closePpop; W.inviteFromPopup = inviteFromPopup;
  W._sendInvite = sendInvite; W.sendInvite = sendInvite;
  W._acceptInvite = acceptInvite;
  // notifications
  W.markAllReadUI    = () => markAllRead(me?.uid);
  W.clearAllNotifsUI = () => clearAllNotifs(me?.uid);
  // settings
  W.changeAva = changeAva; W.saveProfile = saveProfile;
  W.togglePref = togglePref; W.toggleLocal = toggleLocal; W.reqDesktop = reqDesktop;
  W.checkUN = checkUN; W.updateUN = updateUN;
  W.toggleThemeBtn = el => { el.classList.toggle('on'); applyTheme(el.classList.contains('on')?'dark':'light'); };
  W.doLogout = doLogout;
  // random / video
  W.startMatchUI       = m  => startMatch(m);
  W.cancelMatchUI      = () => cancelMatch();
  W.toggleMuteUI       = () => toggleMute();
  W.toggleCamUI        = () => toggleCam();
  W.toggleBlurUI       = () => toggleBlur();
  W.endVideoCallUI     = async() => { await endVideoCall(); showView('vRandom'); resetRandomUI(); };
  W.nextVideoStrangerUI= () => nextVideoStranger();
  W.sendVidMsgUI       = () => sendVidMsg();
  W.vidKeyUI           = e  => { if(e.key==='Enter') sendVidMsg(); };
  W.sendReactUI        = emoji => sendReact(emoji);
  W._nextStranger      = () => nextStranger(randRoom, cleanListeners, showView);
  W._reportStranger    = () => { const r=prompt('Reason for reporting?'); if(r) toast('Reported','ok'); };
  W._resumeSession     = resumeSession;
  W._endAndDismiss     = endAndDismiss;
}
