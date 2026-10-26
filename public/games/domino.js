// ドミノ（ドロー）（サーバーとブラウザで共通）
// 2〜4人。0〜6 の目の組み合わせ28枚。2人なら7枚、3〜4人なら5枚ずつ配る。
// 場の列の左はしか右はしと同じ目の牌をつなげて置く。置けないときは山から1枚引く（山がなければパス）。
// 先に手札がなくなった人の勝ち。全員が置けずに止まったら、手札の目の合計がいちばん少ない人の勝ち。
// 牌: { id, a, b }。列: line = [{ id, a, b }]（左から右へ、となりどうしの目がそろう向き）
// 手: { play: 牌id, side: 'L' | 'R' } / { draw: true } / { pass: true } / { resign: true }
import { shuffle, label, seatNames, randInt } from './util.js';

export const id = 'domino';
export const title = 'ドミノ';
export const minPlayers = 2;
export const maxPlayers = 4;
export const sideNames = seatNames(4);
export const lobbyReturn = true;
export const logTitle = 'ログ';

export function init(options, players = 2, rng) {
  const tiles = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push({ id: tiles.length, a, b });
  shuffle(tiles, rng);
  const n = players === 2 ? 7 : 5;
  const hands = Array.from({ length: players }, () => tiles.splice(0, n));
  return { players, hands, boneyard: tiles, line: [], turn: 0, passes: 0, out: Array(players).fill(false), last: null, result: null, history: [] };
}

export const ends = (s) => (s.line.length ? [s.line[0].a, s.line[s.line.length - 1].b] : null);
const pips = (hand) => hand.reduce((a, t) => a + t.a + t.b, 0);

// この牌をどちらに置けるか
export function sidesFor(s, t) {
  const e = ends(s);
  if (!e) return ['R'];
  const out = [];
  if (t.a === e[0] || t.b === e[0]) out.push('L');
  if (t.a === e[1] || t.b === e[1]) out.push('R');
  return out;
}
export const playable = (s, seat) => (s.hands[seat] || []).filter((t) => sidesFor(s, t).length);

export function viewFor(s, seat) {
  return {
    ...s, boneyard: null, boneyardCount: s.boneyard.length,
    seesAll: seat < 0 || !!s.result || !!s.out[seat],
    hands: s.hands.map((h, i) => (i === seat || s.result || seat < 0 || s.out[seat] ? h : null)),
    handCounts: s.hands.map((h) => h.length),
  };
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `${s.handCounts ? s.handCounts[seat] : s.hands[seat].length}枚`;
export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  if (playable(s, you).length) return '置く牌を選んでください';
  return (s.boneyard ? s.boneyard.length : s.boneyardCount) ?'置ける牌がありません。山から引いてください' : '置ける牌がなく、山もありません。パスしてください';
}

const nextSeat = (s, p) => { let q = p; do q = (q + 1) % s.players; while (s.out[q]); return q; };
const live = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
const clone = (s) => ({ ...s, hands: s.hands.map((h) => h.slice()), boneyard: s.boneyard.slice(), line: s.line.slice(), out: s.out.slice(), history: s.history.slice() });

function blocked(ns) {
  // 全員が置けずに止まった: 目の合計が一番少ない人
  const alive = live(ns);
  const sums = alive.map((p) => pips(ns.hands[p]));
  const min = Math.min(...sums);
  const winners = alive.filter((p, i) => sums[i] === min);
  ns.result = winners.length === 1 ? { winner: winners[0], reason: `止まったので目の合計が少ない人（${min}）` } : { winner: null, reason: `止まって目の合計が同じ（${min}）` };
}

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (s.out[seat]) throw new Error('抜けています');
  const ns = clone(s);
  if (mv.resign) {
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    const alive = live(ns);
    if (alive.length === 1) ns.result = { winner: alive[0], reason: 'ほかの全員が抜けた' };
    else if (s.turn === seat) ns.turn = nextSeat(ns, seat);
    return ns;
  }
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  const hand = ns.hands[seat];
  if (mv.draw) {
    if (playable(s, seat).length) throw new Error('置ける牌があります');
    if (!ns.boneyard.length) throw new Error('山がありません');
    hand.push(ns.boneyard.pop());
    ns.last = { type: 'draw', by: seat };
    ns.history.push(`${label(seat)} 1枚引いた`);
    return ns;
  }
  if (mv.pass) {
    if (playable(s, seat).length || ns.boneyard.length) throw new Error('まだパスできません');
    ns.passes = s.passes + 1;
    ns.last = { type: 'pass', by: seat };
    ns.history.push(`${label(seat)} パス`);
    if (ns.passes >= live(ns).length) blocked(ns);
    else ns.turn = nextSeat(ns, seat);
    return ns;
  }
  const idx = hand.findIndex((t) => t.id === mv.play);
  if (idx < 0) throw new Error('その牌は持っていません');
  const t = hand[idx];
  const sides = sidesFor(s, t);
  const side = sides.includes(mv.side) ? mv.side : sides.length === 1 ? sides[0] : null;
  if (!side) throw new Error(sides.length ? '置く側を選んでください' : 'その牌は置けません');
  hand.splice(idx, 1);
  const e = ends(s);
  if (!e) ns.line.push({ ...t });
  else if (side === 'L') ns.line.unshift(t.b === e[0] ? { ...t } : { id: t.id, a: t.b, b: t.a });
  else ns.line.push(t.a === e[1] ? { ...t } : { id: t.id, a: t.b, b: t.a });
  ns.passes = 0;
  ns.last = { type: 'play', by: seat, id: t.id, side };
  ns.history.push(`${label(seat)} [${t.a}|${t.b}]${t.a === t.b ? ' ゾロ目' : ''}`);
  if (!hand.length) { ns.result = { winner: seat, reason: '手札がなくなった' }; ns.history.push(`${label(seat)} 上がり！`); return ns; }
  ns.turn = nextSeat(ns, seat);
  return ns;
}

// ---------- CPU ----------
// 目の大きい牌（とくにゾロ目）から出す。置けなければ引く・パス
export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat || s.out[seat]) return null;
  const list = playable(s, seat);
  if (!list.length) return s.boneyard.length ? { draw: true } : { pass: true };
  const hand = s.hands[seat];
  const score = (t) => t.a + t.b + (t.a === t.b ? 6 : 0) + hand.filter((x) => x !== t && [x.a, x.b].some((v) => v === t.a || v === t.b)).length;
  list.sort((x, y) => score(y) - score(x));
  const t = list[0];
  const sides = sidesFor(s, t);
  return { play: t.id, side: sides[randInt(rng, sides.length)] };
}
