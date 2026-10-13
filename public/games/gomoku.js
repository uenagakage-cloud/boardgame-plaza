// 五目並べのルール（サーバーとブラウザで共通）
// 15x15 の盤。board[r][c] は null | 0（黒）| 1（白）。黒が先手。手は { to: [r, c] }。
// rules.renju = false: 禁じ手なし。5つ以上並べたら勝ち。
// rules.renju = true : 連珠の禁じ手あり。黒は三三・四四・長連（6つ以上）が打てず、ちょうど5つで勝ち。
//                      白は制限なし（長連でも勝ち）。黒が五を作る手は他の形を含んでいても勝ち。
export const id = 'gomoku';
export const title = '五目並べ';
export const sideNames = ['黒', '白'];
export const SIZE = 15;

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const COLS = 'ABCDEFGHIJKLMNO';
const BLACK = 0;
export const coord = (r, c) => COLS[c] + (SIZE - r);
const inB = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

export function normalizeOptions(o) {
  return { renju: !!(o && o.renju) };
}

export function variantName(options) {
  return options && options.renju ? '禁じ手あり' : '禁じ手なし';
}

export function init(options) {
  return {
    board: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)),
    rules: normalizeOptions(options),
    turn: 0, moves: 0, lastMove: null, result: null, winLine: null, history: [],
  };
}

// (r,c) を含む dr,dc 方向の同色の連続数
function runLen(b, r, c, dr, dc) {
  const me = b[r][c];
  let n = 1;
  for (const sign of [1, -1]) {
    let rr = r + dr * sign, cc = c + dc * sign;
    while (inB(rr, cc) && b[rr][cc] === me) { n++; rr += dr * sign; cc += dc * sign; }
  }
  return n;
}

// ---------- 連珠の禁じ手判定（黒石が (r,c) に置かれている前提） ----------

// その方向で、あと1つ置けばちょうど五になる点（(r,c) からの距離 k の一覧）
function fivePoints(b, r, c, dr, dc) {
  const ks = [];
  for (let k = -4; k <= 4; k++) {
    const qr = r + dr * k, qc = c + dc * k;
    if (k === 0 || !inB(qr, qc) || b[qr][qc] !== null) continue;
    b[qr][qc] = BLACK;
    if (runLen(b, r, c, dr, dc) === 5) ks.push(k);
    b[qr][qc] = null;
  }
  return ks;
}

// 達四（両端どちらでも五になる四）
function isStraightFour(b, r, c, dr, dc) {
  const ks = fivePoints(b, r, c, dr, dc);
  return ks.length === 2 && ks[1] - ks[0] === 5;
}

function fourCount(b, r, c, dr, dc) {
  const ks = fivePoints(b, r, c, dr, dc);
  return ks.length === 2 && ks[1] - ks[0] === 5 ? 1 : ks.length;
}

// 本物の三：禁じ手でない1手で達四にできる
function isThree(b, r, c, dr, dc, depth) {
  for (let k = -4; k <= 4; k++) {
    const qr = r + dr * k, qc = c + dc * k;
    if (k === 0 || !inB(qr, qc) || b[qr][qc] !== null) continue;
    b[qr][qc] = BLACK;
    const ok = isStraightFour(b, r, c, dr, dc) && !isForbiddenPlaced(b, qr, qc, depth + 1);
    b[qr][qc] = null;
    if (ok) return true;
  }
  return false;
}

function isForbiddenPlaced(b, r, c, depth = 0) {
  if (depth > 4) return false;
  const lens = DIRS.map(([dr, dc]) => runLen(b, r, c, dr, dc));
  if (lens.includes(5)) return false;      // 五ができれば禁じ手より優先
  if (lens.some((n) => n > 5)) return true; // 長連
  const fourDirs = DIRS.map(([dr, dc]) => fourCount(b, r, c, dr, dc));
  if (fourDirs.reduce((a, n) => a + n, 0) >= 2) return true; // 四四
  let threes = 0;
  // すでに四がある方向は三として数えない
  DIRS.forEach(([dr, dc], i) => { if (!fourDirs[i] && isThree(b, r, c, dr, dc, depth)) threes++; });
  return threes >= 2;                       // 三三
}

// 空点 (r,c) に黒を打つと禁じ手か
export function isForbidden(board, r, c) {
  if (board[r][c] !== null) return false;
  const b = board.map((row) => row.slice());
  b[r][c] = BLACK;
  return isForbiddenPlaced(b, r, c);
}

// 黒番の禁じ手の点（表示用）
export function forbiddenPoints(s) {
  if (!s.rules?.renju || s.turn !== BLACK || s.result) return [];
  const pts = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (s.board[r][c] !== null || !nearBlack(s.board, r, c)) continue;
    if (isForbidden(s.board, r, c)) pts.push([r, c]);
  }
  return pts;
}

// 禁じ手は周囲に黒石が3つ以上ないと起こらないので、事前に絞り込む
function nearBlack(b, r, c) {
  let n = 0;
  for (const [dr, dc] of DIRS) for (let k = -4; k <= 4; k++) {
    const rr = r + dr * k, cc = c + dc * k;
    if (k && inB(rr, cc) && b[rr][cc] === BLACK) n++;
  }
  return n >= 3;
}

export function legalMoves(s) {
  if (s.result) return [];
  const forbidden = new Set(forbiddenPoints(s).map(([r, c]) => r * SIZE + c));
  const moves = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (s.board[r][c] === null && !forbidden.has(r * SIZE + c)) moves.push({ to: [r, c] });
  }
  return moves;
}

function findLine(board, r, c, exact) {
  const me = board[r][c];
  for (const [dr, dc] of DIRS) {
    const line = [[r, c]];
    for (const sign of [1, -1]) {
      let rr = r + dr * sign, cc = c + dc * sign;
      while (inB(rr, cc) && board[rr][cc] === me) {
        line.push([rr, cc]);
        rr += dr * sign; cc += dc * sign;
      }
    }
    if (exact ? line.length === 5 : line.length >= 5) return line;
  }
  return null;
}

export function applyMove(s, mv) {
  if (s.result) throw new Error('対局は終了しています');
  const [r, c] = (mv && mv.to) || [];
  if (!Number.isInteger(r) || !Number.isInteger(c) || !inB(r, c) || s.board[r][c] !== null) {
    throw new Error('その場所には置けません');
  }
  const renjuBlack = !!s.rules?.renju && s.turn === BLACK;
  if (renjuBlack && isForbidden(s.board, r, c)) throw new Error('禁じ手です（三三・四四・長連）');
  const board = s.board.map((row) => row.slice());
  board[r][c] = s.turn;
  const ns = {
    board, rules: s.rules, turn: 1 - s.turn, moves: s.moves + 1, lastMove: { to: [r, c] },
    result: null, winLine: null,
    history: [...s.history, (s.turn === 0 ? '●' : '○') + coord(r, c)],
  };
  const line = findLine(board, r, c, renjuBlack);
  if (line) { ns.result = { winner: s.turn, reason: '五目並び' }; ns.winLine = line; }
  else if (ns.moves === SIZE * SIZE) ns.result = { winner: null, reason: '盤面が埋まりました' };
  return ns;
}
