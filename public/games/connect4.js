// 四目並べ（コネクトフォー）（サーバーとブラウザで共通）
// 2人。縦6×横7の立てた盤に、上からコマを落とす（いちばん下の空いているマスに入る）。
// 縦・横・ななめに自分のコマを4つ並べたら勝ち。盤が埋まったら引き分け。
// 盤: board[r][c] = null | 0 | 1（r = 0 が上）。手: { col: 0〜6 } / { resign: true }
export const id = 'connect4';
export const title = '四目並べ';
export const sideNames = ['赤', '黄'];
export const ROWS = 6;
export const COLS = 7;

export function normalizeOptions(o) {
  return { cpu: !!(o && o.cpu) };
}
export const variantName = (o) => (normalizeOptions(o).cpu ? 'CPU対戦' : '');

export function init(options) {
  return {
    options: normalizeOptions(options), board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    turn: 0, moves: 0, lastMove: null, winLine: null, result: null, history: [],
  };
}

export const dropRow = (board, c) => {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r][c] == null) return r;
  return -1;
};
export const legalMoves = (s) => (s.result ? [] : [...Array(COLS).keys()].filter((c) => s.board[0][c] == null));

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
// (r, c) を通る4つ並び。あれば並んだマスを返す
function lineAt(board, r, c) {
  const p = board[r][c];
  for (const [dr, dc] of DIRS) {
    const cells = [[r, c]];
    for (const sgn of [1, -1]) {
      let rr = r + dr * sgn, cc = c + dc * sgn;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr][cc] === p) { cells.push([rr, cc]); rr += dr * sgn; cc += dc * sgn; }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

export const canActOutOfTurn = () => false;

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  if (s.turn !== seat) throw new Error('相手の番です');
  const c = Number(mv && mv.col);
  if (!legalMoves(s).includes(c)) throw new Error('その列はいっぱいです');
  const board = s.board.map((row) => row.slice());
  const r = dropRow(board, c);
  board[r][c] = seat;
  const ns = { ...s, board, moves: s.moves + 1, lastMove: { r, c }, history: [...s.history, `${sideNames[seat]} ${c + 1}列目`] };
  const line = lineAt(board, r, c);
  if (line) { ns.winLine = line; ns.result = { winner: seat, reason: '4つ並んだ' }; }
  else if (ns.moves === ROWS * COLS) ns.result = { winner: null, reason: '盤が埋まった' };
  else ns.turn = 1 - seat;
  return ns;
}

// ---------- CPU ----------
// 4マスの並びごとに点をつけて、何手か先まで読む
function evaluate(board, me) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) if (board[r][3] === me) score += 3; // 真ん中の列は強い
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of DIRS) {
    const er = r + dr * 3, ec = c + dc * 3;
    if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
    let mine = 0, theirs = 0;
    for (let i = 0; i < 4; i++) {
      const x = board[r + dr * i][c + dc * i];
      if (x === me) mine++; else if (x != null) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) score += 5; else if (mine === 2) score += 2;
    if (theirs === 3) score -= 6; else if (theirs === 2) score -= 2;
  }
  return score;
}

function negamax(board, p, me, depth, alpha, beta) {
  const moves = [3, 2, 4, 1, 5, 0, 6].filter((c) => board[0][c] == null);
  if (!moves.length) return 0;
  if (depth === 0) return (p === me ? 1 : -1) * evaluate(board, me);
  let best = -Infinity;
  for (const c of moves) {
    const r = dropRow(board, c);
    board[r][c] = p;
    const v = lineAt(board, r, c) ? 100000 + depth : -negamax(board, 1 - p, me, depth - 1, -beta, -alpha);
    board[r][c] = null;
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat) return null;
  const rand = rng ? () => (rng(1000) - 1) / 1000 : Math.random;
  const board = s.board.map((row) => row.slice());
  let best = null, bestV = -Infinity;
  for (const c of [3, 2, 4, 1, 5, 0, 6].filter((x) => board[0][x] == null)) {
    const r = dropRow(board, c);
    board[r][c] = seat;
    const v = (lineAt(board, r, c) ? 1e6 : -negamax(board, 1 - seat, seat, 5, -Infinity, Infinity)) + rand() * 0.5;
    board[r][c] = null;
    if (v > bestV) { bestV = v; best = c; }
  }
  return best == null ? null : { col: best };
}
