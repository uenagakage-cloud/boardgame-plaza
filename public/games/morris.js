// ナインメンズモリス（サーバーとブラウザで共通）
// 2人。24の点がある盤に、9個ずつのコマを交互に置く（配置）。全部置いたら、線でつながったとなりの点へ動かす（移動）。
// 自分のコマが3個になったら、空いているどの点へも飛べる（飛び）。
// 線の上に自分のコマを3つ並べる（ミル）と、相手のコマを1つ取れる。ミルになっているコマは、ほかに取れるコマがあるうちは取れない。
// 相手のコマを2個にするか、相手が動けなくなったら勝ち。取らずに50手続いたら引き分け。
// 手: { place: 点 } / { from: 点, to: 点 } / { remove: 点 } / { resign: true }
import { pickOptions } from './util.js';

export const id = 'morris';
export const title = 'ナインメンズモリス';
export const sideNames = ['白', '黒'];
export const CPU = true;
export const PIECES = 9;
export const logTitle = '棋譜';

// 盤の点（7×7 のマス目のどこにあるか）
export const POINTS = [
  [0, 0], [0, 3], [0, 6], [1, 1], [1, 3], [1, 5], [2, 2], [2, 3], [2, 4],
  [3, 0], [3, 1], [3, 2], [3, 4], [3, 5], [3, 6], [4, 2], [4, 3], [4, 4],
  [5, 1], [5, 3], [5, 5], [6, 0], [6, 3], [6, 6],
];
export const ADJ = [
  [1, 9], [0, 2, 4], [1, 14], [4, 10], [1, 3, 5, 7], [4, 13], [7, 11], [4, 6, 8], [7, 12],
  [0, 10, 21], [3, 9, 11, 18], [6, 10, 15], [8, 13, 17], [5, 12, 14, 20], [2, 13, 23], [11, 16], [15, 17, 19], [12, 16],
  [10, 19], [16, 18, 20, 22], [13, 19], [9, 22], [19, 21, 23], [14, 22],
];
export const MILLS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];
const NAMES = 'abcdefg';
export const pointName = (i) => NAMES[POINTS[i][1]] + (7 - POINTS[i][0]);

export const normalizeOptions = (o) => pickOptions(o, [], true);
export const variantName = (o) => (o && o.cpu ? 'CPU対戦' : '');

export function init(options) {
  return {
    options: normalizeOptions(options), board: Array(24).fill(null), hand: [PIECES, PIECES],
    turn: 0, removing: false, quiet: 0, last: null, result: null, history: [],
  };
}

const count = (b, p) => b.filter((x) => x === p).length;
export const inMill = (b, i) => b[i] != null && MILLS.some((m) => m.includes(i) && m.every((j) => b[j] === b[i]));
const makesMill = (b, i, p) => MILLS.some((m) => m.includes(i) && m.every((j) => (j === i ? true : b[j] === p)));
export const phaseOf = (s, p) => (s.hand[p] > 0 ? 'place' : count(s.board, p) === 3 ? 'fly' : 'move');

// 取れる相手のコマ（ミルの中のコマは、ほかに取れるものがないときだけ）
export function removable(s, p) {
  const opp = 1 - p;
  const all = s.board.map((x, i) => (x === opp ? i : -1)).filter((i) => i >= 0);
  const free = all.filter((i) => !inMill(s.board, i));
  return free.length ? free : all;
}

// 置く・動かす手（取る手は別）
export function legalMoves(s, p = s.turn) {
  if (s.result) return [];
  if (s.removing) return removable(s, p).map((i) => ({ remove: i }));
  const empty = s.board.map((x, i) => (x == null ? i : -1)).filter((i) => i >= 0);
  const ph = phaseOf(s, p);
  if (ph === 'place') return empty.map((i) => ({ place: i }));
  const out = [];
  s.board.forEach((x, i) => {
    if (x !== p) return;
    for (const j of ph === 'fly' ? empty : ADJ[i]) if (s.board[j] == null) out.push({ from: i, to: j });
  });
  return out;
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `手持ち${s.hand[seat]}・盤${count(s.board, seat)}`;

export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  if (s.removing) return 'ミル！ 取る相手のコマを選んでください';
  const ph = phaseOf(s, you);
  return ph === 'place' ? `コマを置く点を選んでください（残り${s.hand[you]}個）` : ph === 'fly' ? '残り3個：どこへでも飛べます。動かすコマを選んでください' : '動かすコマを選んでください';
}

function endCheck(ns) {
  const p = ns.turn;
  if (ns.hand[p] === 0 && count(ns.board, p) < 3) ns.result = { winner: 1 - p, reason: 'コマが2個になった' };
  else if (!legalMoves(ns, p).length) ns.result = { winner: 1 - p, reason: '動けなくなった' };
  else if (ns.quiet >= 100) ns.result = { winner: null, reason: '50手取らずに続いた' };
}

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  if (s.turn !== seat) throw new Error('相手の番です');
  const ns = { ...s, board: s.board.slice(), hand: s.hand.slice(), history: s.history.slice() };
  const mark = seat === 0 ? '○' : '●';
  if (s.removing) {
    const i = Number(mv && mv.remove);
    if (!removable(s, seat).includes(i)) throw new Error('そのコマは取れません（ミルの中のコマは、ほかに取れるコマがあるうちは取れません）');
    ns.board[i] = null;
    ns.removing = false;
    ns.quiet = 0;
    ns.last = { ...s.last, removed: i };
    ns.history[ns.history.length - 1] += ` ×${pointName(i)}`;
    ns.turn = 1 - seat;
    endCheck(ns);
    return ns;
  }
  const ph = phaseOf(s, seat);
  let to;
  if (ph === 'place') {
    to = Number(mv && mv.place);
    if (!(to >= 0 && to < 24) || s.board[to] != null) throw new Error('空いている点を選んでください');
    ns.board[to] = seat;
    ns.hand[seat]--;
    ns.last = { to, by: seat };
    ns.history.push(`${mark}${pointName(to)}`);
  } else {
    const from = Number(mv && mv.from);
    to = Number(mv && mv.to);
    if (!legalMoves(s, seat).some((m) => m.from === from && m.to === to)) throw new Error('そこへは動かせません');
    ns.board[from] = null;
    ns.board[to] = seat;
    ns.last = { from, to, by: seat };
    ns.history.push(`${mark}${pointName(from)}-${pointName(to)}`);
  }
  ns.quiet = s.quiet + 1;
  if (makesMill(ns.board, to, seat)) {
    ns.history[ns.history.length - 1] += ' ミル！';
    ns.removing = true;
    ns.last.mill = true;
    return ns;
  }
  ns.turn = 1 - seat;
  endCheck(ns);
  return ns;
}

// ---------- CPU ----------
// 盤の良さ（自分から見て）: コマの数・ミル・あと1つでミル・動ける数
function evaluate(s, me) {
  if (s.result) return s.result.winner === me ? 10000 : s.result.winner == null ? 0 : -10000;
  const opp = 1 - me;
  const pieces = (p) => count(s.board, p) + s.hand[p];
  let v = (pieces(me) - pieces(opp)) * 100;
  for (const m of MILLS) {
    const mine = m.filter((j) => s.board[j] === me).length, theirs = m.filter((j) => s.board[j] === opp).length;
    const empty = 3 - mine - theirs;
    if (mine === 2 && empty === 1) v += 12;
    if (theirs === 2 && empty === 1) v -= 15;
  }
  const mob = (p) => (s.hand[p] > 0 ? 0 : legalMoves({ ...s, removing: false, turn: p }, p).length);
  v += (mob(me) - mob(opp)) * 2;
  return v;
}

// 1手（取るところまで）を全部並べる
function fullMoves(s) {
  const out = [];
  for (const m of legalMoves(s)) {
    const t = applyMove(s, m, s.turn);
    if (t.removing) for (const r of legalMoves(t)) out.push({ moves: [m, r], state: applyMove(t, r, t.turn) });
    else out.push({ moves: [m], state: t });
  }
  return out;
}

function search(s, me, depth, alpha, beta) {
  if (depth === 0 || s.result) return evaluate(s, me);
  const list = fullMoves(s);
  if (s.turn === me) {
    let best = -Infinity;
    for (const x of list) { best = Math.max(best, search(x.state, me, depth - 1, alpha, beta)); alpha = Math.max(alpha, best); if (beta <= alpha) break; }
    return best;
  }
  let best = Infinity;
  for (const x of list) { best = Math.min(best, search(x.state, me, depth - 1, alpha, beta)); beta = Math.min(beta, best); if (beta <= alpha) break; }
  return best;
}

export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat) return null;
  const rand = () => (rng ? (rng(1000) - 1) / 1000 : Math.random());
  if (s.removing) {
    let best = null, bv = -Infinity;
    for (const m of legalMoves(s)) { const v = evaluate(applyMove(s, m, seat), seat) + rand(); if (v > bv) { bv = v; best = m; } }
    return best;
  }
  const list = fullMoves(s);
  const depth = list.length > 30 ? 2 : 3;
  let best = null, bv = -Infinity;
  for (const x of list) {
    const v = search(x.state, seat, depth - 1, -Infinity, Infinity) + rand();
    if (v > bv) { bv = v; best = x.moves[0]; }
  }
  return best;
}
