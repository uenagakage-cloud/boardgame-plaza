// 神経衰弱（サーバーとブラウザで共通）
// 1〜6人。裏向きに並べたカードを、順番に2枚ずつめくる。同じ数字ならもらえて、もう一度めくれる。
// ちがったら裏に戻して次の人へ。全部なくなったとき、たくさん取った人の勝ち（1人ならめくった回数の記録）。
// 手: { flip: 位置 } / { resign: true }
import { shuffle, makeDeck52, pickOptions, seatNames, label, randInt, cardLabel } from './util.js';

export const id = 'memory';
export const title = '神経衰弱';
export const minPlayers = 1;
export const maxPlayers = 6;
export const sideNames = seatNames(6);
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const OPTIONS = [{ key: 'pairs', label: 'カードの数', values: [12, 18, 26], names: ['24枚', '36枚', '52枚（全部）'] }];
const SHOW_MS = 1500; // ちがったとき、見せておく時間
export const normalizeOptions = (o) => pickOptions(o, OPTIONS);
export const variantName = (o) => `${normalizeOptions(o).pairs * 2}枚`;

export function init(options, players = 1, rng) {
  const opts = normalizeOptions(options);
  // 使う数字を選び、それぞれ2枚（マークは赤どうし・黒どうし）
  const ranks = shuffle(Array.from({ length: 13 }, (_, i) => i + 1), rng);
  const deck = makeDeck52();
  const cards = [];
  for (let i = 0; i < opts.pairs; i++) {
    const r = ranks[i % 13];
    const suits = i < 13 ? ['s', 'c'] : ['h', 'd'];
    for (const st of suits) cards.push({ ...deck.find((c) => c.r === r && c.s === st) });
  }
  shuffle(cards, rng);
  return {
    players, options: opts, cards, taken: Array(cards.length).fill(null), open: [], seen: Array(cards.length).fill(false),
    scores: Array(players).fill(0), flips: 0, turn: 0, phase: 'pick', tickAt: null, out: Array(players).fill(false), last: null, result: null, history: [],
  };
}

// めくられていないカードの中身は隠す
export function viewFor(s) {
  return { ...s, cards: s.cards.map((c, i) => (s.result || s.taken[i] != null || s.open.includes(i) ? c : null)) };
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => (s.players === 1 ? `${s.scores[0]}組・${s.flips}回` : `${s.scores[seat]}組`);
export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  return s.phase === 'show' ? '残念…' : s.open.length ? 'もう1枚めくってください' : 'カードを2枚めくってください';
}

const nextSeat = (s, p) => { let q = p; do q = (q + 1) % s.players; while (s.out[q]); return q; };
const live = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);

function finish(ns) {
  const alive = live(ns);
  if (ns.players === 1) { ns.result = { winner: 0, reason: `${ns.flips}回でクリア` }; return; }
  const best = Math.max(...alive.map((p) => ns.scores[p]));
  const top = alive.filter((p) => ns.scores[p] === best);
  ns.result = top.length === 1 ? { winner: top[0], reason: `${best}組` } : { winner: null, reason: `${best}組で同点` };
}

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = { ...s, taken: s.taken.slice(), open: s.open.slice(), seen: s.seen.slice(), scores: s.scores.slice(), out: s.out.slice(), history: s.history.slice() };
  if (mv.resign) {
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    const alive = live(ns);
    if (!alive.length) ns.result = { winner: null, reason: 'やめました' };
    else if (s.players > 1 && alive.length === 1) ns.result = { winner: alive[0], reason: 'ほかの全員が抜けた' };
    else if (s.turn === seat) { ns.open = []; ns.phase = 'pick'; ns.tickAt = null; ns.turn = nextSeat(ns, seat); }
    return ns;
  }
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  if (s.phase !== 'pick') throw new Error('少し待ってください');
  const i = Number(mv.flip);
  if (!(i >= 0 && i < s.cards.length) || s.taken[i] != null || s.open.includes(i)) throw new Error('そのカードはめくれません');
  ns.open.push(i);
  ns.seen[i] = true;
  if (ns.open.length < 2) return ns;
  ns.flips = s.flips + 1;
  const [a, b] = ns.open;
  if (s.cards[a].r === s.cards[b].r) {
    ns.taken[a] = ns.taken[b] = seat;
    ns.scores[seat]++;
    ns.open = [];
    ns.last = { by: seat, match: true, cards: [a, b] };
    ns.history.push(`${label(seat)} ${cardLabel(s.cards[a])}と${cardLabel(s.cards[b])} そろった！`);
    if (ns.taken.every((x) => x != null)) finish(ns);
    return ns;
  }
  ns.phase = 'show';
  ns.tickAt = Date.now() + SHOW_MS;
  ns.last = { by: seat, match: false, cards: [a, b] };
  return ns;
}

export function tick(s) {
  if (s.phase !== 'show') return { ...s, tickAt: null };
  const ns = { ...s, open: [], phase: 'pick', tickAt: null };
  ns.turn = nextSeat(ns, s.turn);
  return ns;
}

// ---------- CPU ----------
// 見たことのあるカードを（ときどき忘れながら）覚えておき、そろうものがあればめくる
export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat || s.phase !== 'pick') return null;
  const rand = () => (rng ? (rng(1000) - 1) / 1000 : Math.random());
  const memory = new Map(); // 位置 → 数字（覚えているもの）
  s.cards.forEach((c, i) => { if (s.seen[i] && s.taken[i] == null && !s.open.includes(i) && rand() < 0.75) memory.set(i, c.r); });
  const hidden = s.cards.map((_, i) => i).filter((i) => s.taken[i] == null && !s.open.includes(i));
  const unknown = hidden.filter((i) => !memory.has(i));
  if (s.open.length === 1) {
    const r = s.cards[s.open[0]].r;
    const hit = [...memory].find(([, x]) => x === r);
    if (hit) return { flip: hit[0] };
    const pool = unknown.length ? unknown : hidden;
    return { flip: pool[randInt(rng, pool.length)] };
  }
  const byRank = {};
  for (const [i, r] of memory) (byRank[r] = byRank[r] || []).push(i);
  const pair = Object.values(byRank).find((x) => x.length >= 2);
  if (pair) return { flip: pair[0] };
  const pool = unknown.length ? unknown : hidden;
  return { flip: pool[randInt(rng, pool.length)] };
}
