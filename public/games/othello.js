// オセロのルール（サーバーとブラウザで共通）
// 8x8 の盤。board[r][c] は null | 0（黒）| 1（白）。黒が先手。手は { to: [r, c] }。
// 打てる場所がない側は自動でパス。両者とも打てなくなったら石の数で勝敗を決める。
export const id = 'othello';
export const title = 'オセロ';
export const sideNames = ['黒', '白'];
export const SIZE = 8;

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const inB = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
export const coord = (r, c) => 'abcdefgh'[c] + (r + 1);

export function init() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  board[3][3] = 1; board[3][4] = 0;
  board[4][3] = 0; board[4][4] = 1;
  return { board, turn: 0, lastMove: null, flipped: [], result: null, history: [] };
}

// (r,c) に who が打ったときに裏返る石
function flips(board, r, c, who) {
  if (board[r][c] !== null) return [];
  const out = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let rr = r + dr, cc = c + dc;
    while (inB(rr, cc) && board[rr][cc] === 1 - who) { line.push([rr, cc]); rr += dr; cc += dc; }
    if (line.length && inB(rr, cc) && board[rr][cc] === who) out.push(...line);
  }
  return out;
}

function movesFor(board, who) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (flips(board, r, c, who).length) moves.push({ to: [r, c] });
  }
  return moves;
}

export function legalMoves(s) {
  return s.result ? [] : movesFor(s.board, s.turn);
}

export function count(board, who) {
  return board.flat().filter((x) => x === who).length;
}

// 各プレイヤーの表示用スコア（石の数）
export const scoreOf = (s, seat) => count(s.board, seat);

export function applyMove(s, mv) {
  if (s.result) throw new Error('対局は終了しています');
  const [r, c] = (mv && mv.to) || [];
  if (!Number.isInteger(r) || !Number.isInteger(c) || !inB(r, c)) throw new Error('その場所には打てません');
  const turned = flips(s.board, r, c, s.turn);
  if (!turned.length) throw new Error('その場所には打てません');
  const board = s.board.map((row) => row.slice());
  board[r][c] = s.turn;
  for (const [fr, fc] of turned) board[fr][fc] = s.turn;

  const mark = (who) => (who === 0 ? '●' : '○');
  const history = [...s.history, mark(s.turn) + coord(r, c)];
  const ns = { board, turn: 1 - s.turn, lastMove: { to: [r, c] }, flipped: turned, result: null, history };
  if (!movesFor(board, ns.turn).length) {
    if (movesFor(board, s.turn).length) {
      history.push(mark(ns.turn) + 'パス');
      ns.turn = s.turn;
    } else {
      const b = count(board, 0), w = count(board, 1);
      ns.result = { winner: b === w ? null : b > w ? 0 : 1, reason: `${b} 対 ${w}` };
    }
  }
  return ns;
}
