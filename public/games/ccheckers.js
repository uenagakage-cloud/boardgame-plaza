// チャイニーズチェッカー（サーバーとブラウザで共通）
// 2〜6人。星の形の盤（121の穴）。それぞれ自分の陣地（星の角）に10個のコマを持ち、向かいの陣地へ全部移したら勝ち。
// 1手で、となりの空いた穴へ1つ進むか、となりのコマ（だれのでも）を跳び越えてその先の空いた穴へ移る。跳ぶのは何回でも続けられる。
// 座標: キューブ座標 (x, y, z)（x + y + z = 0）。cells[i] = [x, y, z]。陣地は星の6つの角（三角形）。
// 手: { from: 穴, to: 穴 } / { resign: true }
import { seatNames, label, randInt } from './util.js';

export const id = 'ccheckers';
export const title = 'チャイニーズチェッカー';
export const minPlayers = 2;
export const maxPlayers = 6;
export const sideNames = seatNames(6);
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1971c2', '#7048e8', '#c2255c'];
export const COLOR_NAMES = ['赤', 'オレンジ', '緑', '青', '紫', 'ピンク'];
const MAX_TURNS = 400; // これを超えたら、陣地に多く入れた人の勝ち

// 星の盤を作る
export const CELLS = [];
const IDX = new Map();
const key = (x, y, z) => `${x},${y},${z}`;
const inStar = (x, y, z) => {
  const a = [x, y, z];
  if (a.every((v) => Math.abs(v) <= 4)) return true;
  return a.some((v, i) => {
    const o = a.filter((_, j) => j !== i);
    return (v >= 5 && o.every((w) => w >= -4 && w <= -1)) || (v <= -5 && o.every((w) => w >= 1 && w <= 4));
  });
};
for (let x = -8; x <= 8; x++) for (let y = -8; y <= 8; y++) {
  const z = -x - y;
  if (Math.abs(z) > 8 || !inStar(x, y, z)) continue;
  IDX.set(key(x, y, z), CELLS.length);
  CELLS.push([x, y, z]);
}
export const cellAt = (x, y, z) => IDX.get(key(x, y, z));
const DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
export const NEIGHBORS = CELLS.map(([x, y, z]) => DIRS.map(([a, b, c]) => cellAt(x + a, y + b, z + c)));

// 6つの角（まわる順）。軸 k の向き sg: その座標が 5 以上（sg=1）か -5 以下（sg=-1）
const CORNERS = [[0, 1], [2, -1], [1, 1], [0, -1], [2, 1], [1, -1]];
export const TRIANGLES = CORNERS.map(([k, sg]) => CELLS.map((c, i) => (sg * c[k] >= 5 ? i : -1)).filter((i) => i >= 0));
export const TIPS = CORNERS.map(([k, sg], t) => TRIANGLES[t].find((i) => sg * CELLS[i][k] === 8));
// 人数ごとの陣地（向かいの角へ進む）
export const HOMES = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
export const targetOf = (home) => (home + 3) % 6;

export function init(options, players = 2) {
  const homes = HOMES[players];
  const board = Array(CELLS.length).fill(null);
  homes.forEach((h, p) => { for (const i of TRIANGLES[h]) board[i] = p; });
  return { players, homes, board, turn: 0, turns: 0, out: Array(players).fill(false), last: null, result: null, history: [] };
}

// from のコマが行ける穴と、その道すじ
export function reach(board, from) {
  const out = new Map();
  for (const n of NEIGHBORS[from]) if (n != null && board[n] == null) out.set(n, [from, n]);
  const seen = new Set([from]);
  const queue = [[from, [from]]];
  while (queue.length) {
    const [at, path] = queue.shift();
    NEIGHBORS[at].forEach((mid, d) => {
      if (mid == null || board[mid] == null) return;
      const land = NEIGHBORS[mid][d];
      if (land == null || (board[land] != null && land !== from) || seen.has(land)) return;
      seen.add(land);
      const p2 = [...path, land];
      if (land !== from && !out.has(land)) out.set(land, p2);
      queue.push([land, p2]);
    });
  }
  return out;
}

export const inTarget = (s, p) => TRIANGLES[targetOf(s.homes[p])].filter((i) => s.board[i] === p).length;
function finished(s, p) {
  const t = TRIANGLES[targetOf(s.homes[p])];
  // 自分のコマが全部入ったか、陣地が全部うまって自分のコマが1つ以上（相手のコマが居座っていても勝ちにする）
  return inTarget(s, p) === 10 || (t.every((i) => s.board[i] != null) && t.some((i) => s.board[i] === p));
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `ゴール${inTarget(s, seat)}/10`;
export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  return '動かすコマを選んでください（向かいの角へ全部運ぼう）';
}

const nextSeat = (s, p) => { let q = p; do q = (q + 1) % s.players; while (s.out[q]); return q; };
const live = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = { ...s, board: s.board.slice(), out: s.out.slice(), history: s.history.slice() };
  if (mv.resign) {
    if (s.out[seat]) throw new Error('抜けています');
    ns.out[seat] = true;
    ns.board = ns.board.map((x) => (x === seat ? null : x));
    ns.history.push(`${label(seat)} が抜けました`);
    const alive = live(ns);
    if (alive.length === 1) ns.result = { winner: alive[0], reason: 'ほかの全員が抜けた' };
    else if (s.turn === seat) ns.turn = nextSeat(ns, seat);
    return ns;
  }
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  const from = Number(mv.from), to = Number(mv.to);
  if (s.board[from] !== seat) throw new Error('自分のコマを選んでください');
  const path = reach(s.board, from).get(to);
  if (!path) throw new Error('そこへは行けません');
  ns.board[from] = null;
  ns.board[to] = seat;
  ns.turns = s.turns + 1;
  const hops = path.length === 2 && NEIGHBORS[from].includes(to) ? 0 : path.length - 1;
  ns.last = { by: seat, path, hops };
  ns.history.push(`${label(seat)} ${hops ? `${hops}回ジャンプ` : '1つ進む'}`);
  if (finished(ns, seat)) { ns.result = { winner: seat, reason: '全部のコマが向かいの陣地に入った' }; return ns; }
  if (ns.turns >= MAX_TURNS * s.players / 2) {
    const alive = live(ns);
    const best = Math.max(...alive.map((p) => inTarget(ns, p)));
    const top = alive.filter((p) => inTarget(ns, p) === best);
    ns.result = top.length === 1 ? { winner: top[0], reason: `手数の上限。陣地に${best}個` } : { winner: null, reason: '手数の上限で同点' };
    return ns;
  }
  // 動けない人は飛ばす
  let next = nextSeat(ns, seat);
  for (let k = 0; k < s.players && !hasMove(ns, next); k++) next = nextSeat(ns, next);
  ns.turn = next;
  return ns;
}

const hasMove = (s, p) => s.board.some((x, i) => x === p && reach(s.board, i).size);

// ---------- CPU ----------
// 向かいの角への近さ（キューブ座標の距離）の合計が小さくなる手。陣地の奥（角の先）ほど良い
const dist = (a, b) => (Math.abs(CELLS[a][0] - CELLS[b][0]) + Math.abs(CELLS[a][1] - CELLS[b][1]) + Math.abs(CELLS[a][2] - CELLS[b][2])) / 2;
export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat || s.out[seat]) return null;
  const tgt = targetOf(s.homes[seat]);
  const tip = TIPS[tgt];
  const tri = new Set(TRIANGLES[tgt]);
  let best = [], bv = -Infinity;
  s.board.forEach((x, from) => {
    if (x !== seat) return;
    for (const [to, path] of reach(s.board, from)) {
      let v = dist(from, tip) - dist(to, tip);
      if (tri.has(from) && !tri.has(to)) v -= 5; // 陣地から出ない
      if (!tri.has(from) && tri.has(to)) v += 1.5;
      v += dist(from, tip) * 0.05; // 遅れているコマを少し優先
      v += (path.length - 2) * 0.01;
      if (v > bv + 1e-9) { bv = v; best = [{ from, to }]; } else if (Math.abs(v - bv) < 1e-9) best.push({ from, to });
    }
  });
  return best.length ? best[randInt(rng, best.length)] : null;
}
