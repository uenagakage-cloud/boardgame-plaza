// 囲碁のルール（サーバーとブラウザで共通）
// board[r][c] は null | 0（黒）| 1（白）。黒が先手。日本ルール（地＋アゲハマ）、コミ6目半。
// 手: { to: [r, c] } 着手 / { pass: true } パス
// 両者が続けてパスすると終局処理（phase: 'scoring'）に入る。終局処理ではどちらの手番でも
//   { toggle: [r, c] } 死に石の指定・解除 / { accept: true } 合意 / { resume: true } 対局再開
export const id = 'go';
export const title = '囲碁';
export const sideNames = ['黒', '白'];
export const SIZES = [19, 13, 9];
export const KOMI = 6.5;

const NB = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const COLS = 'ABCDEFGHJKLMNOPQRST'; // I は使わない

export function normalizeOptions(o) {
  const size = Number(o && o.size);
  return { size: SIZES.includes(size) ? size : 19 };
}

export function variantName(options) {
  return `${normalizeOptions(options).size}路`;
}

export function starPoints(n) {
  const e = n === 9 ? 2 : 3, m = (n - 1) / 2, f = n - 1 - e;
  const pts = [[e, e], [e, f], [f, e], [f, f], [m, m]];
  if (n === 19) pts.push([e, m], [m, e], [m, f], [f, m]);
  return pts;
}

export const coord = (n, r, c) => COLS[c] + (n - r);
const key = (board) => board.map((row) => row.map((x) => (x === null ? '.' : x)).join('')).join('/');

export function init(options) {
  const { size } = normalizeOptions(options);
  const board = Array.from({ length: size }, () => Array(size).fill(null));
  return {
    size, board, turn: 0, phase: 'play', passes: 0,
    captures: [0, 0], prevKey: null, lastMove: null,
    dead: [], agreed: [false, false], result: null, history: [],
  };
}

const inB = (n, r, c) => r >= 0 && r < n && c >= 0 && c < n;

// (r,c) の石を含む連と呼吸点の数
function group(board, r, c) {
  const n = board.length, color = board[r][c], stones = [], seen = new Set([r * n + c]);
  const libs = new Set();
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    stones.push([cr, cc]);
    for (const [dr, dc] of NB) {
      const rr = cr + dr, cc2 = cc + dc;
      if (!inB(n, rr, cc2)) continue;
      const v = board[rr][cc2];
      if (v === null) libs.add(rr * n + cc2);
      else if (v === color && !seen.has(rr * n + cc2)) { seen.add(rr * n + cc2); stack.push([rr, cc2]); }
    }
  }
  return { stones, libs: libs.size };
}

// 終局処理中は両者が操作できる
export const canActOutOfTurn = (s) => s.phase === 'scoring' && !s.result;

function play(s, r, c) {
  const n = s.size;
  if (!inB(n, r, c) || s.board[r][c] !== null) throw new Error('そこには打てません');
  const me = s.turn, board = s.board.map((row) => row.slice());
  board[r][c] = me;
  let captured = 0;
  for (const [dr, dc] of NB) {
    const rr = r + dr, cc = c + dc;
    if (!inB(n, rr, cc) || board[rr][cc] !== 1 - me) continue;
    const g = group(board, rr, cc);
    if (g.libs === 0) { for (const [sr, sc] of g.stones) board[sr][sc] = null; captured += g.stones.length; }
  }
  if (group(board, r, c).libs === 0) throw new Error('自殺手は打てません');
  const k = key(board);
  if (k === s.prevKey) throw new Error('コウです。すぐには取り返せません');
  const captures = s.captures.slice();
  captures[me] += captured;
  return {
    ...s, board, turn: 1 - me, passes: 0, captures, prevKey: key(s.board),
    lastMove: { to: [r, c] }, history: [...s.history, (me === 0 ? '●' : '○') + coord(n, r, c)],
  };
}

// 死に石を除いた盤で、片方の色だけに囲まれた空点を地とする
export function territory(s) {
  const n = s.size, deadSet = new Set(s.dead.map(([r, c]) => r * n + c));
  const b = s.board.map((row, r) => row.map((v, c) => (deadSet.has(r * n + c) ? null : v)));
  const owner = Array.from({ length: n }, () => Array(n).fill(null));
  const seen = new Set();
  const terr = [0, 0];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (b[r][c] !== null || seen.has(r * n + c)) continue;
    const region = [], borders = new Set(), stack = [[r, c]];
    seen.add(r * n + c);
    while (stack.length) {
      const [cr, cc] = stack.pop();
      region.push([cr, cc]);
      for (const [dr, dc] of NB) {
        const rr = cr + dr, c2 = cc + dc;
        if (!inB(n, rr, c2)) continue;
        if (b[rr][c2] === null) { if (!seen.has(rr * n + c2)) { seen.add(rr * n + c2); stack.push([rr, c2]); } }
        else borders.add(b[rr][c2]);
      }
    }
    if (borders.size === 1) {
      const who = [...borders][0];
      terr[who] += region.length;
      for (const [rr, c2] of region) owner[rr][c2] = who;
    }
  }
  return { terr, owner };
}

export function score(s) {
  const { terr } = territory(s);
  const deadOf = [0, 0];
  for (const [r, c] of s.dead) deadOf[s.board[r][c]]++;
  return [terr[0] + s.captures[0] + deadOf[1], terr[1] + s.captures[1] + deadOf[0] + KOMI];
}

// 表示用（プレイヤー欄）
export function scoreOf(s, seat) {
  if (s.phase === 'scoring' || (s.result && s.phase === 'done')) return `${score(s)[seat]}目`;
  return `アゲハマ ${s.captures[seat]}`;
}

export function phaseText(s, you) {
  if (s.phase !== 'scoring' || s.result) return null;
  if (you >= 0 && s.agreed[you]) return '終局処理中：相手の合意を待っています';
  return '終局処理中：死に石をクリックして指定し、「合意」を押してください';
}

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('対局は終了しています');
  mv = mv || {};
  if (s.phase === 'scoring') {
    if (mv.toggle) {
      const [r, c] = mv.toggle;
      if (!inB(s.size, r, c) || s.board[r][c] === null) return s;
      const stones = group(s.board, r, c).stones;
      const n = s.size, deadSet = new Set(s.dead.map(([dr, dc]) => dr * n + dc));
      const allDead = stones.every(([sr, sc]) => deadSet.has(sr * n + sc));
      for (const [sr, sc] of stones) allDead ? deadSet.delete(sr * n + sc) : deadSet.add(sr * n + sc);
      return { ...s, dead: [...deadSet].map((k) => [Math.floor(k / n), k % n]), agreed: [false, false] };
    }
    if (mv.accept) {
      if (seat !== 0 && seat !== 1) throw new Error('対局者のみ合意できます');
      const agreed = s.agreed.slice();
      agreed[seat] = true;
      const ns = { ...s, agreed };
      if (agreed[0] && agreed[1]) {
        const [b, w] = score(ns);
        ns.phase = 'done';
        ns.result = { winner: b > w ? 0 : 1, reason: `黒${b}目・白${w}目（コミ${KOMI}）` };
      }
      return ns;
    }
    if (mv.resume) {
      return { ...s, phase: 'play', passes: 0, dead: [], agreed: [false, false], turn: seat === 0 || seat === 1 ? 1 - seat : s.turn };
    }
    throw new Error('終局処理中です');
  }
  if (mv.pass) {
    const passes = s.passes + 1;
    const ns = {
      ...s, turn: 1 - s.turn, passes, prevKey: key(s.board), lastMove: null,
      history: [...s.history, (s.turn === 0 ? '●' : '○') + 'パス'],
    };
    if (passes >= 2) Object.assign(ns, { phase: 'scoring', dead: [], agreed: [false, false] });
    return ns;
  }
  const [r, c] = mv.to || [];
  if (!Number.isInteger(r) || !Number.isInteger(c)) throw new Error('そこには打てません');
  return play(s, r, c);
}
