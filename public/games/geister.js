// ガイスター（サーバーとブラウザで共通）
// 6×6 の盤。2人がそれぞれ「良いおばけ（青）」4つと「悪いおばけ（赤）」4つを持つ。相手からはどちらか分からない。
// 最初に自分の陣地（手前2列の真ん中4マス）に、青と赤の並びを決めて置く（相手の番でも決められる）。
// 1手で1つのおばけを前後左右に1マス動かす。相手のおばけのマスに入ると取れる（取ったおばけの色は全員に見える）。
// 勝ち: 相手の青を4つ全部取る／自分の赤を4つ全部取らせる／自分の青を相手側の角（出口）から外に出す。
// 盤: board[r][c] = { o: 0|1, good: true|false } | null。先手は下（5・4列目）から上へ進む。
// 手: { layout: [8つの true(青)/false(赤)] } / { from: [r, c], to: [r, c] } / { from: [r, c], escape: true } / { resign: true }
export const id = 'geister';
export const title = 'ガイスター';
export const sideNames = ['先手', '後手'];
export const N = 6;
export const MAX_MOVES = 300; // これだけ指しても決着しなければ引き分け

// 置き場所（それぞれの手前から見て、前の列の左から→後ろの列の左から）
export const SLOTS = [
  [[4, 1], [4, 2], [4, 3], [4, 4], [5, 1], [5, 2], [5, 3], [5, 4]],
  [[1, 4], [1, 3], [1, 2], [1, 1], [0, 4], [0, 3], [0, 2], [0, 1]],
];
// 出口: 相手側の角
export const EXITS = [[[0, 0], [0, 5]], [[5, 0], [5, 5]]];

export function normalizeOptions(o) {
  return { cpu: !!(o && o.cpu) };
}
export const variantName = (o) => (normalizeOptions(o).cpu ? 'CPU対戦' : '');

export function init(options) {
  return {
    options: normalizeOptions(options), phase: 'setup', layouts: [null, null],
    board: Array.from({ length: N }, () => Array(N).fill(null)),
    captured: [[], []], turn: 0, moves: 0, lastMove: null, result: null, history: [],
  };
}

const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const COLS = 'ABCDEF';
export const squareName = (r, c) => `${COLS[c]}${N - r}`;
const isExit = (p, r, c) => EXITS[p].some(([a, b]) => a === r && b === c);

export function legalMoves(s) {
  if (s.result || s.phase !== 'play') return [];
  const p = s.turn, out = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = s.board[r][c];
    if (!x || x.o !== p) continue;
    if (x.good && isExit(p, r, c)) out.push({ from: [r, c], escape: true });
    for (const [dr, dc] of DIRS) {
      const tr = r + dr, tc = c + dc;
      if (!inB(tr, tc)) continue;
      const y = s.board[tr][tc];
      if (y && y.o === p) continue;
      out.push({ from: [r, c], to: [tr, tc], capture: !!y });
    }
  }
  return out;
}

export const canActOutOfTurn = (s) => s.phase === 'setup';

// 相手のおばけの色は、終わるまで見せない
export function viewFor(s, seat) {
  if (s.result) return s;
  return {
    ...s,
    layouts: s.layouts.map((l, i) => (i === seat ? l : l ? 'set' : null)),
    board: s.board.map((row) => row.map((x) => (x && x.o !== seat ? { o: x.o, good: null } : x))),
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'setup') {
    if (you < 0) return 'おばけを並べています…';
    return s.layouts[you] ? '相手が並べ終わるのを待っています…' : '青（良い）と赤（悪い）の並びを決めてください';
  }
  return null;
}

export const scoreOf = (s, seat) => {
  const got = s.captured[seat];
  return `取った 青${got.filter((x) => x === 'good').length}・赤${got.filter((x) => x === 'bad').length}`;
};

const clone = (s) => ({
  ...s, layouts: s.layouts.slice(), board: s.board.map((row) => row.slice()),
  captured: s.captured.map((x) => x.slice()), history: s.history.slice(),
});

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.layout) {
    if (s.phase !== 'setup') throw new Error('もう並べ終わっています');
    if (s.layouts[seat]) throw new Error('もう決めました');
    const l = mv.layout;
    if (!Array.isArray(l) || l.length !== 8 || l.filter((x) => x === true).length !== 4 || l.some((x) => typeof x !== 'boolean')) {
      throw new Error('青4つ・赤4つで並べてください');
    }
    ns.layouts[seat] = l.slice();
    ns.history.push(`${sideNames[seat]}が並べ終わりました`);
    if (ns.layouts.every(Boolean)) {
      for (const p of [0, 1]) SLOTS[p].forEach(([r, c], i) => { ns.board[r][c] = { o: p, good: ns.layouts[p][i] }; });
      ns.phase = 'play';
      ns.turn = 0;
      ns.history.push('対局開始！');
    }
    return ns;
  }
  if (s.phase !== 'play') throw new Error('まだ並べています');
  if (s.turn !== seat) throw new Error('相手の番です');
  const m = legalMoves(s).find((x) => same(x.from, mv.from) && (mv.escape ? x.escape : same(x.to, mv.to)));
  if (!m) throw new Error('そこには動かせません');
  const [fr, fc] = m.from;
  const piece = ns.board[fr][fc];
  const mark = seat === 0 ? '▲' : '△';
  ns.board[fr][fc] = null;
  ns.moves += 1;
  if (m.escape) {
    ns.lastMove = { from: m.from, escape: true };
    ns.history.push(`${mark}${squareName(fr, fc)} 脱出！`);
    ns.result = { winner: seat, reason: '青いおばけが脱出' };
    return ns;
  }
  const [tr, tc] = m.to;
  const target = ns.board[tr][tc];
  ns.board[tr][tc] = piece;
  ns.lastMove = { from: m.from, to: m.to };
  let note = `${mark}${squareName(fr, fc)}→${squareName(tr, tc)}`;
  if (target) {
    ns.captured[seat].push(target.good ? 'good' : 'bad');
    note += target.good ? '（青を取った）' : '（赤を取った）';
  }
  ns.history.push(note);
  const got = ns.captured[seat];
  if (got.filter((x) => x === 'good').length === 4) ns.result = { winner: seat, reason: '青を4つ取った' };
  else if (got.filter((x) => x === 'bad').length === 4) ns.result = { winner: 1 - seat, reason: '赤を4つ取らせた' };
  else if (ns.moves >= MAX_MOVES) ns.result = { winner: null, reason: `${MAX_MOVES}手で決着つかず` };
  else ns.turn = 1 - seat;
  return ns;
}

// ---------- CPU ----------
// 並びはでたらめ。指すときは「脱出できるなら脱出」「青は出口へ近づけ、相手のとなりは避ける」「赤は相手に近づける」
export function aiMove(s, seat, rng) {
  const rand = rng ? () => (rng(1000) - 1) / 1000 : Math.random;
  if (s.phase === 'setup') {
    if (s.layouts[seat]) return null;
    const l = [true, true, true, true, false, false, false, false];
    for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
    return { layout: l };
  }
  if (s.phase !== 'play' || s.turn !== seat) return null;
  const moves = legalMoves(s);
  if (!moves.length) return null;
  const opp = 1 - seat;
  const exitDist = (r, c) => Math.min(...EXITS[seat].map(([a, b]) => Math.abs(a - r) + Math.abs(b - c)));
  const nearEnemy = (board, r, c) => DIRS.some(([dr, dc]) => inB(r + dr, c + dc) && board[r + dr][c + dc] && board[r + dr][c + dc].o === opp);
  const badTaken = s.captured[seat].filter((x) => x === 'bad').length;
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    let score = rand() * 0.5;
    const [fr, fc] = m.from;
    const me = s.board[fr][fc];
    if (m.escape) score += 1e6;
    else {
      const [tr, tc] = m.to;
      const target = s.board[tr][tc];
      if (target) {
        // 相手が自分の出口（こちらの角）にいるなら必ず取る。赤をもう3つ取っていたら取るのはこわい
        const danger = EXITS[opp].some(([a, b]) => a === tr && b === tc);
        score += danger ? 50 : badTaken >= 3 ? -30 : 4;
      }
      if (me.good) {
        score += 1.5 * (exitDist(fr, fc) - exitDist(tr, tc));
        const after = s.board.map((row) => row.slice());
        after[fr][fc] = null;
        after[tr][tc] = me;
        if (nearEnemy(after, tr, tc)) score -= 4;
      } else {
        // 赤は相手のそばへ（取らせたい）
        let d0 = 99, d1 = 99;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const x = s.board[r][c];
          if (!x || x.o !== opp) continue;
          d0 = Math.min(d0, Math.abs(r - fr) + Math.abs(c - fc));
          d1 = Math.min(d1, Math.abs(r - tr) + Math.abs(c - tc));
        }
        score += 0.6 * (d0 - d1);
      }
    }
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best.escape ? { from: best.from, escape: true } : { from: best.from, to: best.to };
}
