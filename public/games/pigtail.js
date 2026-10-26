// ぶたのしっぽ（サーバーとブラウザで共通）
// 2〜6人。52枚を裏向きにして輪に並べる。順番に、輪から1枚めくって真ん中の山に表向きで出す。
// 出したカードが、すぐ下のカードとマークか数字が同じなら、真ん中の山を全部引き取る（手札になる）。
// 手札があるときは、輪からめくるかわりに手札から1枚出してもよい。輪のカードがなくなったら終わり。手札が一番少ない人の勝ち。
// 手: { flip: 輪の位置 } / { play: 手札のカードid } / { resign: true }
import { shuffle, makeDeck52, seatNames, label, cardLabel, randInt } from './util.js';

export const id = 'pigtail';
export const title = 'ぶたのしっぽ';
export const minPlayers = 2;
export const maxPlayers = 6;
export const sideNames = seatNames(6);
export const lobbyReturn = true;
export const logTitle = 'ログ';

export function init(options, players = 2, rng) {
  return { players, ring: shuffle(makeDeck52(), rng), pile: [], hands: Array.from({ length: players }, () => []), turn: 0, out: Array(players).fill(false), last: null, result: null, history: [] };
}

const top = (s) => s.pile[s.pile.length - 1];
export const matches = (a, b) => !!a && !!b && (a.s === b.s || a.r === b.r);
const ringLeft = (s) => s.ring.filter(Boolean).length;

export function viewFor(s, seat) {
  return {
    ...s, ring: s.ring.map((c) => (c ? true : null)), ringLeft: ringLeft(s), pile: s.pile.slice(-4), pileCount: s.pile.length,
    hands: s.hands.map((h, i) => (i === seat || s.result || seat < 0 || s.out[seat] ? h : null)),
    handCounts: s.hands.map((h) => h.length),
    seesAll: seat < 0 || !!s.result || !!s.out[seat],
  };
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `${s.handCounts ? s.handCounts[seat] : s.hands[seat].length}枚`;
export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  return (s.handCounts ? s.handCounts[you] : s.hands[you].length) ? '輪からめくるか、手札から出してください' : '輪からカードを1枚めくってください';
}

const nextSeat = (s, p) => { let q = p; do q = (q + 1) % s.players; while (s.out[q]); return q; };
const live = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);

function finish(ns) {
  const alive = live(ns);
  const fewest = Math.min(...alive.map((p) => ns.hands[p].length));
  const top2 = alive.filter((p) => ns.hands[p].length === fewest);
  ns.result = top2.length === 1 ? { winner: top2[0], reason: `手札${fewest}枚` } : { winner: null, reason: `手札${fewest}枚で同じ` };
}

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = { ...s, ring: s.ring.slice(), pile: s.pile.slice(), hands: s.hands.map((h) => h.slice()), out: s.out.slice(), history: s.history.slice() };
  if (mv.resign) {
    if (s.out[seat]) throw new Error('抜けています');
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    const alive = live(ns);
    if (alive.length === 1) ns.result = { winner: alive[0], reason: 'ほかの全員が抜けた' };
    else if (s.turn === seat) ns.turn = nextSeat(ns, seat);
    return ns;
  }
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  let card;
  if (mv.play != null) {
    const idx = ns.hands[seat].findIndex((c) => c.id === mv.play);
    if (idx < 0) throw new Error('そのカードは持っていません');
    card = ns.hands[seat].splice(idx, 1)[0];
  } else {
    const i = Number(mv.flip);
    if (!ns.ring[i]) throw new Error('そこにカードはありません');
    card = ns.ring[i];
    ns.ring[i] = null;
  }
  const under = top(ns);
  ns.pile.push(card);
  let note = `${label(seat)} ${cardLabel(card)}${mv.play != null ? '（手札から）' : ''}`;
  if (matches(card, under)) {
    const n = ns.pile.length;
    ns.hands[seat].push(...ns.pile);
    ns.pile = [];
    note += ` ${card.s === under.s ? 'マーク' : '数字'}がそろって ${n}枚引き取り！`;
    ns.last = { by: seat, card, took: n, from: mv.play != null ? 'hand' : 'ring' };
  } else ns.last = { by: seat, card, took: 0, from: mv.play != null ? 'hand' : 'ring' };
  ns.history.push(note);
  if (!ringLeft(ns)) { finish(ns); return ns; }
  ns.turn = nextSeat(ns, seat);
  return ns;
}

// ---------- CPU ----------
// 手札に、場のカードとそろわないものがあれば出す（手札が減る）。なければ輪からめくる
export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat || s.out[seat]) return null;
  const t = top(s);
  const safe = s.hands[seat].filter((c) => !matches(c, t));
  if (safe.length) return { play: safe[randInt(rng, safe.length)].id };
  const idx = s.ring.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  return { flip: idx[randInt(rng, idx.length)] };
}
