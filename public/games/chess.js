// チェスのルール（サーバーとブラウザで共通）
// 盤は board[r][c]。r=0 が8段目（黒側）、c=0 が a ファイル。駒は 'wK' 'bP' のような文字列。
export const id = 'chess';
export const title = 'チェス';
export const sideNames = ['白', '黒'];

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const FILES = 'abcdefgh';

const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const colorOf = (turn) => (turn === 0 ? 'w' : 'b');
const eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
export const sq = (r, c) => FILES[c] + (8 - r);

export function init() {
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = 'b' + back[c];
    board[1][c] = 'bP';
    board[6][c] = 'wP';
    board[7][c] = 'w' + back[c];
  }
  const s = {
    board, turn: 0,
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null, halfmove: 0, positions: {},
    lastMove: null, check: false, result: null, history: [],
  };
  s.positions[posKey(s)] = 1;
  return s;
}

function posKey(s) {
  const c = s.castling;
  return s.board.map((row) => row.map((p) => p || '--').join('')).join('') +
    s.turn + [c.wK, c.wQ, c.bK, c.bQ].map(Number).join('') + (s.ep ? s.ep.join('') : '-');
}

export function isAttacked(board, r, c, by) {
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (inB(pr, c + dc) && board[pr][c + dc] === by + 'P') return true;
  for (const [dr, dc] of KNIGHT) if (inB(r + dr, c + dc) && board[r + dr][c + dc] === by + 'N') return true;
  for (const [dr, dc] of KING) if (inB(r + dr, c + dc) && board[r + dr][c + dc] === by + 'K') return true;
  const slide = (dirs, kinds) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inB(rr, cc)) {
        const p = board[rr][cc];
        if (p) { if (p[0] === by && kinds.includes(p[1])) return true; break; }
        rr += dr; cc += dc;
      }
    }
    return false;
  };
  return slide(ORTH, 'RQ') || slide(DIAG, 'BQ');
}

export function findKing(board, color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === color + 'K') return [r, c];
  return null;
}

function pseudoMoves(s) {
  const me = colorOf(s.turn), opp = colorOf(1 - s.turn);
  const b = s.board, moves = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (!p || p[0] !== me) continue;
    const t = p[1], from = [r, c];
    if (t === 'P') {
      const dir = me === 'w' ? -1 : 1, start = me === 'w' ? 6 : 1, last = me === 'w' ? 0 : 7;
      const add = (tr, tc, extra = {}) => {
        if (tr === last) for (const promo of ['Q', 'R', 'B', 'N']) moves.push({ from, to: [tr, tc], promo, ...extra });
        else moves.push({ from, to: [tr, tc], ...extra });
      };
      if (inB(r + dir, c) && !b[r + dir][c]) {
        add(r + dir, c);
        if (r === start && !b[r + 2 * dir][c]) moves.push({ from, to: [r + 2 * dir, c], double: true });
      }
      for (const dc of [-1, 1]) {
        const tr = r + dir, tc = c + dc;
        if (!inB(tr, tc)) continue;
        const q = b[tr][tc];
        if (q && q[0] === opp) add(tr, tc);
        else if (eq(s.ep, [tr, tc])) moves.push({ from, to: [tr, tc], ep: true });
      }
    } else if (t === 'N' || t === 'K') {
      for (const [dr, dc] of t === 'N' ? KNIGHT : KING) {
        const tr = r + dr, tc = c + dc;
        if (inB(tr, tc) && (!b[tr][tc] || b[tr][tc][0] === opp)) moves.push({ from, to: [tr, tc] });
      }
      if (t === 'K') {
        const row = me === 'w' ? 7 : 0;
        if (r === row && c === 4 && !isAttacked(b, r, c, opp)) {
          if (s.castling[me + 'K'] && !b[row][5] && !b[row][6] && b[row][7] === me + 'R' &&
              !isAttacked(b, row, 5, opp) && !isAttacked(b, row, 6, opp)) {
            moves.push({ from, to: [row, 6], castle: 'K' });
          }
          if (s.castling[me + 'Q'] && !b[row][3] && !b[row][2] && !b[row][1] && b[row][0] === me + 'R' &&
              !isAttacked(b, row, 3, opp) && !isAttacked(b, row, 2, opp)) {
            moves.push({ from, to: [row, 2], castle: 'Q' });
          }
        }
      }
    } else {
      const dirs = t === 'R' ? ORTH : t === 'B' ? DIAG : ORTH.concat(DIAG);
      for (const [dr, dc] of dirs) {
        let tr = r + dr, tc = c + dc;
        while (inB(tr, tc)) {
          const q = b[tr][tc];
          if (!q) moves.push({ from, to: [tr, tc] });
          else { if (q[0] === opp) moves.push({ from, to: [tr, tc] }); break; }
          tr += dr; tc += dc;
        }
      }
    }
  }
  return moves;
}

const ROOK_HOME = { '7,0': 'wQ', '7,7': 'wK', '0,0': 'bQ', '0,7': 'bK' };

function doMove(s, m) {
  const b = s.board.map((row) => row.slice());
  const [fr, fc] = m.from, [tr, tc] = m.to;
  const piece = b[fr][fc], me = piece[0];
  const captured = m.ep ? b[fr][tc] : b[tr][tc];
  b[tr][tc] = m.promo ? me + m.promo : piece;
  b[fr][fc] = null;
  if (m.ep) b[fr][tc] = null;
  if (m.castle === 'K') { b[fr][5] = b[fr][7]; b[fr][7] = null; }
  if (m.castle === 'Q') { b[fr][3] = b[fr][0]; b[fr][0] = null; }
  const castling = { ...s.castling };
  if (piece[1] === 'K') { castling[me + 'K'] = false; castling[me + 'Q'] = false; }
  for (const k of [`${fr},${fc}`, `${tr},${tc}`]) if (ROOK_HOME[k]) castling[ROOK_HOME[k]] = false;
  return { board: b, castling, ep: m.double ? [(fr + tr) / 2, fc] : null, captured, piece };
}

export function legalMoves(s) {
  if (s.result) return [];
  const me = colorOf(s.turn), opp = colorOf(1 - s.turn);
  return pseudoMoves(s).filter((m) => {
    const { board } = doMove(s, m);
    const [kr, kc] = findKing(board, me);
    return !isAttacked(board, kr, kc, opp);
  });
}

function insufficient(board) {
  const others = board.flat().filter((p) => p && p[1] !== 'K');
  return others.length === 0 || (others.length === 1 && 'BN'.includes(others[0][1]));
}

export function applyMove(s, mv) {
  if (s.result) throw new Error('対局は終了しています');
  const m = legalMoves(s).find((x) => eq(x.from, mv.from) && eq(x.to, mv.to) &&
    (!x.promo || x.promo === (mv.promo || 'Q')));
  if (!m) throw new Error('その手は指せません');
  const d = doMove(s, m);
  const ns = {
    board: d.board, turn: 1 - s.turn, castling: d.castling, ep: d.ep,
    halfmove: d.piece[1] === 'P' || d.captured ? 0 : s.halfmove + 1,
    positions: { ...s.positions }, lastMove: { from: m.from, to: m.to },
    check: false, result: null, history: s.history,
  };
  const key = posKey(ns);
  ns.positions[key] = (ns.positions[key] || 0) + 1;
  const [kr, kc] = findKing(ns.board, colorOf(ns.turn));
  ns.check = isAttacked(ns.board, kr, kc, colorOf(s.turn));
  const replies = legalMoves(ns);

  if (!replies.length) {
    ns.result = ns.check ? { winner: s.turn, reason: 'チェックメイト' } : { winner: null, reason: 'ステイルメイト' };
  } else if (ns.halfmove >= 100) {
    ns.result = { winner: null, reason: '50手ルール' };
  } else if (ns.positions[key] >= 3) {
    ns.result = { winner: null, reason: '同一局面3回' };
  } else if (insufficient(ns.board)) {
    ns.result = { winner: null, reason: '戦力不足' };
  }

  let note;
  if (m.castle) note = m.castle === 'K' ? 'O-O' : 'O-O-O';
  else {
    const letter = d.piece[1] === 'P' ? '' : d.piece[1];
    note = letter + sq(...m.from) + (d.captured ? 'x' : '-') + sq(...m.to) + (m.promo ? '=' + m.promo : '');
  }
  if (ns.check) note += ns.result ? '#' : '+';
  ns.history = [...s.history, note];
  return ns;
}
