// ドット&ボックス（サーバーとブラウザで共通）
// 2〜4人。点と点の間に順番に線を1本ずつ引き、四角の4辺目を引いた人がその四角を取ってもう1本引ける。
// 全部の四角が埋まったら、四角を一番多く取った人の勝ち。
// 線: 横線 h[r][c]（r = 0〜n, c = 0〜n-1）、縦線 v[r][c]（r = 0〜n-1, c = 0〜n）。n は四角の数（一辺）。
// 手: { line: ['h' | 'v', r, c] } / { resign: true }
export const id = 'dotsboxes';
export const title = 'ドット&ボックス';
export const sideNames = Array.from({ length: 4 }, (_, i) => `プレイヤー${i + 1}`);
export const logTitle = 'ログ';
export const minPlayers = 2;
export const maxPlayers = 4;
export const lobbyReturn = true;
export const SIZES = [3, 4, 5, 6];

export function normalizeOptions(o) {
  return { size: SIZES.includes(Number(o && o.size)) ? Number(o.size) : 4 };
}
export const variantName = (o) => {
  const n = normalizeOptions(o).size;
  return `${n}×${n}マス`;
};

export function init(options, players = 2) {
  const opts = normalizeOptions(options);
  const n = opts.size;
  return {
    options: opts, players, n,
    h: Array.from({ length: n + 1 }, () => Array(n).fill(null)),
    v: Array.from({ length: n }, () => Array(n + 1).fill(null)),
    boxes: Array.from({ length: n }, () => Array(n).fill(null)),
    scores: Array(players).fill(0), out: Array(players).fill(false),
    turn: 0, lastLine: null, lastBoxes: [], lines: 0, result: null, history: [],
  };
}

const label = (seat) => `P${seat + 1}`;
const active = (s) => [...Array(s.players).keys()].filter((p) => !s.out[p]);

// 四角 (r, c) の4辺が全部引かれているか
const closed = (s, r, c) => s.h[r][c] != null && s.h[r + 1][c] != null && s.v[r][c] != null && s.v[r][c + 1] != null;

// 線のとなりの四角
export function boxesOf(n, [k, r, c]) {
  if (k === 'h') return [[r - 1, c], [r, c]].filter(([a]) => a >= 0 && a < n);
  return [[r, c - 1], [r, c]].filter(([, b]) => b >= 0 && b < n);
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `${s.scores[seat]}個`;

export function phaseText(s, you) {
  if (s.result) return null;
  if (you === s.turn) return s.lastBoxes.length && s.lastLine && s.lastLine.by === you ? '四角を取った！ もう1本引けます' : '線を1本引いてください';
  return null;
}

function finish(s) {
  const live = active(s);
  const best = Math.max(...live.map((p) => s.scores[p]));
  const top = live.filter((p) => s.scores[p] === best);
  s.result = top.length === 1 ? { winner: top[0], reason: `${best}個` } : { winner: null, reason: `${best}個で同点` };
}

const nextSeat = (s, from) => {
  let p = from;
  do p = (p + 1) % s.players; while (s.out[p]);
  return p;
};

const clone = (s) => ({
  ...s, h: s.h.map((x) => x.slice()), v: s.v.map((x) => x.slice()), boxes: s.boxes.map((x) => x.slice()),
  scores: s.scores.slice(), out: s.out.slice(), history: s.history.slice(),
});

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    if (s.out[seat]) return s;
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (active(ns).length < 2) finish(ns);
    else if (s.turn === seat) ns.turn = nextSeat(ns, seat);
    return ns;
  }
  if (s.out[seat]) throw new Error('抜けています');
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  const [k, r, c] = Array.isArray(mv.line) ? mv.line : [];
  const grid = k === 'h' ? ns.h : k === 'v' ? ns.v : null;
  if (!grid || !grid[r] || grid[r][c] === undefined) throw new Error('線を選んでください');
  if (grid[r][c] != null) throw new Error('そこはもう引かれています');
  grid[r][c] = seat;
  ns.lines += 1;
  ns.lastLine = { k, r, c, by: seat };
  const got = boxesOf(s.n, [k, r, c]).filter(([a, b]) => closed(ns, a, b));
  for (const [a, b] of got) ns.boxes[a][b] = seat;
  ns.lastBoxes = got;
  ns.scores[seat] += got.length;
  if (got.length) ns.history.push(`${label(seat)} が四角を${got.length}つ取った`);
  if (ns.boxes.every((row) => row.every((x) => x != null))) { finish(ns); return ns; }
  // 四角を取ったらもう1本、取れなかったら次の人
  if (!got.length) ns.turn = nextSeat(ns, seat);
  return ns;
}
