// レースモードのシミュレーション（クライアント・サーバー（CPU）共通）
// 同じ seed なら全員同じコースになる。おじゃまで送られた障害物は別リスト(extras)で管理し、
// コース生成の乱数を消費しないので、おじゃまを受けてもコースはずれない。
import { mulberry32 } from './rng.js';

export const RACE = {
  W: 600,
  H: 200,
  GROUND: 178, // 地面の y（恐竜の足元）
  DT: 1 / 60,
  DINO_X: 40,
  DINO_W: 44,
  DINO_H: 44,
  DUCK_W: 60,
  DUCK_H: 26,
  GRAVITY: 2160,
  JUMP_V: -600,
  DROP_V: -300, // ジャンプボタンを離したときの上昇速度上限（小ジャンプ）
  MIN_JUMP: 30,
  FAST_FALL: 3, // 空中でしゃがむと落下加速
  SPEED_START: 360,
  SPEED_MAX: 780,
  ACCEL: 3.6,
  SCORE_COEF: 0.025,
  CLEAR_TIME: 2, // 開始直後は障害物なし
  INVINCIBLE: 1.5,
  SHIELD_TIME: 10,
  NIGHT_TIME: 5,
  ITEM_CHANCE: 0.3,
  ITEM_SIZE: 24,
  ITEM_Y: 178 - 76 - 24, // ジャンプしないと取れない高さ
};

// 当たり判定ボックスは [x, y, w, h]（障害物 1 個分の左上基準）
export const OBSTACLES = {
  cactusS: { w: 16, h: 34, minGap: 120, maxSize: 3, multiSpeed: 0, minSpeed: 0 },
  cactusL: { w: 24, h: 50, minGap: 120, maxSize: 3, multiSpeed: 420, minSpeed: 0 },
  ptera: { w: 46, h: 28, minGap: 150, maxSize: 1, multiSpeed: Infinity, minSpeed: 510 },
};

export const PTERA_Y = {
  low: RACE.GROUND - 4 - 28, // ジャンプでよける
  mid: RACE.GROUND - 30 - 28, // しゃがむ（or ジャンプ）でよける
  high: RACE.GROUND - 62 - 28, // 走っていれば当たらない（ジャンプすると当たる）
};

const DINO_BOXES = [
  [22, 0, 20, 12],
  [4, 14, 26, 16],
  [10, 30, 14, 14],
];
const DUCK_BOXES = [[2, 4, 52, 20]];

export const ITEM_TYPES = ['cactus', 'ptera', 'night', 'shield'];
export const ITEM_LABELS = {
  cactus: 'サボテン送り',
  ptera: 'プテラ送り',
  night: 'まっくら',
  shield: 'バリア',
};

function obstacleBoxes(o) {
  const out = [];
  if (o.type === 'ptera') {
    out.push([o.x + 4, o.y + 8, 38, 12]);
    return out;
  }
  for (let i = 0; i < o.size; i++) {
    const bx = o.x + i * o.w;
    out.push([bx + o.w * 0.3, o.y + 2, o.w * 0.4, o.h - 2]); // 幹
    out.push([bx + 1, o.y + o.h * 0.25, o.w - 2, o.h * 0.45]); // 腕
  }
  return out;
}

function overlap(a, b) {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
}

let nextObstacleId = 1;

export class RaceSim {
  constructor({ seed = 1, items = false, lives = 1 } = {}) {
    this.rng = mulberry32(seed);
    this.itemRng = mulberry32(seed ^ 0x9e3779b9);
    this.itemsEnabled = items;
    this.time = 0;
    this.speed = RACE.SPEED_START;
    this.distance = 0;
    this.alive = true;
    this.lives = lives;
    this.maxLives = lives;
    this.invuln = 0;
    this.shield = 0;
    this.night = 0;
    this.heldItem = null;
    this.course = [];
    this.extras = [];
    this.items = [];
    this.pendingAttacks = [];
    this.history = []; // 直近の障害物タイプ（同じものが続きすぎないように）
    this.dino = { y: 0, vy: 0, onGround: true, ducking: false };
    this.prevJump = false;
    this.events = [];
    this.lastMilestone = 0;
  }

  get score() {
    return Math.floor(this.distance * RACE.SCORE_COEF);
  }

  // 恐竜の当たり判定（ワールド座標）
  dinoBoxes() {
    const d = this.dino;
    const ducking = d.ducking && d.onGround;
    const h = ducking ? RACE.DUCK_H : RACE.DINO_H;
    const top = RACE.GROUND + d.y - h;
    const boxes = ducking ? DUCK_BOXES : DINO_BOXES;
    return boxes.map((b) => [RACE.DINO_X + b[0], top + b[1], b[2], b[3]]);
  }

  step(input = {}) {
    if (!this.alive) return;
    const dt = RACE.DT;
    this.time += dt;
    if (this.speed < RACE.SPEED_MAX) this.speed = Math.min(RACE.SPEED_MAX, this.speed + RACE.ACCEL * dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.shield > 0) this.shield -= dt;
    if (this.night > 0) this.night -= dt;

    this.updateDino(input, dt);
    this.updateObstacles(dt);
    this.checkCollisions();

    this.distance += this.speed * dt;
    const m = Math.floor(this.score / 100);
    if (m > this.lastMilestone) {
      this.lastMilestone = m;
      this.events.push({ type: 'milestone', score: m * 100 });
    }
  }

  updateDino(input, dt) {
    const d = this.dino;
    const jump = !!input.jump;
    const duck = !!input.duck;
    if (d.onGround) {
      d.ducking = duck;
      if (jump && !duck) {
        d.vy = RACE.JUMP_V;
        d.onGround = false;
        d.ducking = false;
        this.events.push({ type: 'jump' });
      }
    }
    if (!d.onGround) {
      if (!jump && -d.y > RACE.MIN_JUMP && d.vy < RACE.DROP_V) d.vy = RACE.DROP_V;
      d.vy += RACE.GRAVITY * (duck ? RACE.FAST_FALL : 1) * dt;
      d.y += d.vy * dt;
      if (d.y >= 0) {
        d.y = 0;
        d.vy = 0;
        d.onGround = true;
        d.ducking = duck;
      }
    }
    this.prevJump = jump;
  }

  updateObstacles(dt) {
    const move = (o) => {
      o.x -= (this.speed + (o.speedOffset || 0)) * dt;
    };
    this.course.forEach(move);
    this.extras.forEach(move);
    this.items.forEach(move);
    const onScreen = (o) => o.x + o.w * (o.size || 1) > -20 && !o.gone;
    this.course = this.course.filter(onScreen);
    this.extras = this.extras.filter(onScreen);
    this.items = this.items.filter(onScreen);

    if (this.time > RACE.CLEAR_TIME) {
      const last = this.course[this.course.length - 1];
      if (!last || last.x + last.w * last.size + last.gap < RACE.W) this.spawnCourse();
    }

    // おじゃまで送られた障害物は、出現位置付近が空いているときに出す
    if (this.pendingAttacks.length) {
      const blocked = [...this.course, ...this.extras].some((o) => o.x > RACE.W - 200 && o.x < RACE.W + 60);
      if (!blocked) this.spawnExtra(this.pendingAttacks.shift());
    }
  }

  spawnCourse() {
    const types = Object.keys(OBSTACLES).filter((t) => this.speed >= OBSTACLES[t].minSpeed);
    let type = types[Math.floor(this.rng() * types.length)];
    // 同じ種類が 3 回続かないようにする
    for (let i = 0; i < 4 && this.history.length >= 2 && this.history.every((h) => h === type); i++) {
      type = types[Math.floor(this.rng() * types.length)];
    }
    this.history.push(type);
    if (this.history.length > 2) this.history.shift();

    const def = OBSTACLES[type];
    const size = this.speed >= def.multiSpeed && def.maxSize > 1 ? 1 + Math.floor(this.rng() * def.maxSize) : 1;
    const o = this.makeObstacle(type, size);
    if (type === 'ptera') {
      const r = this.rng();
      o.y = r < 0.4 ? PTERA_Y.low : r < 0.8 ? PTERA_Y.mid : PTERA_Y.high;
      o.speedOffset = this.rng() > 0.5 ? 48 : -48;
    }
    const sf = this.speed / 60; // 元ゲームの px/frame 単位に合わせる
    const minGap = Math.round(o.w * size * sf + def.minGap * 0.6);
    const maxGap = Math.round(minGap * 1.5);
    o.gap = minGap + this.rng() * (maxGap - minGap);
    this.course.push(o);

    if (this.itemsEnabled && this.itemRng() < RACE.ITEM_CHANCE && o.gap > 160) {
      this.items.push({
        id: nextObstacleId++,
        x: o.x + o.w * size + o.gap / 2 - RACE.ITEM_SIZE / 2,
        y: RACE.ITEM_Y,
        w: RACE.ITEM_SIZE,
        h: RACE.ITEM_SIZE,
        size: 1,
      });
    }
  }

  makeObstacle(type, size) {
    const def = OBSTACLES[type];
    return {
      id: nextObstacleId++,
      type,
      x: RACE.W + 10,
      y: RACE.GROUND - def.h,
      w: def.w,
      h: def.h,
      size,
      gap: 0,
      speedOffset: 0,
    };
  }

  spawnExtra(type) {
    let o;
    if (type === 'ptera') {
      o = this.makeObstacle('ptera', 1);
      o.y = PTERA_Y.mid;
    } else if (type === 'cactusL') {
      o = this.makeObstacle('cactusL', 2);
    } else {
      o = this.makeObstacle('cactusS', 3);
    }
    o.extra = true;
    this.extras.push(o);
    this.events.push({ type: 'incoming', obstacle: type });
  }

  checkCollisions() {
    const boxes = this.dinoBoxes();
    const hits = (o) => obstacleBoxes(o).some((ob) => boxes.some((db) => overlap(db, ob)));
    for (const o of [...this.course, ...this.extras]) {
      if (o.hit || !hits(o)) continue;
      o.hit = true;
      if (this.invuln > 0) continue;
      if (this.shield > 0) {
        this.shield = 0;
        this.invuln = 0.5;
        this.events.push({ type: 'shieldBreak' });
        continue;
      }
      this.lives--;
      if (this.lives <= 0) {
        this.alive = false;
        this.events.push({ type: 'dead', score: this.score });
        return;
      }
      this.invuln = RACE.INVINCIBLE;
      this.events.push({ type: 'hit', lives: this.lives });
    }
    for (const it of this.items) {
      if (it.gone) continue;
      if (!boxes.some((db) => overlap(db, [it.x, it.y, it.w, it.h]))) continue;
      it.gone = true;
      if (!this.heldItem) {
        this.heldItem = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
        this.events.push({ type: 'pickup', item: this.heldItem });
      }
    }
  }

  // アイテム使用。相手に送るべき攻撃タイプを返す（バリアは自分に効果）
  useItem() {
    const item = this.heldItem;
    if (!item || !this.alive) return null;
    this.heldItem = null;
    if (item === 'shield') {
      this.shield = RACE.SHIELD_TIME;
      this.events.push({ type: 'shield' });
    }
    return item;
  }

  // 相手からのおじゃまを受ける
  receiveAttack(item) {
    if (!this.alive) return;
    if (item === 'cactus') this.pendingAttacks.push('cactusS', 'cactusL');
    else if (item === 'ptera') this.pendingAttacks.push('ptera');
    else if (item === 'night') this.night = RACE.NIGHT_TIME;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
