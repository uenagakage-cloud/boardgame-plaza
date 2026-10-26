// チェッカー（サーバーとブラウザで共通）
// 2人。8×8 の黒いマスだけを使う。コマはななめ前に1マス進む。
// ななめとなりの相手のコマを跳び越えて、その先の空きマスに移ると取れる。取れるときは必ず取る（続けて跳べるならさらに跳ぶ）。
// 一番奥まで進んだコマはキングになり、ななめ後ろにも動ける。相手のコマを全部取るか、相手が動けなくなったら勝ち。
// 取らずに40手（両方合わせて80手）続いたら引き分け。
// 盤: board[r][c] = null | { o: 0|1, k: キングか }。先手（赤）は下から上へ進む。
// 手: { path: [[r, c], [r, c], ...] } 動かすコマから、止まるマスまで（跳んだ場合は途中のマスも） / { resign: true }
import { pickOptions, randInt } from './util.js';

export const id = 'checkers';
export const title = 'チェッカー';
export const sideNames = ['赤', '黒'];
export const CPU = true;
export const logTitle = '棋譜';

export const normalizeOptions = (o) => pickOptions(o, [], true);
export const variantName = (o) => (o && o.cpu ? 'CPU対戦' : '');
export const sqName = (r, c) => 'abcdefgh'[c] + (8 - r);

export function init(options) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if ((r + c) % 2 === 0) continue;
    if (r < 3) board[r][c] = { o: 1, k: false };
    if (r > 4) board[r][c] = { o: 0, k: false };
  }
  return { options: normalizeOptions(options), board, turn: 0, quiet: 0, last: null, result: null, history: [] };
}

const dirsOf = (p) => (p.k ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : p.o === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
const inside = (r, c) => r >= 0 && c >= 0 && r < 8 && c < 8;

// (r, c) のコマが跳んで取る道すじ（続けて跳ぶ分も全部）
function jumps(board, r, c, piece, path, taken, out) {
  let more = false;
  for (const [dr, dc] of dirsOf(piece)) {
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
    if (!inside(tr, tc) || board[tr][tc] || !board[mr][mc] || board[mr][mc].o === piece.o || taken.has(mr * 8 + mc)) continue;
    more = true;
    const crowned = !piece.k && (tr === 0 || tr === 7);
    const next = [...path, [tr, tc]];
    const t2 = new Set(taken).add(mr * 8 + mc);
    if (crowned) { out.push(next); continue; } // キングになったらそこで終わり
    const b2 = board.map((row) => row.slice());
    b2[r][c] = null;
    b2[tr][tc] = piece;
    jumps(b2, tr, tc, piece, next, t2, out);
  }
  if (!more && path.length > 1) out.push(path);
}

export function legalMoves(s, p = s.turn) {
  if (s.result) return [];
  const caps = [], steps = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const piece = s.board[r][c];
    if (!piece || piece.o !== p) continue;
    jumps(s.board, r, c, piece, [[r, c]], new Set(), caps);
    for (const [dr, dc] of dirsOf(piece)) {
      const tr = r + dr, tc = c + dc;
      if (inside(tr, tc) && !s.board[tr][tc]) steps.push([[r, c], [tr, tc]]);
    }
  }
  return caps.length ? caps : steps;
}

export const canActOutOfTurn = () => false;
const countOf = (s, p) => s.board.flat().filter((x) => x && x.o === p).length;
export const scoreOf = (s, seat) => `残り${countOf(s, seat)}`;
export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  const m = legalMoves(s);
  return m.some((x) => Math.abs(x[1][0] - x[0][0]) === 2) ? '取れるコマがあります（必ず取ります）' : '動かすコマを選んでください';
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x[0] === b[i][0] && x[1] === b[i][1]);

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  if (s.turn !== seat) throw new Error('相手の番です');
  const path = mv && mv.path;
  if (!Array.isArray(path) || !legalMoves(s).some((m) => same(m, path))) throw new Error('そこへは動かせません（取れるときは必ず取ります）');
  const board = s.board.map((row) => row.slice());
  const [r0, c0] = path[0];
  let piece = { ...board[r0][c0] };
  board[r0][c0] = null;
  let captured = 0;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = path[i - 1], [r, c] = path[i];
    if (Math.abs(r - a) === 2) { board[(a + r) / 2][(b + c) / 2] = null; captured++; }
  }
  const [rt, ct] = path[path.length - 1];
  const crowned = !piece.k && (rt === 0 || rt === 7);
  if (crowned) piece = { ...piece, k: true };
  board[rt][ct] = piece;
  const note = (seat === 0 ? '赤 ' : '黒 ') + path.map(([r, c]) => sqName(r, c)).join(captured ? 'x' : '-') + (crowned ? ' キング！' : '');
  const ns = { ...s, board, turn: 1 - seat, quiet: captured || crowned ? 0 : s.quiet + 1, last: { path, captured, crowned, by: seat }, history: [...s.history, note] };
  if (!countOf(ns, 1 - seat)) ns.result = { winner: seat, reason: 'コマを全部取った' };
  else if (!legalMoves(ns).length) ns.result = { winner: seat, reason: '相手が動けない' };
  else if (ns.quiet >= 80) ns.result = { winner: null, reason: '40手取らずに続いた' };
  return ns;
}

// ---------- CPU ----------
function evaluate(s, me) {
  if (s.result) return s.result.winner === me ? 1000 : s.result.winner == null ? 0 : -1000;
  let v = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const x = s.board[r][c];
    if (!x) continue;
    const adv = x.o === 0 ? 7 - r : r; // どれだけ進んだか
    const val = x.k ? 17 : 10 + adv * 0.5 + (c === 0 || c === 7 ? 0.5 : 0);
    v += x.o === me ? val : -val;
  }
  return v;
}

function search(s, me, depth, alpha, beta) {
  if (depth === 0 || s.result) return evaluate(s, me);
  const moves = legalMoves(s);
  if (s.turn === me) {
    let best = -Infinity;
    for (const m of moves) { best = Math.max(best, search(applyMove(s, { path: m }, s.turn), me, depth - 1, alpha, beta)); alpha = Math.max(alpha, best); if (beta <= alpha) break; }
    return best;
  }
  let best = Infinity;
  for (const m of moves) { best = Math.min(best, search(applyMove(s, { path: m }, s.turn), me, depth - 1, alpha, beta)); beta = Math.min(beta, best); if (beta <= alpha) break; }
  return best;
}

export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat) return null;
  const moves = legalMoves(s);
  if (moves.length === 1) return { path: moves[0] };
  let best = [], bv = -Infinity;
  for (const m of moves) {
    const v = search(applyMove(s, { path: m }, seat), seat, 4, -Infinity, Infinity);
    if (v > bv + 1e-9) { bv = v; best = [m]; } else if (Math.abs(v - bv) < 1e-9) best.push(m);
  }
  return { path: best[randInt(rng, best.length)] };
}
