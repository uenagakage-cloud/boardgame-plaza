// ブロックスのルール（サーバーとブラウザで共通）
// 20×20 の盤に4色（青・黄・赤・緑）。各色21個のピース（1〜5マス）を順番に置く。
// 各色の最初のピースは自分の角のマスを覆う。2個目からは同じ色のピースと「角だけ」で接し、
// 同じ色と辺で接してはいけない（ほかの色とは自由に接してよい）。
// 置ける場所がなくなった色は自動で終了。全色が終わったら点数で勝敗:
//   残ったマス1つにつき -1点、全部置けたら +15点、最後に置いたのが1マスのピースならさらに +5点。
// 2人なら1人2色（青＋赤 / 黄＋緑）、3人なら緑を使わない、4人なら1人1色。
// 手: { piece: 番号, t: 向き(0〜7), r, c } 向きを変えたピースの左上を (r, c) に置く / { resign: true }
export const id = 'blokus';
export const title = 'ブロックス';
export const sideNames = ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4'];
export const minPlayers = 2;
export const maxPlayers = 4;
export const SIZE = 20;
export const COLOR_NAMES = ['青', '黄', '赤', '緑'];
export const CORNERS = [[0, 0], [0, SIZE - 1], [SIZE - 1, SIZE - 1], [SIZE - 1, 0]];

export const PIECES = [
  [[0, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 1]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 1], [0, 2], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]],
  [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]],
  [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]],
  [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]],
  [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]],
  [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]],
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
];
const TOTAL_SQUARES = PIECES.reduce((a, p) => a + p.length, 0); // 89

// 向き t: 0〜3 は回転、4〜7 は裏返してから回転。左上が (0, 0) になるように詰める
export function orient(cells, t) {
  let cs = cells.map(([r, c]) => (t >= 4 ? [r, -c] : [r, c]));
  for (let k = 0; k < t % 4; k++) cs = cs.map(([r, c]) => [c, -r]);
  const minR = Math.min(...cs.map((x) => x[0])), minC = Math.min(...cs.map((x) => x[1]));
  return cs.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// 形が重複しない向きの一覧
const UNIQUE_T = PIECES.map((cells) => {
  const seen = new Set(), ts = [];
  for (let t = 0; t < 8; t++) {
    const key = JSON.stringify(orient(cells, t));
    if (!seen.has(key)) { seen.add(key); ts.push(t); }
  }
  return ts;
});

export function colorsOf(players, seat) {
  if (players === 2) return seat === 0 ? [0, 2] : [1, 3];
  return [seat];
}
export function ownerOf(players, color) {
  if (players === 2) return color % 2;
  return color < players ? color : -1;
}

export function init(options, players = 2) {
  const s = {
    players, board: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)),
    remaining: Array.from({ length: 4 }, () => PIECES.map(() => true)),
    placedAny: [false, false, false, false],
    done: [0, 1, 2, 3].map((c) => ownerOf(players, c) < 0), // 3人なら緑は使わない
    lastPiece: [null, null, null, null], out: Array(players).fill(false),
    color: 0, turn: 0, lastMove: null, result: null, history: [],
  };
  s.turn = ownerOf(players, s.color);
  return s;
}

const inB = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// 置けるか。置けなければ理由の文字列、置ければ null
export function placementError(s, color, cells) {
  const b = s.board;
  for (const [r, c] of cells) {
    if (!inB(r, c)) return '盤の外にはみ出しています';
    if (b[r][c] !== null) return 'ほかのピースと重なっています';
  }
  for (const [r, c] of cells) {
    for (const [dr, dc] of EDGES) {
      const rr = r + dr, cc = c + dc;
      if (inB(rr, cc) && b[rr][cc] === color) return '同じ色のピースと辺で接しています';
    }
  }
  if (!s.placedAny[color]) {
    const [cr, cc] = CORNERS[color];
    return cells.some(([r, c]) => r === cr && c === cc) ? null : '最初のピースは自分の角のマスを覆ってください';
  }
  const touches = cells.some(([r, c]) => DIAGS.some(([dr, dc]) => inB(r + dr, c + dc) && b[r + dr][c + dc] === color));
  return touches ? null : '同じ色のピースと角で接するように置いてください';
}

export const placeCells = (piece, t, r, c) => orient(PIECES[piece], t).map(([dr, dc]) => [r + dr, c + dc]);

// その色に置ける場所が1つでもあるか（角の候補マスから探す）
export function hasMove(s, color) {
  const b = s.board;
  let anchors = [];
  if (!s.placedAny[color]) anchors = [CORNERS[color]];
  else {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (b[r][c] !== null) continue;
      if (EDGES.some(([dr, dc]) => inB(r + dr, c + dc) && b[r + dr][c + dc] === color)) continue;
      if (DIAGS.some(([dr, dc]) => inB(r + dr, c + dc) && b[r + dr][c + dc] === color)) anchors.push([r, c]);
    }
  }
  if (!anchors.length) return false;
  for (let p = 0; p < PIECES.length; p++) {
    if (!s.remaining[color][p]) continue;
    for (const t of UNIQUE_T[p]) {
      const shape = orient(PIECES[p], t);
      for (const [ar, ac] of anchors) {
        for (const [sr, sc] of shape) {
          const cells = shape.map(([r, c]) => [r - sr + ar, c - sc + ac]);
          if (!placementError(s, color, cells)) return true;
        }
      }
    }
  }
  return false;
}

export function colorScore(s, color) {
  const left = PIECES.reduce((a, p, i) => a + (s.remaining[color][i] ? p.length : 0), 0);
  if (left === 0) return 15 + (s.lastPiece[color] === 0 ? 5 : 0);
  return -left;
}

export function seatScore(s, seat) {
  return colorsOf(s.players, seat).reduce((a, c) => a + colorScore(s, c), 0);
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `${seatScore(s, seat)}点`;

export function phaseText(s, you) {
  if (s.result) return null;
  const owner = ownerOf(s.players, s.color);
  return you === owner ? `あなたの番：${COLOR_NAMES[s.color]}のピースを置いてください` : null;
}

const clone = (s) => ({
  ...s, board: s.board.map((row) => row.slice()), remaining: s.remaining.map((r) => r.slice()),
  placedAny: s.placedAny.slice(), done: s.done.slice(), lastPiece: s.lastPiece.slice(), out: s.out.slice(), history: s.history.slice(),
});

// 次の色へ。置けない色は終了にして飛ばす。全色終了なら勝敗
function advance(ns) {
  for (let k = 1; k <= 4; k++) {
    const c = (ns.color + k) % 4;
    if (ns.done[c]) continue;
    if (ns.out[ownerOf(ns.players, c)] || !hasMove(ns, c)) {
      ns.done[c] = true;
      ns.history.push(`${COLOR_NAMES[c]}は置ける場所がなくなりました`);
      continue;
    }
    ns.color = c;
    ns.turn = ownerOf(ns.players, c);
    return;
  }
  // 全色終了
  const scores = [...Array(ns.players).keys()].map((p) => (ns.out[p] ? -Infinity : seatScore(ns, p)));
  const best = Math.max(...scores);
  const winners = scores.map((x, p) => (x === best ? p : -1)).filter((p) => p >= 0);
  ns.turn = -1;
  ns.result = winners.length === 1
    ? { winner: winners[0], reason: `${best}点` }
    : { winner: null, winners: [], reason: `${best}点で同点` };
}

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    ns.out[seat] = true;
    for (const c of colorsOf(ns.players, seat)) ns.done[c] = true;
    ns.history.push(`P${seat + 1} が投了`);
    const left = [...Array(ns.players).keys()].filter((p) => !ns.out[p]);
    if (left.length === 1) { ns.result = { winner: left[0], reason: '他の全員が投了' }; return ns; }
    if (ownerOf(ns.players, ns.color) === seat) advance(ns);
    return ns;
  }
  if (ownerOf(s.players, s.color) !== seat) throw new Error('あなたの番ではありません');
  const piece = Number(mv.piece), t = Number(mv.t) || 0;
  if (!(piece in PIECES) || !s.remaining[s.color][piece]) throw new Error('そのピースは使えません');
  if (!(t >= 0 && t < 8)) throw new Error('向きが正しくありません');
  const cells = placeCells(piece, t, Number(mv.r), Number(mv.c));
  const err = placementError(s, s.color, cells);
  if (err) throw new Error(err);
  for (const [r, c] of cells) ns.board[r][c] = s.color;
  ns.remaining[s.color][piece] = false;
  ns.placedAny[s.color] = true;
  ns.lastPiece[s.color] = piece;
  ns.lastMove = { color: s.color, cells };
  ns.history.push(`P${seat + 1}（${COLOR_NAMES[s.color]}）${PIECES[piece].length}マスのピース`);
  if (ns.remaining[s.color].every((x) => !x)) {
    ns.done[s.color] = true;
    ns.history.push(`${COLOR_NAMES[s.color]}は全部置きました！`);
  }
  advance(ns);
  return ns;
}

export const TOTAL = TOTAL_SQUARES;
