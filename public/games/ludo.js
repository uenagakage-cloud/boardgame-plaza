// ルドー（サーバーとブラウザで共通）
// 2〜4人。それぞれ4つのコマを持つ。サイコロをふって、出た目だけコマを進める。
// 6が出たらコマを1つスタートに出せる（6が出たらもう1回ふれる。3回続けて6なら番は終わり）。
// 盤を1周して自分の色のゴールの道に入り、ちょうどの目でゴールに入れる。4つ全部ゴールした人の勝ち。
// 相手のコマがいるマスにぴったり止まると、そのコマを家に戻せる（★のマスとスタートのマスでは取れない）。
// コマの位置: -1 = 家、0〜50 = 盤（自分のスタートから何マス目か）、51〜55 = ゴールの道、56 = ゴール。
// 手: { roll: true } / { token: 0〜3 } / { resign: true }
import { seatNames, label, randInt } from './util.js';

export const id = 'ludo';
export const title = 'ルドー';
export const minPlayers = 2;
export const maxPlayers = 4;
export const sideNames = seatNames(4);
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const COLOR_NAMES = ['赤', '緑', '黄', '青'];
export const GOAL = 56;
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]); // スタートと★（盤の通し番号）

// 15×15 のマス目での、盤の52マス（通し番号 0 = 赤のスタート）
const seg = (r0, c0, dr, dc, n) => Array.from({ length: n }, (_, i) => [r0 + dr * i, c0 + dc * i]);
export const TRACK = [
  ...seg(6, 1, 0, 1, 5), ...seg(5, 6, -1, 0, 6), [0, 7], ...seg(0, 8, 1, 0, 6), ...seg(6, 9, 0, 1, 6), [7, 14],
  ...seg(8, 14, 0, -1, 6), ...seg(9, 8, 1, 0, 6), [14, 7], ...seg(14, 6, -1, 0, 6), ...seg(8, 5, 0, -1, 6), [7, 0], [6, 0],
];
// ゴールの道（色ごと 5マス）
export const HOME_LANE = [seg(7, 1, 0, 1, 5), seg(1, 7, 1, 0, 5), seg(7, 13, 0, -1, 5), seg(13, 7, -1, 0, 5)];

// 2人なら向かい合う色
export const colorsFor = (n) => (n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3]);
export const absPos = (color, pos) => (pos >= 0 && pos <= 50 ? (color * 13 + pos) % 52 : null);

export function init(options, players = 2) {
  return {
    players, colors: colorsFor(players), tokens: Array.from({ length: players }, () => [-1, -1, -1, -1]),
    turn: 0, dice: null, rolled: false, sixes: 0, out: Array(players).fill(false), last: null, result: null, history: [],
  };
}

// 目 d で動かせるコマ
export function movable(s, seat, d = s.dice) {
  if (d == null) return [];
  return s.tokens[seat].map((pos, k) => {
    if (pos === GOAL) return -1;
    if (pos === -1) return d === 6 ? k : -1;
    return pos + d <= GOAL ? k : -1;
  }).filter((k) => k >= 0);
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `ゴール${s.tokens[seat].filter((p) => p === GOAL).length}/4`;
export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  return s.rolled ? `${s.dice}が出ました。動かすコマを選んでください` : 'サイコロをふってください';
}

const nextSeat = (s, p) => { let q = p; do q = (q + 1) % s.players; while (s.out[q]); return q; };
const live = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
const clone = (s) => ({ ...s, tokens: s.tokens.map((t) => t.slice()), out: s.out.slice(), history: s.history.slice() });

function endTurn(ns, seat, again) {
  ns.rolled = false;
  if (again) return;
  ns.sixes = 0;
  ns.turn = nextSeat(ns, seat);
}

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    if (s.out[seat]) throw new Error('抜けています');
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    const alive = live(ns);
    if (alive.length === 1) ns.result = { winner: alive[0], reason: 'ほかの全員が抜けた' };
    else if (s.turn === seat) { ns.rolled = false; ns.sixes = 0; ns.turn = nextSeat(ns, seat); }
    return ns;
  }
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  if (mv.roll) {
    if (s.rolled) throw new Error('もうふりました');
    const d = randInt(rng, 6) + 1;
    ns.dice = d;
    ns.rolled = true;
    ns.sixes = d === 6 ? s.sixes + 1 : 0;
    ns.last = { type: 'roll', by: seat, dice: d };
    if (ns.sixes >= 3) {
      ns.history.push(`${label(seat)} 6が3回続いたので番は終わり`);
      ns.sixes = 0;
      endTurn(ns, seat, false);
      return ns;
    }
    if (!movable(ns, seat).length) {
      ns.history.push(`${label(seat)} ${d}… 動かせるコマがない`);
      endTurn(ns, seat, d === 6);
    }
    return ns;
  }
  if (mv.token == null) throw new Error('不明な操作です');
  if (!s.rolled) throw new Error('先にサイコロをふってください');
  const k = Number(mv.token);
  if (!movable(s, seat).includes(k)) throw new Error('そのコマは動かせません');
  const color = s.colors[seat];
  const from = s.tokens[seat][k];
  const to = from === -1 ? 0 : from + s.dice;
  ns.tokens[seat][k] = to;
  let note = `${label(seat)} ${s.dice}：${from === -1 ? 'コマを出した' : to === GOAL ? 'ゴール！' : `${s.dice}マス進む`}`;
  const captured = [];
  const at = absPos(color, to);
  if (at != null && !SAFE.has(at)) {
    ns.tokens.forEach((list, p) => {
      if (p === seat || ns.out[p]) return;
      list.forEach((pos, j) => { if (absPos(s.colors[p], pos) === at) { list[j] = -1; captured.push(p); } });
    });
  }
  if (captured.length) note += ` ${captured.map(label).join('・')} のコマを家に戻した！`;
  ns.last = { type: 'move', by: seat, token: k, from, to, captured };
  ns.history.push(note);
  if (ns.tokens[seat].every((p) => p === GOAL)) { ns.result = { winner: seat, reason: '4つ全部ゴール' }; return ns; }
  // 6・取った・ゴールしたらもう1回
  endTurn(ns, seat, s.dice === 6 || captured.length > 0 || to === GOAL);
  return ns;
}

// ---------- CPU ----------
// 取れる > ゴール > 出す > 危ないコマを逃がす > 一番進んだコマ
export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat || s.out[seat]) return null;
  if (!s.rolled) return { roll: true };
  const list = movable(s, seat);
  if (!list.length) return null;
  const color = s.colors[seat];
  const enemyAt = new Map();
  s.tokens.forEach((t, p) => { if (p !== seat && !s.out[p]) t.forEach((pos) => { const a = absPos(s.colors[p], pos); if (a != null) enemyAt.set(a, (enemyAt.get(a) || 0) + 1); }); });
  const danger = (a) => {
    if (a == null || SAFE.has(a)) return 0;
    let n = 0;
    for (let d = 1; d <= 6; d++) if (enemyAt.has((a - d + 52) % 52)) n++;
    return n;
  };
  let best = [], bv = -Infinity;
  for (const k of list) {
    const from = s.tokens[seat][k], to = from === -1 ? 0 : from + s.dice;
    const a = absPos(color, to);
    let v = 0;
    if (a != null && !SAFE.has(a) && enemyAt.has(a)) v += 100;
    if (to === GOAL) v += 60;
    if (from === -1) v += 40;
    if (to > 50) v += 20;
    v += danger(absPos(color, from)) * 8 - danger(a) * 10;
    v += to * 0.3;
    if (v > bv) { bv = v; best = [k]; } else if (v === bv) best.push(k);
  }
  return { token: best[randInt(rng, best.length)] };
}
