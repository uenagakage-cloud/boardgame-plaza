// いくつかのゲームで使う小さな道具（サーバーとブラウザで共通）
// rng はサーバーの乱数 rng(n) = 1〜n。なければ Math.random を使う

export const randInt = (rng, n) => (rng ? rng(n) - 1 : Math.floor(Math.random() * n)); // 0〜n-1

export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const pick = (arr, rng) => arr[randInt(rng, arr.length)];

// トランプ 52枚。s: 's' | 'h' | 'd' | 'c'、r: 1〜13（A=1）
export const SUITS = ['s', 'h', 'd', 'c'];
export const SUIT_MARK = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const cardLabel = (c) => SUIT_MARK[c.s] + RANK_LABEL[c.r];
export function makeDeck52(decks = 1) {
  const out = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (let r = 1; r <= 13; r++) out.push({ id: out.length, s, r });
  return out;
}

export const label = (seat) => `P${seat + 1}`;
export const seatNames = (n) => Array.from({ length: n }, (_, i) => `プレイヤー${i + 1}`);

// ロビーで選べる設定。OPTIONS = [{ key, label, values: [既定値, ...], names?: [表示名...] }]
// 正しい値にそろえる。cpu: true なら「CPUと対戦」も受け付ける（2人用）
export function pickOptions(o, OPTIONS = [], cpu = false) {
  const out = {};
  for (const { key, values } of OPTIONS) {
    const v = o && o[key];
    out[key] = values.find((x) => String(x) === String(v)) ?? values[0];
  }
  if (cpu) out.cpu = !!(o && o.cpu);
  return out;
}
export const optionText = (OPTIONS, o) => OPTIONS.map(({ key, values, names }) => (names ? names[values.indexOf(o[key])] : String(o[key]))).filter(Boolean);
