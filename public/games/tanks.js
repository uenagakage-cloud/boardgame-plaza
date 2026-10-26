// VSタンク（サーバーとブラウザで共通）
// 2〜4人。上から見た迷路のステージで、戦車を動かして撃ち合う。弾は壁で1回はね返る（自分の弾にも当たる）。
// 地雷を置くと、少しして近くに戦車が来たとき（または時間がたつと）爆発する。最後まで残った人がそのラウンドの勝ち。
// 決めた回数（先取）勝った人の優勝。
// 操作はリアルタイム: { input: { mx, my, aim, fire, mine } }（fire・mine は押した回数の通し番号）。みんなには送り直さない（quietMove）。
// 物理はサーバーが 50 ミリ秒ごとに tick で進める。CPU も tick の中で動く（ctx.bots）。
import { pickOptions, seatNames, label, randInt } from './util.js';

export const id = 'tanks';
export const title = 'VSタンク';
export const minPlayers = 2;
export const maxPlayers = 4;
export const sideNames = seatNames(4);
export const botInTick = true;
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const OPTIONS = [{ key: 'wins', label: '先取', values: [3, 2, 5], names: ['3本先取', '2本先取', '5本先取'] }];
export const COLORS = ['#1c7ed6', '#e03131', '#2f9e44', '#f08c00'];
export const COLOR_NAMES = ['青', '赤', '緑', 'オレンジ'];
export const W = 17, H = 11;
export const TANK_R = 0.36, BULLET_R = 0.1, MINE_R = 0.22, BLAST_R = 1.5;
const DT = 0.05, TICK_MS = 50;
const SPEED = 2.6, BULLET_SPEED = 6.2, MAX_BULLETS = 3, COOLDOWN = 0.4, MAX_MINES = 1;
const MINE_ARM = 1.0, MINE_FUSE = 8, COUNT_S = 2.5, END_S = 2.8;

export const normalizeOptions = (o) => pickOptions(o, OPTIONS);
export const variantName = (o) => `${normalizeOptions(o).wins}本先取`;

// ステージ（# は壁）。スタート位置 1〜4
export const MAPS = [
  [
    '.................',
    '.1.....#...#...3.',
    '.......#...#.....',
    '...##.........##.',
    '.......#####.....',
    '.................',
    '.....#####.......',
    '.##.........##...',
    '.....#...#.......',
    '.4...#...#.....2.',
    '.................',
  ],
  [
    '.................',
    '.1..#.......#..3.',
    '....#...#...#....',
    '....#...#........',
    '........#...###..',
    '..###.......#....',
    '....#...#........',
    '........#...#....',
    '....#...#...#....',
    '.4..#.......#..2.',
    '.................',
  ],
  [
    '.................',
    '.1.......#.....3.',
    '...###...#.......',
    '...#.........##..',
    '.......#.#.......',
    '..#...........#..',
    '.......#.#.......',
    '..##.........#...',
    '.......#...###...',
    '.4.....#.......2.',
    '.................',
  ],
];
export const wallAt = (map, x, y) => {
  const c = Math.floor(x), r = Math.floor(y);
  if (c < 0 || r < 0 || c >= W || r >= H) return true;
  return MAPS[map][r][c] === '#';
};
function spawns(map) {
  const out = [];
  MAPS[map].forEach((row, r) => [...row].forEach((ch, c) => { if (/[1-4]/.test(ch)) out[Number(ch) - 1] = [c + 0.5, r + 0.5]; }));
  return out;
}

export function init(options, players = 2, rng) {
  const s = { players, options: normalizeOptions(options), wins: Array(players).fill(0), round: 0, out: Array(players).fill(false), result: null, history: [], turn: 0, seq: 0 };
  return startRound(s, rng);
}

function startRound(s, rng) {
  s.round += 1;
  s.map = randInt(rng, MAPS.length);
  const sp = spawns(s.map);
  // 2人なら向かいの角
  const order = s.players === 2 ? [0, 1] : [0, 1, 2, 3];
  // 入力は前のラウンドから引きつぐ（発射の通し番号がずれて、始まってすぐ撃たないように）
  s.inputs = s.inputs || Array.from({ length: s.players }, () => ({ mx: 0, my: 0, aim: null, fire: 0, mine: 0 }));
  s.tanks = Array.from({ length: s.players }, (_, p) => {
    const [x, y] = sp[order[p]];
    const a = Math.atan2(H / 2 - y, W / 2 - x);
    s.inputs[p].aim = null;
    return { x, y, a, t: a, alive: !s.out[p], cool: 0, fireSeq: s.inputs[p].fire, mineSeq: s.inputs[p].mine, bot: null };
  });
  s.bullets = [];
  s.mines = [];
  s.blasts = [];
  s.phase = 'count';
  s.time = 0;
  s.phaseEnd = COUNT_S;
  s.tickAfter = TICK_MS;
  s.history = [`第${s.round}ラウンド`];
  s.roundWinner = undefined;
  return s;
}

export function viewFor(s) {
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    ...s, inputs: null,
    tanks: s.tanks.map((t) => ({ x: r2(t.x), y: r2(t.y), a: r2(t.a), t: r2(t.t), alive: t.alive, cool: t.cool > 0 })),
    bullets: s.bullets.map((b) => ({ id: b.id, x: r2(b.x), y: r2(b.y), by: b.by })),
    mines: s.mines.map((m) => ({ id: m.id, x: r2(m.x), y: r2(m.y), by: m.by, armed: m.age >= MINE_ARM, late: m.age > MINE_FUSE - 2 })),
  };
}

export const canActOutOfTurn = () => true;
export const quietMove = (mv) => !!(mv && mv.input);
export const scoreOf = (s, seat) => `${s.wins[seat]}勝`;
export function phaseText(s, you) {
  if (s.result || you < 0) return null;
  if (s.phase === 'count') return `第${s.round}ラウンド もうすぐスタート！`;
  if (s.phase === 'roundEnd') return s.roundWinner == null ? '相打ち！' : s.roundWinner === you ? 'ラウンドの勝ち！' : 'やられた…';
  return s.tanks[you] && !s.tanks[you].alive ? 'やられた…（見ています）' : '撃ち合い中！ 最後まで残ろう';
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (mv.resign) {
    const ns = { ...s, out: s.out.slice(), tanks: s.tanks.map((t) => ({ ...t })), history: s.history.slice() };
    ns.out[seat] = true;
    if (ns.tanks[seat]) ns.tanks[seat].alive = false;
    ns.history.push(`${label(seat)} が抜けました`);
    const alive = ns.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
    if (alive.length === 1) { ns.result = { winner: alive[0], reason: 'ほかの全員が抜けた' }; ns.tickAfter = null; }
    return ns;
  }
  if (mv.input) {
    // 入力はその場で書きかえる（50 ミリ秒ごとの tick が使う）
    const i = mv.input, cur = s.inputs[seat];
    if (!cur) return s;
    cur.mx = clamp(num(i.mx), -1, 1);
    cur.my = clamp(num(i.my), -1, 1);
    if (i.aim != null) cur.aim = num(i.aim);
    cur.fire = Math.max(cur.fire, Math.floor(num(i.fire)));
    cur.mine = Math.max(cur.mine, Math.floor(num(i.mine)));
    return s;
  }
  throw new Error('不明な操作です');
}

// 円が壁にぶつかるか
function hitsWall(map, x, y, r) {
  for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, -r], [0, r], [-r, 0], [r, 0]]) if (wallAt(map, x + dx, y + dy)) return true;
  return false;
}

// 見通し（間に壁がないか）
export function clearLine(map, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 0.15);
  for (let k = 1; k < n; k++) if (wallAt(map, x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n)) return false;
  return true;
}

function fire(s, p) {
  const t = s.tanks[p];
  if (!t.alive || t.cool > 0 || s.bullets.filter((b) => b.by === p).length >= MAX_BULLETS) return;
  const bx = t.x + Math.cos(t.t) * (TANK_R + 0.18), by = t.y + Math.sin(t.t) * (TANK_R + 0.18);
  if (wallAt(s.map, bx, by)) return;
  s.bullets.push({ id: ++s.seq, by: p, x: bx, y: by, vx: Math.cos(t.t) * BULLET_SPEED, vy: Math.sin(t.t) * BULLET_SPEED, bounces: 1, age: 0 });
  t.cool = COOLDOWN;
  s.shots = (s.shots || 0) + 1;
}

function layMine(s, p) {
  const t = s.tanks[p];
  if (!t.alive || s.mines.filter((m) => m.by === p).length >= MAX_MINES) return;
  s.mines.push({ id: ++s.seq, by: p, x: t.x, y: t.y, age: 0 });
}

function explode(s, m) {
  s.mines = s.mines.filter((x) => x !== m);
  s.blasts.push({ id: ++s.seq, x: m.x, y: m.y, age: 0 });
  for (const [p, t] of s.tanks.entries()) if (t.alive && Math.hypot(t.x - m.x, t.y - m.y) < BLAST_R) kill(s, p, m.by, '地雷');
  s.bullets = s.bullets.filter((b) => Math.hypot(b.x - m.x, b.y - m.y) >= BLAST_R);
  for (const o of s.mines.slice()) if (Math.hypot(o.x - m.x, o.y - m.y) < BLAST_R) explode(s, o);
}

function kill(s, p, by, how) {
  const t = s.tanks[p];
  if (!t.alive) return;
  t.alive = false;
  s.blasts.push({ id: ++s.seq, x: t.x, y: t.y, age: 0, tank: p });
  s.history.push(by === p ? `${label(p)} 自爆…（${how}）` : `${label(by)} が ${label(p)} を倒した！（${how}）`);
  s.kills = (s.kills || 0) + 1;
}

// ---------- CPU ----------
function botThink(s, p, rng) {
  const t = s.tanks[p];
  const inp = s.inputs[p];
  const enemies = s.tanks.map((e, i) => (i !== p && e.alive ? i : -1)).filter((i) => i >= 0);
  if (!t.alive || !enemies.length) { inp.mx = inp.my = 0; return; }
  t.bot = t.bot || { goal: null, repath: 0, dodge: 0 };
  const near = enemies.sort((a, b) => Math.hypot(s.tanks[a].x - t.x, s.tanks[a].y - t.y) - Math.hypot(s.tanks[b].x - t.x, s.tanks[b].y - t.y))[0];
  const e = s.tanks[near];
  const see = clearLine(s.map, t.x, t.y, e.x, e.y);
  // ねらい: 見えていれば相手へ（少しぶれる）
  const want = Math.atan2(e.y - t.y, e.x - t.x) + (see ? (randInt(rng, 100) - 50) / 600 : 0);
  inp.aim = want;
  const aimed = Math.abs(Math.atan2(Math.sin(want - t.t), Math.cos(want - t.t))) < 0.15;
  if (see && aimed && t.cool <= 0 && randInt(rng, 100) < 35) inp.fire += 1;
  // よける: こちらに向かってくる弾があれば横へ
  let dodge = null;
  for (const b of s.bullets) {
    const dx = t.x - b.x, dy = t.y - b.y, dist = Math.hypot(dx, dy);
    const v = Math.hypot(b.vx, b.vy);
    if (dist > 2.6 || (b.vx * dx + b.vy * dy) / (v * dist) < 0.85) continue;
    dodge = [-b.vy / v, b.vx / v];
    if (hitsWall(s.map, t.x + dodge[0] * 0.5, t.y + dodge[1] * 0.5, TANK_R)) dodge = [-dodge[0], -dodge[1]];
    break;
  }
  if (dodge) { inp.mx = dodge[0]; inp.my = dodge[1]; return; }
  // 移動: 見えていて近すぎなければ少し近づく、見えなければ道を探して近づく
  const dist = Math.hypot(e.x - t.x, e.y - t.y);
  if (see && dist < 4) { inp.mx = inp.my = 0; if (dist < 2.2 && randInt(rng, 100) < 3) inp.mine += 1; return; }
  if (--t.bot.repath <= 0) { t.bot.goal = nextStep(s.map, t.x, t.y, e.x, e.y); t.bot.repath = 6; }
  const g = t.bot.goal;
  if (!g) { inp.mx = inp.my = 0; return; }
  const gx = g[0] + 0.5 - t.x, gy = g[1] + 0.5 - t.y, gl = Math.hypot(gx, gy) || 1;
  inp.mx = gx / gl; inp.my = gy / gl;
  if (gl < 0.15) t.bot.repath = 0;
}

// マス目の上の道さがし。最初の一歩のマスを返す
function nextStep(map, x, y, tx, ty) {
  const sc = Math.floor(x), sr = Math.floor(y), gc = Math.floor(tx), gr = Math.floor(ty);
  const prev = new Map([[sr * W + sc, -1]]);
  const q = [[sc, sr]];
  while (q.length) {
    const [c, r] = q.shift();
    if (c === gc && r === gr) {
      let k = r * W + c, before = k;
      while (prev.get(k) !== -1) { before = k; k = prev.get(k); }
      return [before % W, Math.floor(before / W)];
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= W || nr >= H || MAPS[map][nr][nc] === '#' || prev.has(nr * W + nc)) continue;
      prev.set(nr * W + nc, r * W + c);
      q.push([nc, nr]);
    }
  }
  return null;
}

export function tick(s, rng, ctx) {
  if (s.result) return { ...s, tickAfter: null };
  const ns = { ...s, tanks: s.tanks.map((t) => ({ ...t })), bullets: s.bullets.map((b) => ({ ...b })), mines: s.mines.map((m) => ({ ...m })), blasts: s.blasts.map((b) => ({ ...b, age: b.age + DT })).filter((b) => b.age < 0.8), wins: s.wins.slice(), history: s.history.slice(), inputs: s.inputs };
  ns.time = s.time + DT;
  ns.tickAfter = TICK_MS;
  if (s.phase === 'count') {
    if (ns.time >= s.phaseEnd) { ns.phase = 'play'; ns.time = 0; }
    return ns;
  }
  if (s.phase === 'roundEnd') {
    if (ns.time >= s.phaseEnd) {
      const champ = ns.wins.findIndex((w) => w >= ns.options.wins);
      if (champ >= 0) { ns.result = { winner: champ, reason: `${ns.wins[champ]}勝で優勝` }; ns.tickAfter = null; ns.phase = 'end'; return ns; }
      return startRound(ns, rng);
    }
    return ns;
  }
  // CPU の考え
  if (ctx && ctx.bots) ns.tanks.forEach((t, p) => { if (ctx.bots[p] && !ns.out[p]) botThink(ns, p, rng); });
  // 戦車
  ns.tanks.forEach((t, p) => {
    if (!t.alive) return;
    const inp = ns.inputs[p];
    t.cool = Math.max(0, t.cool - DT);
    let mx = inp.mx, my = inp.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.1) {
      t.a = Math.atan2(my, mx);
      const nx = t.x + mx * SPEED * DT, ny = t.y + my * SPEED * DT;
      const blocked = (x, y) => hitsWall(ns.map, x, y, TANK_R) || ns.tanks.some((o, q) => q !== p && o.alive && Math.hypot(o.x - x, o.y - y) < TANK_R * 2);
      if (!blocked(nx, t.y)) t.x = nx;
      if (!blocked(t.x, ny)) t.y = ny;
    }
    if (inp.aim != null) {
      // 砲台はすばやく回る
      const d = Math.atan2(Math.sin(inp.aim - t.t), Math.cos(inp.aim - t.t));
      t.t += clamp(d, -10 * DT, 10 * DT);
    }
    if (inp.fire > t.fireSeq) { t.fireSeq = inp.fire; fire(ns, p); }
    if (inp.mine > t.mineSeq) { t.mineSeq = inp.mine; layMine(ns, p); }
  });
  // 弾
  const sub = 3;
  for (let k = 0; k < sub; k++) {
    for (const b of ns.bullets) {
      if (b.dead) continue;
      const nx = b.x + b.vx * DT / sub, ny = b.y + b.vy * DT / sub;
      if (wallAt(ns.map, nx, ny)) {
        if (b.bounces <= 0) { b.dead = true; continue; }
        b.bounces--;
        const hx = wallAt(ns.map, nx, b.y), hy = wallAt(ns.map, b.x, ny);
        if (hx || !hy) b.vx = -b.vx;
        if (hy || !hx) b.vy = -b.vy;
        ns.bounces = (ns.bounces || 0) + 1;
        continue;
      }
      b.x = nx; b.y = ny;
      b.age += DT / sub;
      for (const [p, t] of ns.tanks.entries()) {
        if (!t.alive || (p === b.by && b.age < 0.25)) continue;
        if (Math.hypot(t.x - b.x, t.y - b.y) < TANK_R + BULLET_R) { b.dead = true; kill(ns, p, b.by, '弾'); break; }
      }
      if (b.dead) continue;
      for (const m of ns.mines) if (Math.hypot(m.x - b.x, m.y - b.y) < MINE_R + BULLET_R) { b.dead = true; explode(ns, m); break; }
    }
    // 弾どうし
    for (let i = 0; i < ns.bullets.length; i++) for (let j = i + 1; j < ns.bullets.length; j++) {
      const a = ns.bullets[i], b = ns.bullets[j];
      if (!a.dead && !b.dead && Math.hypot(a.x - b.x, a.y - b.y) < BULLET_R * 2.5) { a.dead = b.dead = true; ns.blasts.push({ id: ++ns.seq, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, age: 0.4, small: true }); }
    }
    ns.bullets = ns.bullets.filter((b) => !b.dead);
  }
  // 地雷
  for (const m of ns.mines.slice()) {
    m.age += DT;
    const near = m.age >= MINE_ARM && ns.tanks.some((t, p) => t.alive && Math.hypot(t.x - m.x, t.y - m.y) < 0.8 && (p !== m.by || m.age > 2.5));
    if (near || m.age >= MINE_FUSE) explode(ns, m);
  }
  // ラウンドの終わり
  const alive = ns.tanks.map((t, p) => (t.alive ? p : -1)).filter((p) => p >= 0);
  if (alive.length <= 1) {
    ns.phase = 'roundEnd';
    ns.time = 0;
    ns.phaseEnd = END_S;
    ns.roundWinner = alive.length ? alive[0] : null;
    if (alive.length) ns.wins[alive[0]]++;
    ns.history.push(alive.length ? `${label(alive[0])} がラウンドの勝ち！` : '相打ち！');
  }
  return ns;
}

