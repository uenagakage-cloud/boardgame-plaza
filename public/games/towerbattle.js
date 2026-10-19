// どうぶつタワーバトル（サーバーとブラウザで共通）
// 2〜8人。順番に動物を島の上に積んでいき、動物を島から落とした人は脱落。最後の1人が勝ち。
// 落とすときは左右の位置と向き（15度ずつ）を決める。持ち時間を過ぎると今の位置でそのまま落とす。
// 物理の計算はサーバーだけが行い（ctx.physics）、落ちていく様子はコマ（frames）にして全員に送る。
// 座標: 島の上の面が y=0、左右の中心が x=0。下向きが +y。
// 手: { aim: { x, angle } } ねらいを動かす（ほかの人にも見える） / { drop: { x, angle } } 落とす / { resign: true }
export const id = 'towerbattle';
export const title = 'どうぶつタワーバトル';
export const sideNames = Array.from({ length: 8 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 2;
export const maxPlayers = 8;
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const ISLAND = { w: 360, h: 40 };   // 島（上の面が y=0）
export const AIM_RANGE = 300;               // 左右に動かせる範囲
export const DROP_GAP = 170;                // 塔の一番上からどれだけ上で落とすか
export const FALL_Y = 160;                  // ここより下に行った動物は「落ちた」
export const TURN_MS = 30000;
export const FRAME_MS = 1000 / 30;          // 落ちる様子のコマの間隔

// 動物の形（パーツの組み合わせ。座標は動物の中心からのずれ）
// rect: [x, y, w, h] / circle: [x, y, r] / poly: 凸多角形の頂点
const R = (x, y, w, h) => ({ type: 'rect', x, y, w, h });
const C = (x, y, r) => ({ type: 'circle', x, y, r });
const P = (...pts) => ({ type: 'poly', pts });
export const ANIMALS = {
  elephant: { name: 'ぞう', color: '#9aa7b4', eye: [62, -22], parts: [R(0, 0, 110, 60), C(58, -12, 28), R(-34, 42, 22, 26), R(34, 42, 22, 26), R(82, 18, 12, 34)] },
  giraffe: { name: 'きりん', color: '#f0c05a', eye: [44, -96], parts: [R(0, 0, 76, 38), R(26, -50, 16, 66), R(38, -92, 38, 20), R(-26, 36, 12, 36), R(26, 36, 12, 36)] },
  penguin: { name: 'ぺんぎん', color: '#39424e', eye: [10, -24], parts: [P([-18, -42], [18, -42], [32, -18], [32, 22], [18, 40], [-18, 40], [-32, 22], [-32, -18])] },
  cat: { name: 'ねこ', color: '#f2a65a', eye: [44, -26], parts: [R(0, 0, 84, 36), C(42, -20, 22), R(-50, -22, 10, 40), R(-28, 28, 12, 20), R(28, 28, 12, 20)] },
  rabbit: { name: 'うさぎ', color: '#f4eee6', eye: [8, -12], parts: [C(0, 0, 32), R(-12, -46, 12, 40), R(12, -46, 12, 40)] },
  crocodile: { name: 'わに', color: '#5f9e5a', eye: [56, -14], parts: [R(-10, 0, 140, 26), R(78, 2, 44, 18), R(-40, 20, 14, 14), R(30, 20, 14, 14)] },
  turtle: { name: 'かめ', color: '#6fae6a', eye: [62, -6], parts: [P([-50, 6], [-34, -24], [0, -34], [34, -24], [50, 6]), R(0, 14, 104, 16), C(60, 2, 13)] },
  panda: { name: 'ぱんだ', color: '#f7f7f2', eye: [8, -58], parts: [C(0, 0, 40), C(0, -52, 26)] },
  pig: { name: 'ぶた', color: '#f5b3c0', eye: [32, -14], parts: [P([-36, -28], [36, -28], [48, -12], [48, 14], [36, 28], [-36, 28], [-48, 14], [-48, -12]), R(54, 4, 14, 16)] },
  whale: { name: 'くじら', color: '#4d7fc4', eye: [52, -4], parts: [P([-80, -10], [-40, -32], [40, -32], [80, -10], [80, 14], [40, 30], [-40, 30], [-80, 14]), P([-80, -4], [-110, -30], [-104, 10])] },
  mouse: { name: 'ねずみ', color: '#b9b2ab', eye: [16, -8], parts: [C(0, 0, 18), C(-6, -18, 8), C(10, -18, 8), R(-26, 8, 22, 5)] },
  camel: { name: 'らくだ', color: '#d9a066', eye: [62, -66], parts: [R(0, 0, 90, 34), C(-20, -24, 18), C(18, -24, 18), R(46, -30, 14, 52), R(60, -60, 30, 16), R(-34, 32, 12, 32), R(34, 32, 12, 32)] },
  octopus: { name: 'たこ', color: '#e2665c', eye: [10, -14], parts: [C(0, -10, 30), R(-22, 26, 8, 30), R(-8, 28, 8, 34), R(8, 28, 8, 34), R(22, 26, 8, 30)] },
  dog: { name: 'いぬ', color: '#c98b4f', eye: [50, -30], parts: [R(0, 0, 80, 34), R(44, -26, 34, 30), R(-48, -16, 10, 24), R(-26, 28, 12, 22), R(26, 28, 12, 22)] },
};
export const ANIMAL_KEYS = Object.keys(ANIMALS);

// パーツの面積と重心（matter-js の重心とほぼ同じになるよう、同じ密度として計算）
function partArea(p) {
  if (p.type === 'rect') return { a: p.w * p.h, x: p.x, y: p.y };
  if (p.type === 'circle') return { a: Math.PI * p.r * p.r, x: p.x, y: p.y };
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.pts.length; i++) {
    const [x1, y1] = p.pts[i], [x2, y2] = p.pts[(i + 1) % p.pts.length];
    const cr = x1 * y2 - x2 * y1;
    a += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  a /= 2;
  return { a: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) };
}
// 重心を原点にしたパーツ（描くときも物理でもこれを使う）
export const SHAPES = Object.fromEntries(ANIMAL_KEYS.map((k) => {
  const def = ANIMALS[k];
  const ws = def.parts.map(partArea);
  const total = ws.reduce((s, w) => s + w.a, 0);
  const ox = ws.reduce((s, w) => s + w.a * w.x, 0) / total, oy = ws.reduce((s, w) => s + w.a * w.y, 0) / total;
  const parts = def.parts.map((p) => (p.type === 'poly' ? { ...p, pts: p.pts.map(([x, y]) => [x - ox, y - oy]) } : { ...p, x: p.x - ox, y: p.y - oy }));
  return [k, { ...def, parts, eye: [def.eye[0] - ox, def.eye[1] - oy] }];
}));

const label = (seat) => `P${seat + 1}`;
const active = (s) => [...Array(s.players).keys()].filter((p) => !s.out[p]);
const pickAnimal = (rng) => ANIMAL_KEYS[(rng ? rng(ANIMAL_KEYS.length) : Math.floor(Math.random() * ANIMAL_KEYS.length) + 1) - 1];

export function normalizeOptions(o) {
  const seconds = [15, 30, 60].includes(Number(o && o.seconds)) ? Number(o.seconds) : 30;
  return { seconds };
}
export const variantName = (o) => `持ち時間${normalizeOptions(o).seconds}秒`;

export function init(options, players = 2, rng) {
  const s = {
    players, options: normalizeOptions(options), out: Array(players).fill(false),
    pieces: [], top: 0, turn: 0, phase: 'aim', current: pickAnimal(rng), next: pickAnimal(rng),
    aim: { x: 0, angle: 0 }, drop: null, dropCount: 0, endsAt: null, tickAt: null, result: null, history: [],
  };
  startTurn(s, 0);
  return s;
}

function startTurn(s, seat) {
  s.turn = seat;
  s.phase = 'aim';
  s.aim = { x: 0, angle: 0 };
  s.endsAt = Date.now() + s.options.seconds * 1000;
  s.tickAt = s.endsAt;
}

const nextSeat = (s, from) => {
  let p = from;
  do p = (p + 1) % s.players; while (s.out[p]);
  return p;
};

function finish(s) {
  const live = active(s);
  s.phase = 'end';
  s.tickAt = null;
  s.endsAt = null;
  s.result = live.length === 1 ? { winner: live[0], reason: '最後まで残った' } : { winner: null, reason: '全員脱落' };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cleanAim = (a) => ({
  x: clamp(Math.round(Number(a && a.x) || 0), -AIM_RANGE, AIM_RANGE),
  angle: ((Math.round((Number(a && a.angle) || 0) / 15) * 15) % 360 + 360) % 360,
});

// 落とす。物理の計算は ctx.physics（サーバーだけが持っている）
function doDrop(s, aim, rng, ctx) {
  if (!ctx || !ctx.physics) throw new Error('物理の計算ができません');
  const seat = s.turn;
  const spawnY = s.top - DROP_GAP;
  const sim = ctx.physics(s.pieces, { t: s.current, x: aim.x, y: spawnY, a: (aim.angle * Math.PI) / 180 });
  s.dropCount += 1;
  s.history.push(`${label(seat)} が${ANIMALS[s.current].name}を置いた`);
  s.drop = { by: seat, bodies: [...s.pieces.map((p) => p.t), s.current], frames: sim.frames, startAt: Date.now() + 150, n: s.dropCount };
  s.pieces = sim.pieces;
  s.top = sim.top;
  s.phase = 'falling';
  s.endsAt = null;
  s.tickAt = s.drop.startAt + sim.frames.length * FRAME_MS + 700;
  s.fellBy = null;
  if (sim.fallen > 0) {
    s.out[seat] = true;
    s.fellBy = seat;
    s.history.push(`${sim.fallen}匹落ちた！ ${label(seat)} は脱落`);
  }
  s.current = s.next;
  s.next = pickAnimal(rng);
}

export function tick(s, rng, ctx) {
  const ns = clone(s);
  if (s.phase === 'aim') { doDrop(ns, s.aim, rng, ctx); return ns; } // 時間切れ: 今のねらいで落とす
  if (s.phase === 'falling') {
    ns.drop = null;
    if (active(ns).length < 2) finish(ns);
    else startTurn(ns, nextSeat(ns, s.drop ? s.drop.by : s.turn));
    return ns;
  }
  return { ...s, tickAt: null };
}

export const canActOutOfTurn = () => true;

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'falling') return 'ゆれています…';
  if (you === s.turn) return '左右に動かして、回して、落とそう！';
  return null;
}

export const scoreOf = (s, seat) => (s.out[seat] ? '脱落' : seat === s.turn && s.phase === 'aim' ? 'ねらい中' : '');

const clone = (s) => ({ ...s, out: s.out.slice(), pieces: s.pieces.slice(), history: s.history.slice() });

export function applyMove(s, mv, seat, rng, ctx) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (s.out[seat] && !mv.resign) throw new Error('脱落しています');
  const ns = clone(s);
  if (mv.resign) {
    if (s.out[seat]) return s;
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (active(ns).length < 2) { finish(ns); return ns; }
    if (s.phase === 'aim' && s.turn === seat) startTurn(ns, nextSeat(ns, seat));
    return ns;
  }
  if (seat !== s.turn) throw new Error('あなたの番ではありません');
  if (s.phase !== 'aim') throw new Error('いまは置けません');
  if (mv.aim) { ns.aim = cleanAim(mv.aim); return ns; }
  if (mv.drop) { doDrop(ns, cleanAim(mv.drop), rng, ctx); return ns; }
  throw new Error('不明な操作です');
}
