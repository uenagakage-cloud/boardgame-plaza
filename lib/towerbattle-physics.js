// どうぶつタワーバトルの物理（サーバーだけで動かす）
// 今ある動物と新しく落とす動物を matter-js で動かし、止まるまでの様子をコマにして返す。
import Matter from 'matter-js';
import { SHAPES, ISLAND, FALL_Y, FRAME_MS } from '../public/games/towerbattle.js';

const { Engine, Bodies, Body, Composite } = Matter;
const STEP_MS = 1000 / 60;
const MAX_STEPS = 60 * 9;      // 長くても9秒分で打ち切る
const REST_STEPS = 40;         // これだけ続けて止まっていたら終わり
const REMOVE_Y = FALL_Y + 400; // ここまで落ちたら計算から外す
// 滑りにくさ・転がりにくさ（TUNING は確かめるときに差しかえられる）
// 2026-10 に「転がり過ぎる」との声で、摩擦を最大・はね返りなし・回転を弱める・止まった動物は眠らせる（じわじわ滑らない）に変更
export const TUNING = {
  material: { friction: 1, frictionStatic: 3, restitution: 0, density: 0.0012 },
  island: { friction: 1, frictionStatic: 3 },
  angularDamping: 0.8, // 1歩ごとに回転の速さにかける数（1 なら弱めない）。小さいほど転がりにくい
  sleeping: true,
};

function makeBody(t, x, y, angle, MATERIAL) {
  const parts = SHAPES[t].parts.map((p) => {
    if (p.type === 'rect') return Bodies.rectangle(x + p.x, y + p.y, p.w, p.h, MATERIAL);
    if (p.type === 'circle') return Bodies.circle(x + p.x, y + p.y, p.r, MATERIAL);
    // fromVertices は多角形の重心を (x, y) に置くので、重心の位置を渡す
    const [cx, cy] = polyCentroid(p.pts);
    return Bodies.fromVertices(x + cx, y + cy, [p.pts.map(([px, py]) => ({ x: px, y: py }))], MATERIAL);
  });
  const body = parts.length === 1 ? parts[0] : Body.create({ parts, ...MATERIAL });
  // 重心が (x, y) になるよう合わせてから回す
  Body.setPosition(body, { x, y });
  Body.setAngle(body, angle);
  return body;
}

function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const cr = x1 * y2 - x2 * y1;
    a += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

// pieces: [{ t, x, y, a, vx, vy, va }]、drop: { t, x, y, a }
export function simulate(pieces, drop, tuning = TUNING) {
  const MATERIAL = tuning.material;
  const engine = Engine.create({ positionIterations: 12, velocityIterations: 10, enableSleeping: !!tuning.sleeping });
  engine.gravity.y = 1;
  const island = Bodies.rectangle(0, ISLAND.h / 2, ISLAND.w, ISLAND.h, { isStatic: true, ...tuning.island });
  const all = [...pieces, { ...drop, vx: 0, vy: 0, va: 0 }];
  const bodies = all.map((p) => {
    const b = makeBody(p.t, p.x, p.y, p.a, MATERIAL);
    Body.setVelocity(b, { x: p.vx || 0, y: p.vy || 0 });
    Body.setAngularVelocity(b, p.va || 0);
    return b;
  });
  Composite.add(engine.world, [island, ...bodies]);
  const alive = bodies.map(() => true);
  const frames = [];
  const framesEvery = Math.round(FRAME_MS / STEP_MS);
  let still = 0, step = 0;
  for (; step < MAX_STEPS; step++) {
    Engine.update(engine, STEP_MS);
    if (tuning.angularDamping !== 1) for (const b of bodies) Body.setAngularVelocity(b, b.angularVelocity * tuning.angularDamping);
    let moving = false;
    bodies.forEach((b, i) => {
      if (!alive[i]) return;
      if (b.position.y > REMOVE_Y) { alive[i] = false; Composite.remove(engine.world, b); return; }
      if (b.position.y > FALL_Y) { moving = true; return; } // 落ちている途中
      if (b.speed > 0.08 || Math.abs(b.angularVelocity) > 0.003) moving = true;
    });
    if (step % framesEvery === 0) {
      frames.push(bodies.map((b) => [Math.round(b.position.x), Math.round(b.position.y), Math.round(b.angle * 1000) / 1000]));
    }
    still = moving ? 0 : still + 1;
    if (still >= REST_STEPS && step > 30) break;
  }
  frames.push(bodies.map((b) => [Math.round(b.position.x), Math.round(b.position.y), Math.round(b.angle * 1000) / 1000]));
  const fallen = bodies.filter((b) => b.position.y > FALL_Y).length;
  const left = [];
  let top = 0;
  bodies.forEach((b, i) => {
    if (b.position.y > FALL_Y) return;
    left.push({ t: all[i].t, x: b.position.x, y: b.position.y, a: b.angle, vx: b.velocity.x, vy: b.velocity.y, va: b.angularVelocity });
    top = Math.min(top, b.bounds.min.y);
  });
  return { pieces: left, frames, fallen, top, steps: step };
}
