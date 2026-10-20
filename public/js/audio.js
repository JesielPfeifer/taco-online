// Tiny WebAudio synth for game sounds (no asset files needed).
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(m) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function tone({ freq = 440, end = freq, dur = 0.15, type = 'sine', vol = 0.25, delay = 0 }) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.2, vol = 0.2, filter = 1200, delay = 0 }) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource();
  s.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filter;
  const g = a.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start(t);
}

export const sfx = {
  unlock: () => ac(),
  hit: (q = 1) => {
    tone({ freq: 220 + q * 160, end: 90, dur: 0.12, type: 'triangle', vol: 0.5 });
    noise({ dur: 0.08, vol: 0.35, filter: 1800 });
  },
  swing: () => noise({ dur: 0.18, vol: 0.12, filter: 600 }),
  throw: () => noise({ dur: 0.14, vol: 0.1, filter: 900 }),
  clank: () => {
    tone({ freq: 520, end: 480, dur: 0.18, type: 'square', vol: 0.15 });
    tone({ freq: 780, end: 700, dur: 0.22, type: 'triangle', vol: 0.2, delay: 0.02 });
  },
  knock: () => {
    tone({ freq: 160, end: 60, dur: 0.3, type: 'square', vol: 0.3 });
    noise({ dur: 0.3, vol: 0.3, filter: 500 });
  },
  catch: () => tone({ freq: 300, end: 200, dur: 0.06, type: 'sine', vol: 0.3 }),
  point: () => {
    tone({ freq: 660, dur: 0.1, type: 'triangle', vol: 0.25 });
    tone({ freq: 990, dur: 0.16, type: 'triangle', vol: 0.25, delay: 0.1 });
  },
  whistle: () => {
    tone({ freq: 1800, end: 2100, dur: 0.25, type: 'sine', vol: 0.18 });
    tone({ freq: 1800, end: 1500, dur: 0.35, type: 'sine', vol: 0.18, delay: 0.3 });
  },
  bad: () => tone({ freq: 300, end: 120, dur: 0.35, type: 'sawtooth', vol: 0.15 }),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.25, delay: i * 0.14 })),
  cheer: () => noise({ dur: 1.2, vol: 0.25, filter: 2500 }),
};
