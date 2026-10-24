// 効果音（WebAudio で生成。音声ファイル不要）＋ 振動
let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('dino.muted') === '1';
} catch {}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function isMuted() {
  return muted;
}

export function setMuted(v) {
  muted = v;
  try {
    localStorage.setItem('dino.muted', v ? '1' : '0');
  } catch {}
}

function tone(freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const SOUNDS = {
  jump: () => tone(520, 0.08, { slide: 200 }),
  score: () => {
    tone(880, 0.08);
    tone(1320, 0.12, { delay: 0.09 });
  },
  hit: () => tone(140, 0.25, { type: 'sawtooth', vol: 0.08, slide: -80 }),
  dead: () => {
    tone(300, 0.15, { type: 'sawtooth', vol: 0.08 });
    tone(150, 0.3, { type: 'sawtooth', vol: 0.08, delay: 0.15 });
  },
  pickup: () => {
    tone(660, 0.06);
    tone(990, 0.08, { delay: 0.06 });
  },
  item: () => tone(300, 0.2, { type: 'triangle', vol: 0.1, slide: 500 }),
  warn: () => tone(220, 0.15, { type: 'triangle', vol: 0.1 }),
  bite: () => tone(260, 0.05, { type: 'square', vol: 0.05, slide: -120 }),
  ko: () => {
    tone(600, 0.1, { type: 'square' });
    tone(300, 0.3, { type: 'square', delay: 0.1, slide: -200 });
  },
  count: () => tone(440, 0.1, { type: 'triangle', vol: 0.1 }),
  go: () => tone(880, 0.25, { type: 'triangle', vol: 0.1 }),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.1, delay: i * 0.12 })),
};

export function play(name) {
  SOUNDS[name]?.();
}

export function vibrate(ms) {
  if (!muted && navigator.vibrate) {
    try {
      navigator.vibrate(ms);
    } catch {}
  }
}
