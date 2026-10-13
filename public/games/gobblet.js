// ゴブレットゴブラーズのルール（サーバーとブラウザで共通）
// 3x3 の盤。各マスは下から積まれた駒の配列 [{ o, s }]。s: 1=小 2=中 3=大。
// 手は { size, to }（手持ちから置く）または { from, to }（盤上の駒を動かす）。to/from は 0〜8 のマス番号。
export const id = 'gobblet';
export const title = 'ゴブレットゴブラーズ';
export const sideNames = ['オレンジ', 'ブルー'];
export const SIZE_NAMES = { 1: '小', 2: '中', 3: '大' };

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const CELL_NAMES = ['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3'];

export const top = (cell) => cell[cell.length - 1] || null;
const canPlace = (cell, size) => !top(cell) || top(cell).s < size;

export function init() {
  const s = {
    board: Array.from({ length: 9 }, () => []),
    hands: [{ 1: 2, 2: 2, 3: 2 }, { 1: 2, 2: 2, 3: 2 }],
    turn: 0, positions: {}, lastMove: null, result: null, history: [], winLine: null,
  };
  s.positions[posKey(s)] = 1;
  return s;
}

function posKey(s) {
  return s.board.map((cell) => cell.map((p) => p.o + '' + p.s).join('') || '-').join('/') + s.turn;
}

export function legalMoves(s) {
  if (s.result) return [];
  const me = s.turn, moves = [];
  for (const size of [3, 2, 1]) {
    if (!s.hands[me][size]) continue;
    for (let to = 0; to < 9; to++) if (canPlace(s.board[to], size)) moves.push({ size, to });
  }
  for (let from = 0; from < 9; from++) {
    const p = top(s.board[from]);
    if (!p || p.o !== me) continue;
    for (let to = 0; to < 9; to++) if (to !== from && canPlace(s.board[to], p.s)) moves.push({ from, to });
  }
  return moves;
}

function findLine(board, owner) {
  return LINES.find((line) => line.every((i) => top(board[i]) && top(board[i]).o === owner)) || null;
}

export function applyMove(s, mv) {
  if (s.result) throw new Error('対局は終了しています');
  const m = legalMoves(s).find((x) => x.to === mv.to &&
    (mv.from != null ? x.from === mv.from : x.size === mv.size));
  if (!m) throw new Error('その手は置けません');
  const me = s.turn;
  const board = s.board.map((cell) => cell.slice());
  const hands = [{ ...s.hands[0] }, { ...s.hands[1] }];
  let piece;
  if (m.from != null) piece = board[m.from].pop();
  else { piece = { o: me, s: m.size }; hands[me][m.size]--; }
  board[m.to].push(piece);

  const ns = {
    board, hands, turn: 1 - me, positions: { ...s.positions },
    lastMove: { from: m.from ?? null, to: m.to }, result: null, winLine: null,
    history: [...s.history, `${me === 0 ? '●' : '○'}${SIZE_NAMES[piece.s]} ${m.from != null ? CELL_NAMES[m.from] + '→' : ''}${CELL_NAMES[m.to]}`],
  };
  // 駒を持ち上げて相手の列が現れた場合は相手の勝ち（自分の列より優先）
  const oppLine = findLine(board, 1 - me), myLine = findLine(board, me);
  if (oppLine) ns.result = { winner: 1 - me, reason: '3つ並び' }, ns.winLine = oppLine;
  else if (myLine) ns.result = { winner: me, reason: '3つ並び' }, ns.winLine = myLine;
  else {
    const key = posKey(ns);
    ns.positions[key] = (ns.positions[key] || 0) + 1;
    if (ns.positions[key] >= 3) ns.result = { winner: null, reason: '同一局面3回' };
  }
  return ns;
}
