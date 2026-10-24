// レース（マルチ）の進行
// 各プレイヤーのコースはクライアント側でシミュレートし、状態だけをサーバーで中継する。
// サーバーは脱落順の管理・おじゃまアイテムの中継・CPU のシミュレーションを担当。
import { RaceSim, RACE } from '../shared/race-sim.js';
import { createRaceBrain, raceBotInput } from '../shared/race-bot.js';
import { randomSeed } from '../shared/rng.js';
import { COUNTDOWN_MS, RACE_STATE_HZ } from '../shared/config.js';
import { startLoop } from './loop.js';

const ATTACK_ITEMS = ['cactus', 'ptera', 'night'];

export class RaceGame {
  constructor(room, players, settings) {
    this.room = room;
    this.settings = settings;
    this.seed = randomSeed();
    this.ended = false;
    this.states = new Map();
    this.bots = new Map();
    for (const p of players) {
      this.states.set(p.id, {
        id: p.id,
        name: p.name,
        color: p.color,
        bot: !!p.bot,
        alive: true,
        place: 0,
        score: 0,
        y: 0,
        t: 0, // そのプレイヤーのシミュレーションのステップ数（観戦でコースの位置を合わせるのに使う）
        duck: false,
        lives: settings.lives,
        shield: false,
        lastItemAt: 0,
      });
      if (p.bot) {
        this.bots.set(p.id, {
          sim: new RaceSim({ seed: this.seed, items: settings.items, lives: settings.lives }),
          brain: createRaceBrain(p.skill),
        });
      }
    }
    this.startAt = Date.now() + COUNTDOWN_MS;
    room.broadcast('gameStart', {
      mode: 'race',
      seed: this.seed,
      countdown: COUNTDOWN_MS,
      settings,
      players: players.map(({ id, name, color, bot }) => ({ id, name, color, bot })),
    });

    let stepCount = 0;
    const sendEvery = Math.round(60 / RACE_STATE_HZ);
    this.stopLoop = startLoop(() => {
      if (Date.now() < this.startAt || this.ended) return;
      this.stepBots();
      if (++stepCount % sendEvery === 0) this.broadcastPlayers();
    }, RACE.DT);
  }

  stepBots() {
    for (const [id, bot] of this.bots) {
      const st = this.states.get(id);
      if (!st.alive) continue;
      const input = raceBotInput(bot.sim, bot.brain);
      bot.sim.step(input);
      if (input.item) {
        const item = bot.sim.useItem();
        if (item && item !== 'shield') this.sendAttack(id, item);
      }
      bot.sim.drainEvents();
      st.score = bot.sim.score;
      st.y = Math.round(bot.sim.dino.y);
      st.t = Math.round(bot.sim.time / RACE.DT);
      st.duck = bot.sim.dino.ducking;
      st.lives = bot.sim.lives;
      st.shield = bot.sim.shield > 0;
      if (!bot.sim.alive) this.eliminate(id);
    }
  }

  handle(client, msg) {
    const st = this.states.get(client.id);
    if (!st || this.ended) return;
    switch (msg.type) {
      case 'race:state':
        if (!st.alive) return;
        st.score = Math.max(0, Math.floor(Number(msg.score) || 0));
        st.y = Math.max(-200, Math.min(0, Number(msg.y) || 0));
        st.t = Math.max(0, Math.floor(Number(msg.t) || 0));
        st.duck = !!msg.duck;
        st.lives = Math.max(0, Math.min(this.settings.lives, Number(msg.lives) || 0));
        st.shield = !!msg.shield;
        break;
      case 'race:dead':
        if (!st.alive) return;
        st.score = Math.max(st.score, Math.floor(Number(msg.score) || 0));
        this.eliminate(client.id);
        break;
      case 'race:item': {
        if (!st.alive || !this.settings.items || !ATTACK_ITEMS.includes(msg.item)) return;
        const now = Date.now();
        if (now - st.lastItemAt < 1500) return;
        st.lastItemAt = now;
        this.sendAttack(client.id, msg.item);
        break;
      }
      default:
    }
  }

  sendAttack(fromId, item) {
    for (const st of this.states.values()) {
      if (st.id === fromId || !st.alive) continue;
      const bot = this.bots.get(st.id);
      if (bot) bot.sim.receiveAttack(item);
      else this.room.sendTo(st.id, 'race:attack', { from: fromId, item });
    }
    this.room.broadcast('race:itemUsed', { from: fromId, item });
  }

  broadcastPlayers() {
    const list = [...this.states.values()].map((s) => ({
      id: s.id,
      score: s.score,
      y: s.y,
      t: s.t,
      duck: s.duck,
      alive: s.alive,
      lives: s.lives,
      shield: s.shield,
    }));
    this.room.broadcast('race:players', { players: list });
  }

  aliveCount() {
    let n = 0;
    for (const s of this.states.values()) if (s.alive) n++;
    return n;
  }

  eliminate(id) {
    const st = this.states.get(id);
    if (!st || !st.alive) return;
    st.place = this.aliveCount();
    st.alive = false;
    this.room.broadcast('race:eliminated', { id, place: st.place, score: st.score });
    this.checkEnd();
  }

  removePlayer(id) {
    this.eliminate(id);
  }

  checkEnd() {
    const alive = this.aliveCount();
    const total = this.states.size;
    if (this.ended || !((total > 1 && alive <= 1) || alive === 0)) return;
    this.ended = true;
    for (const s of this.states.values()) if (s.alive) s.place = 1;
    this.broadcastPlayers();
    const results = [...this.states.values()]
      .sort((a, b) => a.place - b.place)
      .map((s) => ({ id: s.id, name: s.name, color: s.color, place: s.place, score: s.score, bot: s.bot }));
    // 最後の脱落演出を見せてから終了
    setTimeout(() => this.room.endGame(results), 1500);
  }

  destroy() {
    this.ended = true;
    this.stopLoop();
  }
}
