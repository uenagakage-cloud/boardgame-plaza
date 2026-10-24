// レースの CPU。目の前の障害物を見てジャンプ/しゃがみを決める（たまにミスする）
import { RACE, PTERA_Y } from './race-sim.js';

export function createRaceBrain(skill = 0.7) {
  return { skill, planFor: null, jumpAt: 0, mistake: false, itemDelay: 0 };
}

export function raceBotInput(sim, brain) {
  const input = { jump: false, duck: false, item: false };
  const front = RACE.DINO_X + RACE.DINO_W;
  const obstacles = [...sim.course, ...sim.extras]
    .filter((o) => !o.hit && o.x + o.w * o.size > RACE.DINO_X)
    .sort((a, b) => a.x - b.x);
  const target = obstacles[0];

  if (sim.heldItem) {
    brain.itemDelay += RACE.DT;
    if (brain.itemDelay > 1 + Math.random() * 2) {
      input.item = true;
      brain.itemDelay = 0;
    }
  }
  if (!target) return input;

  if (brain.planFor !== target.id) {
    brain.planFor = target.id;
    const speedRatio = (sim.speed - RACE.SPEED_START) / (RACE.SPEED_MAX - RACE.SPEED_START);
    const missChance = 0.01 + 0.05 * speedRatio * (1.2 - brain.skill);
    brain.mistake = Math.random() < missChance;
    // ジャンプの頂点が障害物の中央に来るように踏み切る（秒）。スキルが低いほどタイミングがぶれる
    const airTime = (-2 * RACE.JUMP_V) / RACE.GRAVITY;
    const toCenter = (target.w * target.size) / 2 + RACE.DINO_W / 2;
    const err = (1 - brain.skill) * 0.1;
    brain.jumpAt = airTime / 2 - toCenter / sim.speed + (Math.random() * 2 - 1) * err + (brain.mistake ? 0.25 : 0);
  }

  const dist = target.x - front;
  const timeTo = dist / (sim.speed + (target.speedOffset || 0));
  if (target.type === 'ptera') {
    if (target.y === PTERA_Y.high) return input;
    if (target.y === PTERA_Y.mid) {
      input.duck = !brain.mistake && timeTo < 0.35;
      return input;
    }
  }
  if (timeTo < brain.jumpAt && sim.dino.onGround) input.jump = true;
  else if (!sim.dino.onGround) input.jump = true; // 大ジャンプを維持
  return input;
}
