// バトルの進行
// 人間の恐竜：各端末が自分で動かし、位置を送ってくる（入力遅延ゼロ）。サーバーは中継するだけ。
// 攻撃（ふみつけ・かみつき）：攻撃した側の端末が判定して送ってくる → サーバーが距離・無敵時間をチェックしてダメージ確定。
// HP・脱落・勝敗・CPU の動き・アイテム（ボックスの出現 / 取得 / 効果）はサーバーが管理する。
// チーム戦：味方には攻撃が当たらず、ぶつかってもすり抜ける。相手チームが全滅したら勝ち。
import {
  BATTLE,
  STAGE,
  STATE,
  createFighter,
  stepFighter,
  fighterState,
  stompCheck,
  stompEffect,
  biteCheck,
  biteKnockback,
  bodyBump,
  applyKnockback,
  knockback,
  wrapDx,
  wrapX,
  BATTLE_ITEMS,
  bodyRect,
  rectsOverlap,
  boxRect,
  hazardRect,
  groundBelow,
} from '../shared/battle-sim.js';
import { createBattleBrain, battleBotInput } from '../shared/battle-bot.js';
import { COUNTDOWN_MS, BATTLE_SNAPSHOT_HZ } from '../shared/config.js';
import { startLoop } from './loop.js';

const PAIR_COOLDOWN = 0.3;
const num = (v, min, max, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export class BattleGame {
  constructor(room, players, settings, { autoStart = true } = {}) {
    this.room = room;
    this.settings = settings;
    this.time = 0;
    this.steps = 0;
    this.sudden = false;
    this.over = false;
    this.ended = false;
    this.events = [];
    this.itemsOn = settings.items !== false;
    this.boxes = [];
    this.hazards = [];
    this.nextBoxAt = BATTLE_ITEMS.FIRST;
    this.seq = 0;
    this.fighters = new Map();
    this.teams = players.some((p) => p.team === 0 || p.team === 1);
    this.winnerTeam = null;
    const teamCount = [0, 0];
    players.forEach((p, i) => {
      // チーム戦は赤チームを左側、青チームを右側の出現位置に
      let si = i;
      if (this.teams) si = (teamCount[p.team]++ * 2 + p.team) % STAGE.spawns.length;
      const spawn = STAGE.spawns[si % STAGE.spawns.length];
      this.fighters.set(p.id, {
        id: p.id,
        team: this.teams ? p.team : null,
        name: p.name,
        color: p.color,
        bot: !!p.bot,
        spawn,
        body: createFighter(spawn),
        s: STATE.IDLE,
        hp: settings.hp,
        maxHp: settings.hp,
        alive: true,
        place: 0,
        kos: 0,
        dmg: 0,
        lastHitBy: null,
        lastHitAt: -99,
        invulnUntil: BATTLE.SPAWN_INVULN,
        pairCd: new Map(),
        held: null, // 持っているアイテム
        shieldUntil: 0,
        itemT: 0, // CPU がアイテムを持ってからの時間
        brain: p.bot ? createBattleBrain(p.skill) : null,
      });
    });
    this.initialCount = this.fighters.size;
    this.startAt = Date.now() + COUNTDOWN_MS;

    room.broadcast('gameStart', {
      mode: 'battle',
      countdown: COUNTDOWN_MS,
      settings,
      players: [...this.fighters.values()].map(({ id, name, color, bot, spawn, team }) => ({ id, name, color, bot, spawn, team })),
      snapshot: this.snapshot(),
    });

    this.stopLoop = autoStart ? startLoop(() => this.tick(Date.now() >= this.startAt), BATTLE.DT) : () => {};
  }

  get started() {
    return Date.now() >= this.startAt;
  }

  tick(started) {
    if (this.ended) return;
    if (started && !this.over) {
      this.time += BATTLE.DT;
      this.stepBots();
      if (this.itemsOn) this.updateItems();
      this.checkTime();
      this.checkOver();
    }
    if (++this.steps % Math.round(60 / BATTLE_SNAPSHOT_HZ) === 0 || this.over) {
      this.room.broadcast('battle:snapshot', { s: this.snapshot() });
    }
    if (this.over) this.finish();
  }

  aliveList() {
    return [...this.fighters.values()].filter((f) => f.alive);
  }

  // 敵どうしか（チーム戦では同じチームは味方）
  isEnemy(a, b) {
    return a !== b && (!this.teams || a.team !== b.team);
  }

  stepBots() {
    const list = [...this.fighters.values()];
    for (const f of list) {
      if (!f.bot || !f.alive) continue;
      const inp = battleBotInput(list, f, f.brain, this.boxes);
      const b = f.body;
      stepFighter(b, inp, BATTLE.DT);
      f.s = fighterState(b);
      if (b.y > STAGE.killY) {
        this.eliminate(f, 'out');
        continue;
      }
      for (const t of list) {
        if (!t.alive || !this.isEnemy(f, t)) continue; // 味方はすり抜ける
        if (b.stompCd <= 0 && b.hitstun <= 0 && stompCheck(b, t.body)) {
          if (this.tryHit(f, t, 'stomp')) {
            b.vy = -BATTLE.STOMP.bounce;
            b.jumps = Math.max(b.jumps, BATTLE.JUMPS - 1);
            b.stompCd = BATTLE.STOMP.cooldown;
          }
        } else if (biteCheck(b, t.body) && !b.bitten.has(t.id)) {
          b.bitten.add(t.id);
          this.tryHit(f, t, 'bite');
        } else {
          bodyBump(b, t.body); // 体がぶつかっただけ → はじかれる
        }
      }
    }
  }

  handle(client, msg) {
    const f = this.fighters.get(client.id);
    if (!f || f.bot || !f.alive || this.over) return;
    if (msg.type === 'battle:state') {
      this.updateBody(f, msg);
    } else if (msg.type === 'battle:hit') {
      if (!this.started) return;
      const t = this.fighters.get(msg.to);
      if (!t || (msg.kind !== 'stomp' && msg.kind !== 'bite')) return;
      if (msg.x !== undefined) this.updateBody(f, msg);
      // 通信遅延ぶんのずれは許しつつ、明らかに遠い攻撃は無効
      const dx = Math.abs(wrapDx(f.body.x, t.body.x));
      const dy = f.body.y - t.body.y;
      if (dx > BATTLE.HIT_TOLERANCE || Math.abs(dy) > BATTLE.HIT_TOLERANCE) return;
      if (msg.kind === 'stomp' && dy > 20) return;
      this.tryHit(f, t, msg.kind);
    } else if (msg.type === 'battle:item') {
      if (this.started) this.useItem(f);
    }
  }

  // ---------- アイテム ----------
  updateItems() {
    const I = BATTLE_ITEMS;
    // ボックスの出現（サドンデス中は出さない）
    if (!this.sudden && this.time >= this.nextBoxAt) {
      this.nextBoxAt = this.time + I.INTERVAL;
      if (this.boxes.length < I.MAX) this.spawnBox();
    }
    const alive = this.aliveList();
    // ボックスを取る
    for (const box of [...this.boxes]) {
      const r = boxRect(box);
      const taker = alive.find((f) => !f.held && rectsOverlap(r, this.bodyOf(f)));
      if (!taker) continue;
      this.boxes = this.boxes.filter((b) => b !== box);
      taker.held = I.TYPES[Math.floor(Math.random() * I.TYPES.length)];
      taker.itemT = 0;
      this.events.push({ t: 'pickup', id: taker.id, item: taker.held });
    }
    // サボテン・プテラ
    for (const hz of this.hazards) {
      if (hz.k === 'ptera') {
        hz.x += hz.vx * BATTLE.DT;
        hz.dist += Math.abs(hz.vx) * BATTLE.DT;
      }
      const r = hazardRect(hz);
      const owner = this.fighters.get(hz.owner);
      for (const t of alive) {
        if (!this.isEnemy(owner, t) || hz.hit.has(t.id) || !rectsOverlap(r, this.bodyOf(t))) continue;
        const dir = hz.k === 'ptera' ? Math.sign(hz.vx) : Math.sign(wrapDx(hz.x, t.body.x)) || 1;
        if (this.tryHit(owner, t, hz.k, dir)) {
          if (hz.k === 'ptera') hz.hit.add(t.id); // プテラは 1 人に 1 回だけ
        }
      }
    }
    this.hazards = this.hazards.filter((hz) => (hz.k === 'ptera' ? hz.dist < BATTLE.W + 120 : this.time < hz.until));
    // CPU のアイテム使用
    for (const f of alive) if (f.bot && f.held) this.botUseItem(f);
  }

  spawnBox() {
    const plats = STAGE.platforms;
    for (let tries = 0; tries < 10; tries++) {
      const p = plats[Math.floor(Math.random() * plats.length)];
      const x = p.x + 20 + Math.random() * (p.w - 40);
      // 誰かの真上や、ほかのボックスのすぐ近くには出さない
      const crowded =
        this.boxes.some((b) => Math.abs(wrapDx(b.x, x)) < 60 && b.y === p.y) ||
        this.aliveList().some((f) => Math.abs(wrapDx(f.body.x, x)) < 50 && Math.abs(f.body.y - p.y) < 20);
      if (crowded) continue;
      this.boxes.push({ id: ++this.seq, x: Math.round(x), y: p.y });
      return;
    }
  }

  // 当たり判定用の体（しゃがんでいると低い）
  bodyOf(f) {
    return bodyRect(f.body.x, f.body.y, f.s === STATE.DUCK);
  }

  useItem(f) {
    const I = BATTLE_ITEMS;
    const item = f.held;
    if (!item || !f.alive) return;
    f.held = null;
    if (item === 'shield') {
      f.shieldUntil = this.time + I.SHIELD_TIME;
    } else if (item === 'meat') {
      if (!this.sudden) f.hp = Math.min(f.maxHp, f.hp + I.HEAL);
    } else if (item === 'cactus') {
      const ground = f.body.onGround ? { y: f.body.y } : groundBelow(f.body.x, f.body.y);
      this.hazards.push({ id: ++this.seq, k: 'cactus', owner: f.id, x: Math.round(f.body.x), y: ground ? ground.y : f.body.y, vx: 0, until: this.time + I.CACTUS.time, hit: new Set() });
    } else if (item === 'ptera') {
      // 一番近い相手の頭の高さを、相手のいる側の画面端から横切る
      let target = null;
      let best = Infinity;
      for (const t of this.aliveList()) {
        if (!this.isEnemy(f, t)) continue;
        const d = Math.abs(wrapDx(f.body.x, t.body.x)) + Math.abs(t.body.y - f.body.y);
        if (d < best) {
          best = d;
          target = t;
        }
      }
      if (target) {
        const dir = target.body.x < BATTLE.W / 2 ? 1 : -1;
        const startX = dir > 0 ? -60 : BATTLE.W + 60;
        this.hazards.push({ id: ++this.seq, k: 'ptera', owner: f.id, x: startX, y: Math.round(target.body.y - 36), vx: dir * I.PTERA.speed, dist: 0, hit: new Set() });
      }
    }
    this.events.push({ t: 'use', id: f.id, item });
  }

  botUseItem(f) {
    f.itemT += BATTLE.DT;
    const near = this.aliveList().some((t) => this.isEnemy(f, t) && Math.abs(wrapDx(f.body.x, t.body.x)) < 140 && Math.abs(t.body.y - f.body.y) < 40);
    const ready =
      (f.held === 'meat' && (f.hp <= f.maxHp - BATTLE_ITEMS.HEAL || f.itemT > 8)) ||
      (f.held === 'shield' && (near || f.itemT > 3)) ||
      (f.held === 'cactus' && f.body.onGround && (near || f.itemT > 6)) ||
      (f.held === 'ptera' && f.itemT > 1.5);
    if (ready) this.useItem(f);
  }

  updateBody(f, m) {
    const b = f.body;
    b.x = wrapX(num(m.x, -10000, 10000, b.x));
    b.y = num(m.y, -2000, 2000, b.y);
    b.vx = num(m.vx, -3000, 3000);
    b.vy = num(m.vy, -3000, 3000);
    b.facing = m.f < 0 ? -1 : 1;
    f.s = num(m.s, 0, 6, 0) | 0;
    if (b.y > STAGE.killY && this.started) this.eliminate(f, 'out');
  }

  // a が t に攻撃を当てた。kind: stomp / bite / cactus / ptera（アイテムは置いた人が a。脱落後も有効）
  tryHit(a, t, kind, dirOverride) {
    const fromItem = kind === 'cactus' || kind === 'ptera';
    if (!a || (!a.alive && !fromItem) || !t.alive || this.over) return false;
    if (!this.isEnemy(a, t)) return false; // 味方には当たらない
    if (this.time < t.invulnUntil) return false;
    if (!fromItem) {
      if ((a.pairCd.get(t.id) ?? -1) > this.time) return false;
      a.pairCd.set(t.id, this.time + PAIR_COOLDOWN);
    }
    const hitPos = { x: Math.round(t.body.x), y: Math.round(t.body.y - 30) };

    // バリアで防いだ
    if (this.time < t.shieldUntil) {
      t.shieldUntil = 0;
      t.invulnUntil = this.time + BATTLE.HIT_INVULN;
      this.room.broadcast('battle:hit', { from: a.id, to: t.id, kind, dmg: 0, hp: t.hp, kb: null, blocked: true, ...hitPos });
      return true;
    }

    const I = BATTLE_ITEMS;
    const dmg = { stomp: BATTLE.STOMP.dmg, bite: BATTLE.BITE.dmg, cactus: I.CACTUS.dmg, ptera: I.PTERA.dmg }[kind];
    t.hp = Math.max(0, t.hp - dmg);
    const dir = dirOverride || Math.sign(wrapDx(a.body.x, t.body.x)) || a.body.facing;
    let kb;
    if (kind === 'stomp') kb = stompEffect();
    else if (kind === 'bite') kb = biteKnockback(dir, t.hp, t.maxHp);
    else {
      const K = kind === 'cactus' ? I.CACTUS : I.PTERA;
      kb = knockback(dir, t.hp, t.maxHp, K.kb, K.kbScale, K.angle);
    }
    t.invulnUntil = this.time + BATTLE.HIT_INVULN;
    t.lastHitBy = a.id;
    t.lastHitAt = this.time;
    a.dmg += dmg;
    if (t.bot) applyKnockback(t.body, kb);
    this.room.broadcast('battle:hit', {
      from: a.id,
      to: t.id,
      kind,
      dmg,
      hp: t.hp,
      kb,
      ...hitPos,
    });
    if (t.hp <= 0) this.eliminate(t, 'hp');
    return true;
  }

  eliminate(f, reason) {
    if (!f.alive) return;
    f.place = this.aliveList().length;
    f.alive = false;
    const killer = f.lastHitBy && this.time - f.lastHitAt < 8 ? this.fighters.get(f.lastHitBy) : null;
    if (killer && killer !== f) killer.kos++;
    this.events.push({
      t: 'ko',
      id: f.id,
      by: killer ? killer.id : null,
      reason,
      x: Math.round(f.body.x),
      y: Math.round(Math.min(BATTLE.H, Math.max(0, f.body.y))),
    });
  }

  checkTime() {
    if (!this.sudden && this.time >= this.settings.timeLimit) {
      this.sudden = true;
      for (const f of this.aliveList()) f.hp = 1;
      this.events.push({ t: 'sudden' });
    }
  }

  checkOver() {
    const alive = this.aliveList();
    const timeUp = this.sudden && this.time >= this.settings.timeLimit + BATTLE.SUDDEN_DEATH_TIME;
    if (this.teams) {
      this.checkTeamOver(alive, timeUp);
      return;
    }
    if ((this.initialCount > 1 && alive.length <= 1) || alive.length === 0 || timeUp) {
      alive.sort((a, b) => b.kos - a.kos || b.dmg - a.dmg);
      alive.forEach((f, i) => (f.place = i + 1));
      this.over = true;
    }
  }

  // チーム戦：相手チームが全滅したら勝ち。時間切れは 生存人数 → 残り HP の合計 → KO 数 で判定
  checkTeamOver(alive, timeUp) {
    const teamsAlive = new Set(alive.map((f) => f.team));
    if (teamsAlive.size > 1 && !timeUp) return;
    const all = [...this.fighters.values()];
    const score = (team) => {
      const members = all.filter((f) => f.team === team);
      const living = members.filter((f) => f.alive);
      return [living.length, living.reduce((n, f) => n + f.hp, 0), members.reduce((n, f) => n + f.kos, 0)];
    };
    const [a, b] = [score(0), score(1)];
    let winner = 0;
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) {
        winner = a[i] > b[i] ? 0 : 1;
        break;
      }
    }
    this.winnerTeam = winner;
    for (const f of all) f.place = f.team === winner ? 1 : 2;
    this.over = true;
  }

  removePlayer(id) {
    const f = this.fighters.get(id);
    if (f) this.eliminate(f, 'leave');
    if (!this.over) this.checkOver();
  }

  results() {
    return [...this.fighters.values()]
      .sort((a, b) => a.place - b.place || b.kos - a.kos || b.dmg - a.dmg)
      .map((f) => ({ id: f.id, name: f.name, color: f.color, bot: f.bot, place: f.place, kos: f.kos, dmg: f.dmg, team: f.team }));
  }

  finish() {
    if (this.ended) return;
    this.ended = true;
    this.stopLoop();
    const results = this.results();
    setTimeout(() => this.room.endGame(results, this.teams ? { winnerTeam: this.winnerTeam } : {}), 2000);
  }

  snapshot() {
    const limit = this.sudden ? this.settings.timeLimit + BATTLE.SUDDEN_DEATH_TIME : this.settings.timeLimit;
    const events = this.events;
    this.events = [];
    return {
      t: Math.round(this.time * 1000),
      tl: Math.max(0, Math.ceil(limit - this.time)),
      sd: this.sudden,
      p: [...this.fighters.values()].map((f) => ({
        id: f.id,
        x: Math.round(f.body.x),
        y: Math.round(f.body.y),
        vx: Math.round(f.body.vx),
        vy: Math.round(f.body.vy),
        f: f.body.facing,
        s: f.s,
        hp: f.hp,
        a: f.alive ? 1 : 0,
        inv: this.time < f.invulnUntil ? 1 : 0,
        it: f.held,
        sh: this.time < f.shieldUntil ? 1 : 0,
      })),
      box: this.boxes.map(({ id, x, y }) => ({ id, x, y })),
      hz: this.hazards.map(({ id, k, x, y, vx, owner }) => ({ id, k, x: Math.round(x), y, vx, o: owner })),
      ev: events,
    };
  }

  destroy() {
    this.ended = true;
    this.stopLoop();
  }
}
