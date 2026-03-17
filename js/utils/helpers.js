/* ===== NexusChat v2 – Helpers ===== */

/** HTML-escape a string */
export function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Human-readable time ago */
export function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'Just now';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}

/** Play notification chime */
export function playChime(prefs) {
  if (!prefs.sound) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, start, dur, vol = .07) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, ac.currentTime + start);
      g.gain.linearRampToValueAtTime(vol, ac.currentTime + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + start + dur);
      o.start(ac.currentTime + start); o.stop(ac.currentTime + start + dur);
    };
    play(880, 0, .18); play(1100, .15, .18);
  } catch {}
}
