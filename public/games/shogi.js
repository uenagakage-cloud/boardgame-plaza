// 将棋のルール（サーバーとブラウザで共通）
// 盤は board[r][c]。r=0 が一段目（後手側）、c=0 が9筋。駒は { o: 0|1, t: 'P' | '+P' ... }。
// 0 = 先手（下側）、1 = 後手（上側）。
export const id = 'shogi';
export const title = '将棋';
export const sideNames = ['先手', '後手'];
export const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
export const NAMES = {
  K: '玉', R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩',
  '+R': '龍', '+B': '馬', '+S': '成銀', '+N': '成桂', '+L': '成香', '+P': 'と',
};

const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const GOLD = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]];
const SILVER = [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]];
const KNIGHT = [[-2, -1], [-2, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const PROMOTABLE = new Set(['R', 'B', 'S', 'N', 'L', 'P']);
const KANJI_NUM = '一二三四五六七八九';
const ZEN_NUM = '１２３４５６７８９';

const inB = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9;
const eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

function defs(t) {
  switch (t) {
    case 'K': return { steps: KING, slides: [] };
    case 'G': case '+P': case '+L': case '+N': case '+S': return { steps: GOLD, slides: [] };
    case 'S': return { steps: SILVER, slides: [] };
    case 'N': return { steps: KNIGHT, slides: [] };
    case 'L': return { steps: [], slides: [[-1, 0]] };
    case 'P': return { steps: [[-1, 0]], slides: [] };
    case 'R': return { steps: [], slides: ORTH };
    case '+R': return { steps: DIAG, slides: ORTH };
    case 'B': return { steps: [], slides: DIAG };
    case '+B': return { steps: ORTH, slides: DIAG };
  }
  throw new Error('unknown piece ' + t);
}

export function init() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(null));
  const back = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];
  for (let c = 0; c < 9; c++) {
    board[0][c] = { o: 1, t: back[c] };
    board[2][c] = { o: 1, t: 'P' };
    board[6][c] = { o: 0, t: 'P' };
    board[8][c] = { o: 0, t: back[c] };
  }
  board[1][1] = { o: 1, t: 'R' }; board[1][7] = { o: 1, t: 'B' };
  board[7][7] = { o: 0, t: 'R' }; board[7][1] = { o: 0, t: 'B' };
  const emptyHand = () => Object.fromEntries(HAND_ORDER.map((t) => [t, 0]));
  const s = {
    board, hands: [emptyHand(), emptyHand()], turn: 0,
    positions: {}, lastMove: null, check: false, result: null, history: [],
  };
  s.positions[posKey(s)] = 1;
  return s;
}

function posKey(s) {
  return s.board.map((row) => row.map((p) => (p ? p.o + p.t.padStart(2, '_') : '___')).join('')).join('') +
    s.turn + s.hands.map((h) => HAND_ORDER.map((t) => h[t]).join(',')).join('|');
}

function targets(b, r, c) {
  const p = b[r][c], f = p.o === 0 ? 1 : -1, d = defs(p.t), out = [];
  for (const [dr, dc] of d.steps) {
    const rr = r + dr * f, cc = c + dc * f;
    if (inB(rr, cc) && (!b[rr][cc] || b[rr][cc].o !== p.o)) out.push([rr, cc]);
  }
  for (const [dr, dc] of d.slides) {
    let rr = r + dr * f, cc = c + dc * f;
    while (inB(rr, cc)) {
      const q = b[rr][cc];
      if (!q) out.push([rr, cc]);
      else { if (q.o !== p.o) out.push([rr, cc]); break; }
      rr += dr * f; cc += dc * f;
    }
  }
  return out;
}

function attacked(b, r, c, by) {
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    const p = b[i][j];
    if (p && p.o === by && targets(b, i, j).some((x) => x[0] === r && x[1] === c)) return true;
  }
  return false;
}

export function kingPos(b, o) {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (b[r][c] && b[r][c].o === o && b[r][c].t === 'K') return [r, c];
  return null;
}

function inCheck(b, o) {
  const k = kingPos(b, o);
  return k ? attacked(b, k[0], k[1], 1 - o) : false;
}

const inZone = (o, r) => (o === 0 ? r <= 2 : r >= 6);
function mustPromote(o, t, r) {
  const rel = o === 0 ? r : 8 - r; // 相手陣の奥からの距離
  return ((t === 'P' || t === 'L') && rel === 0) || (t === 'N' && rel <= 1);
}

function pseudoMoves(s) {
  const me = s.turn, b = s.board, moves = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const p = b[r][c];
    if (!p || p.o !== me) continue;
    for (const to of targets(b, r, c)) {
      const from = [r, c];
      if (PROMOTABLE.has(p.t) && mustPromote(me, p.t, to[0])) {
        moves.push({ from, to, promote: true });
      } else {
        moves.push({ from, to, promote: false });
        if (PROMOTABLE.has(p.t) && (inZone(me, r) || inZone(me, to[0]))) moves.push({ from, to, promote: true });
      }
    }
  }
  const hand = s.hands[me];
  for (const t of HAND_ORDER) {
    if (!hand[t]) continue;
    for (let c = 0; c < 9; c++) {
      if (t === 'P' && b.some((row) => row[c] && row[c].o === me && row[c].t === 'P')) continue; // 二歩
      for (let r = 0; r < 9; r++) {
        if (b[r][c] || mustPromote(me, t, r)) continue; // 行き所のない駒
        moves.push({ drop: t, to: [r, c] });
      }
    }
  }
  return moves;
}

function doMove(s, m) {
  const b = s.board.map((row) => row.slice());
  const hands = [{ ...s.hands[0] }, { ...s.hands[1] }];
  const me = s.turn, [tr, tc] = m.to;
  let piece, captured = null;
  if (m.drop) {
    piece = { o: me, t: m.drop };
    b[tr][tc] = piece;
    hands[me][m.drop]--;
  } else {
    const [fr, fc] = m.from;
    piece = b[fr][fc];
    captured = b[tr][tc];
    if (captured) hands[me][captured.t.replace('+', '')]++;
    b[tr][tc] = m.promote ? { o: me, t: '+' + piece.t } : piece;
    b[fr][fc] = null;
  }
  return { board: b, hands, piece, captured };
}

export function legalMoves(s, skipUchifuzume = false) {
  if (s.result) return [];
  const me = s.turn;
  return pseudoMoves(s).filter((m) => {
    const d = doMove(s, m);
    if (inCheck(d.board, me)) return false;
    if (m.drop === 'P' && !skipUchifuzume && inCheck(d.board, 1 - me)) {
      // 打ち歩詰めの禁止
      const ns = { board: d.board, hands: d.hands, turn: 1 - me, result: null };
      if (legalMoves(ns, true).length === 0) return false;
    }
    return true;
  });
}

export function applyMove(s, mv) {
  if (s.result) throw new Error('対局は終了しています');
  const m = legalMoves(s).find((x) => eq(x.to, mv.to) &&
    (mv.drop ? x.drop === mv.drop : !x.drop && eq(x.from, mv.from) && x.promote === !!mv.promote));
  if (!m) throw new Error('その手は指せません');
  const d = doMove(s, m);
  const ns = {
    board: d.board, hands: d.hands, turn: 1 - s.turn,
    positions: { ...s.positions }, lastMove: { from: m.from || null, to: m.to, drop: !!m.drop },
    check: false, result: null, history: s.history,
  };
  const key = posKey(ns);
  ns.positions[key] = (ns.positions[key] || 0) + 1;
  ns.check = inCheck(ns.board, ns.turn);
  if (legalMoves(ns).length === 0) {
    ns.result = { winner: s.turn, reason: '詰み' };
  } else if (ns.positions[key] >= 4) {
    ns.result = { winner: null, reason: '千日手' };
  }

  const [tr, tc] = m.to;
  const same = s.lastMove && eq(s.lastMove.to, m.to);
  let note = (s.turn === 0 ? '▲' : '△') + (same ? '同' : ZEN_NUM[8 - tc] + KANJI_NUM[tr]) + NAMES[d.piece.t];
  if (m.drop) note += '打';
  else if (m.promote) note += '成';
  else if (PROMOTABLE.has(d.piece.t) && (inZone(s.turn, m.from[0]) || inZone(s.turn, tr))) note += '不成';
  ns.history = [...s.history, note];
  return ns;
}

// 終局後に感想戦（局面を戻す・別の手を試す）ができる
export const reviewable = true;
