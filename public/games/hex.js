// ヘックス（サーバーとブラウザで共通）
// 2人。ひし形に並んだ六角形のマスに、交互に自分の色の石を置く。
// 赤（先手）は上と下、青（後手）は左と右の辺を、自分の石でつなげたら勝ち。引き分けはない。
// 盤: board[r][c] = null | 0 | 1。となり: (r-1,c) (r-1,c+1) (r,c-1) (r,c+1) (r+1,c-1) (r+1,c)
// 手: { to: [r, c] } / { resign: true }
import { pickOptions, randInt } from './util.js';

export const id = 'hex';
export const title = 'ヘックス';
export const sideNames = ['赤', '青'];
export const CPU = true;
export const OPTIONS = [{ key: 'size', label: '盤の大きさ', values: [9, 7, 11], names: ['9×9', '7×7', '11×11'] }];
export const logTitle = '棋譜';

export const normalizeOptions = (o) => pickOptions(o, OPTIONS, true);
export const variantName = (o) => { const x = normalizeOptions(o); return `${x.size}×${x.size}${x.cpu ? '・CPU対戦' : ''}`; };

const DIRS = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];
export const cellName = (r, c) => String.fromCharCode(65 + c) + (r + 1);

export function init(options) {
  const opts = normalizeOptions(options);
  const n = opts.size;
  return { options: opts, n, board: Array.from({ length: n }, () => Array(n).fill(null)), turn: 0, moves: 0, last: null, winPath: null, result: null, history: [] };
}

export const legalMoves = (s) => {
  if (s.result) return [];
  const out = [];
  for (let r = 0; r < s.n; r++) for (let c = 0; c < s.n; c++) if (s.board[r][c] == null) out.push([r, c]);
  return out;
};

// p の石で、自分の2辺がつながっているか。つながっていればその道すじを返す
export function connection(board, p) {
  const n = board.length;
  const start = [];
  for (let k = 0; k < n; k++) { const [r, c] = p === 0 ? [0, k] : [k, 0]; if (board[r][c] === p) start.push([r, c]); }
  const prev = new Map();
  const key = (r, c) => r * n + c;
  const queue = [...start];
  for (const [r, c] of start) prev.set(key(r, c), null);
  while (queue.length) {
    const [r, c] = queue.shift();
    if ((p === 0 && r === n - 1) || (p === 1 && c === n - 1)) {
      const path = [];
      let k = key(r, c);
      while (k != null) { path.push([Math.floor(k / n), k % n]); k = prev.get(k); }
      return path;
    }
    for (const [dr, dc] of DIRS) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n || board[rr][cc] !== p || prev.has(key(rr, cc))) continue;
      prev.set(key(rr, cc), key(r, c));
      queue.push([rr, cc]);
    }
  }
  return null;
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `${s.board.flat().filter((x) => x === seat).length}個`;
export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  return you === 0 ? 'あなたは赤：上と下をつなげよう' : 'あなたは青：左と右をつなげよう';
}

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  if (s.turn !== seat) throw new Error('相手の番です');
  const [r, c] = (mv && mv.to) || [];
  if (!(r >= 0 && c >= 0 && r < s.n && c < s.n) || s.board[r][c] != null) throw new Error('空いているマスを選んでください');
  const board = s.board.map((row) => row.slice());
  board[r][c] = seat;
  const ns = { ...s, board, moves: s.moves + 1, last: [r, c], turn: 1 - seat, history: [...s.history, `${seat === 0 ? '赤' : '青'} ${cellName(r, c)}`] };
  const path = connection(board, seat);
  if (path) { ns.winPath = path; ns.result = { winner: seat, reason: seat === 0 ? '上と下がつながった' : '左と右がつながった' }; }
  return ns;
}

// ---------- CPU ----------
// p がつなぐのに、あと何個置けばよいか（自分の石 0・空き 1・相手の石は通れない）
function distance(board, p) {
  const n = board.length;
  const dist = Array(n * n).fill(Infinity);
  const dq = [];
  for (let k = 0; k < n; k++) {
    const [r, c] = p === 0 ? [0, k] : [k, 0];
    if (board[r][c] === 1 - p) continue;
    const d = board[r][c] === p ? 0 : 1;
    if (d < dist[r * n + c]) { dist[r * n + c] = d; dq.push([d, r, c]); }
  }
  // 重みが 0 と 1 だけなので、小さい順に取り出すだけでよい
  while (dq.length) {
    let bi = 0;
    for (let i = 1; i < dq.length; i++) if (dq[i][0] < dq[bi][0]) bi = i;
    const [d, r, c] = dq.splice(bi, 1)[0];
    if (d > dist[r * n + c]) continue;
    if ((p === 0 && r === n - 1) || (p === 1 && c === n - 1)) return d;
    for (const [dr, dc] of DIRS) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n || board[rr][cc] === 1 - p) continue;
      const nd = d + (board[rr][cc] === p ? 0 : 1);
      if (nd < dist[rr * n + cc]) { dist[rr * n + cc] = nd; dq.push([nd, rr, cc]); }
    }
  }
  return Infinity;
}

export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat) return null;
  const n = s.n, mid = (n - 1) / 2;
  if (s.moves === 0) return { to: [Math.floor(mid), Math.ceil(mid)] }; // 最初は真ん中あたり
  let best = [], bv = -Infinity;
  const board = s.board.map((row) => row.slice());
  for (const [r, c] of legalMoves(s)) {
    board[r][c] = seat;
    const mine = distance(board, seat), theirs = distance(board, 1 - seat);
    board[r][c] = null;
    if (mine === 0) return { to: [r, c] };
    // 自分は近く、相手は遠く。真ん中寄りを少し好む
    const v = (theirs === Infinity ? 50 : theirs) * 1.1 - mine - (Math.abs(r - mid) + Math.abs(c - mid)) * 0.02;
    if (v > bv + 1e-9) { bv = v; best = [[r, c]]; } else if (Math.abs(v - bv) < 1e-9) best.push([r, c]);
  }
  return { to: best[randInt(rng, best.length)] };
}
