// レースの画面（ソロ / マルチ共通）
// 自分のコースはこの端末でシミュレートし、マルチでは状態をサーバーに送る。
// ほかのプレイヤーは半透明の「ゴースト」として表示する。
// 脱落後は生き残っているプレイヤーを観戦できる（同じシードのコースを、そのプレイヤーの進み具合に合わせて再生する）。
import { RaceSim, RACE, ITEM_LABELS } from '../shared/race-sim.js';
import { randomSeed } from '../shared/rng.js';
import { RACE_STATE_HZ } from '../shared/config.js';
import { createView, pixelText } from './canvas.js';
import { drawSprite } from './sprites.js';
import { play, vibrate } from './audio.js';

const INK = '#535353';
// 他プレイヤー（ゴースト）は自分と重ならないよう少し前に表示する
const GHOST_X = RACE.DINO_X + 70;
// 観戦の表示遅延（ステップ数）。状態は 15Hz で届くので、少し遅らせて補間する
const SPECTATE_DELAY_STEPS = 9;
const ITEM_ICONS = { cactus: '🌵', ptera: '🦅', night: '🌑', shield: '🛡️' };

export class RaceClient {
  constructor({ canvas, hud, controls, net, solo, seed, settings, players, myId, myColor, countdown, onSoloOver, onMultiScore, onToast }) {
    this.view = createView(canvas, RACE.W, RACE.H);
    this.hud = hud;
    this.controls = controls;
    this.net = net;
    this.solo = solo;
    this.settings = settings || { lives: 1, items: false };
    this.myId = myId;
    this.myColor = myColor;
    this.onSoloOver = onSoloOver;
    this.onMultiScore = onMultiScore;
    this.finished = false;
    this.onToast = onToast || (() => {});
    this.players = new Map((players || []).map((p) => [p.id, { ...p, y: 0, duck: false, alive: true, score: 0, lives: this.settings.lives }]));
    this.hiScore = Number(localStorage.getItem('dino.hi') || 0);
    this.clouds = Array.from({ length: 4 }, (_, i) => ({ x: i * 170 + Math.random() * 80, y: 20 + Math.random() * 60 }));
    this.pebbles = Array.from({ length: 40 }, () => ({ x: Math.random() * RACE.W, y: RACE.GROUND - 2 + Math.random() * 14, w: 1 + Math.floor(Math.random() * 3) }));
    this.warnings = [];

    controls.setup('race', { items: !solo && this.settings.items });
    controls.onPress((name) => this.onPress(name));
    this.itemBtn = controls.el.querySelector('.ctl-item');

    this.reset(seed ?? randomSeed(), countdown ?? 0);
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    this.hudTimer = setInterval(() => this.renderHud(), 250);
    this.renderHud();
  }

  reset(seed, countdown) {
    this.seed = seed;
    this.spec = null;
    this.sim = new RaceSim({
      seed,
      items: !this.solo && this.settings.items,
      lives: this.solo ? 1 : this.settings.lives,
    });
    this.startAt = performance.now() + countdown;
    this.lastCount = -1;
    this.acc = 0;
    this.anim = 0;
    this.deadAt = 0;
    this.sendTimer = 0;
    this.updateItemButton();
  }

  onPress(name) {
    if (this.spec) {
      // 観戦中：ジャンプ / しゃがむ で観戦する相手を切り替え
      if (name === 'jump') this.pickTarget(1);
      if (name === 'duck') this.pickTarget(-1);
      return;
    }
    if (name === 'item') this.useItem();
    if (name === 'jump' && this.solo && !this.sim.alive && performance.now() - this.deadAt > 600) {
      this.reset(randomSeed(), 0);
      this.onSoloOver?.(null);
    }
  }

  useItem() {
    const item = this.sim.useItem();
    if (!item) return;
    play('item');
    if (item !== 'shield') this.net?.send('race:item', { item });
    this.updateItemButton();
  }

  updateItemButton() {
    if (!this.itemBtn) return;
    const item = this.sim.heldItem;
    this.itemBtn.classList.toggle('has-item', !!item);
    this.itemBtn.querySelector('.ctl-item-icon').textContent = item ? ITEM_ICONS[item] : '?';
    this.itemBtn.querySelector('small').textContent = item ? ITEM_LABELS[item] : 'アイテム';
  }

  // ---- サーバーからのメッセージ ----
  onPlayers(list) {
    const now = performance.now();
    for (const s of list) {
      const p = this.players.get(s.id);
      if (!p) continue;
      Object.assign(p, s);
      // 観戦用に「何ステップ目にどの高さだったか」を記録しておく
      p.buf = p.buf || [];
      const last = p.buf[p.buf.length - 1];
      if (!last || s.t > last.t) {
        p.buf.push({ t: s.t, y: s.y, duck: s.duck, at: now });
        if (p.buf.length > 40) p.buf.shift();
      }
    }
  }

  // ---- 観戦 ----
  startSpectate() {
    this.spec = { sim: new RaceSim({ seed: this.seed, items: false, lives: 1e9 }), steps: 0, targetId: null };
    this.pickTarget(1);
  }

  aliveOthers() {
    return [...this.players.values()].filter((p) => p.alive && p.id !== this.myId);
  }

  pickTarget(delta) {
    const list = this.aliveOthers();
    if (!list.length) return;
    const i = list.findIndex((p) => p.id === this.spec.targetId);
    const next = i < 0 ? 0 : (i + delta + list.length) % list.length;
    this.spec.targetId = list[next].id;
  }

  updateSpectate(dt, now) {
    const spec = this.spec;
    let target = this.players.get(spec.targetId);
    if (!target || !target.alive) {
      this.pickTarget(1);
      target = this.players.get(spec.targetId);
    }
    if (!target?.buf?.length) return;
    // 観戦相手の最新の進み具合から、今表示すべきステップを推定してコースを進める
    const last = target.buf[target.buf.length - 1];
    const renderStep = last.t + ((now - last.at) / 1000) * 60 - SPECTATE_DELAY_STEPS;
    let n = 0;
    while (spec.steps < Math.floor(renderStep) && n < 900) {
      spec.sim.step({});
      spec.steps++;
      n++;
    }
    spec.sim.drainEvents();
    this.scrollScenery(spec.sim.speed, dt);
  }

  // そのプレイヤーが step ステップ目のときの高さ（届いた状態から補間）
  sampleAt(p, step) {
    const buf = p.buf;
    if (!buf?.length) return { y: p.y, duck: p.duck };
    if (step <= buf[0].t) return buf[0];
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1];
      const b = buf[i];
      if (a.t <= step && step <= b.t) {
        const k = b.t > a.t ? (step - a.t) / (b.t - a.t) : 1;
        return { y: a.y + (b.y - a.y) * k, duck: k < 0.5 ? a.duck : b.duck };
      }
    }
    return buf[buf.length - 1];
  }

  scrollScenery(speed, dt) {
    for (const c of this.clouds) {
      c.x -= speed * 0.2 * dt;
      if (c.x < -60) {
        c.x = RACE.W + Math.random() * 100;
        c.y = 20 + Math.random() * 60;
      }
    }
    for (const p of this.pebbles) {
      p.x -= speed * dt;
      if (p.x < -4) p.x += RACE.W + 8;
    }
  }

  onAttack({ from, item }) {
    this.sim.receiveAttack(item);
    const name = this.players.get(from)?.name || '？？？';
    this.onToast(`${name} の ${ITEM_LABELS[item]}！`, 'danger');
    this.warnings.push({ t: 1.2 });
    play('warn');
    vibrate(80);
  }

  onItemUsed({ from, item }) {
    if (from === this.myId) {
      this.onToast(`${ITEM_LABELS[item]} を送った！`, 'good');
    }
  }

  onEliminated({ id, place }) {
    const p = this.players.get(id);
    if (p) p.alive = false;
    if (id !== this.myId && p) this.onToast(`${p.name} が脱落（${place}位）`);
  }

  // ---- ループ ----
  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.update(dt, now);
    this.render(now);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  update(dt, now) {
    const sim = this.sim;
    if (now < this.startAt) {
      const c = Math.ceil((this.startAt - now) / 1000);
      if (c !== this.lastCount) {
        this.lastCount = c;
        play('count');
      }
      return;
    }
    if (this.lastCount > 0) {
      this.lastCount = 0;
      play('go');
    }
    this.anim += dt;
    if (sim.alive && !this.finished) {
      this.acc += dt;
      const input = { jump: this.controls.get('jump'), duck: this.controls.get('duck') };
      while (this.acc >= RACE.DT) {
        sim.step(input);
        this.acc -= RACE.DT;
      }
      this.scrollScenery(sim.speed, dt);
      this.handleEvents(sim.drainEvents());
      if (!this.solo) {
        this.sendTimer += dt;
        if (this.sendTimer >= 1 / RACE_STATE_HZ) {
          this.sendTimer = 0;
          this.net.send('race:state', {
            score: sim.score,
            t: Math.round(sim.time / RACE.DT),
            y: Math.round(sim.dino.y),
            duck: sim.dino.ducking,
            lives: sim.lives,
            shield: sim.shield > 0,
          });
        }
      }
    }
    // 脱落したら少し間をおいて観戦に切り替える
    if (!this.solo && !sim.alive) {
      if (!this.spec && now - this.deadAt > 1500 && this.aliveOthers().length) this.startSpectate();
      if (this.spec) this.updateSpectate(dt, now);
    }
    // 他プレイヤーの高さは 15Hz でしか届かないので滑らかにつなぐ
    for (const p of this.players.values()) {
      p.ry = p.ry === undefined ? p.y : p.ry + (p.y - p.ry) * Math.min(1, dt * 18);
    }
    for (const w of this.warnings) w.t -= dt;
    this.warnings = this.warnings.filter((w) => w.t > 0);
  }

  handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          play('jump');
          break;
        case 'milestone':
          play('score');
          break;
        case 'hit':
          play('hit');
          vibrate(120);
          break;
        case 'shieldBreak':
          play('hit');
          vibrate(60);
          break;
        case 'pickup':
          play('pickup');
          this.updateItemButton();
          break;
        case 'dead':
          this.onDead();
          break;
        default:
      }
    }
  }

  onDead() {
    play('dead');
    vibrate([100, 50, 200]);
    this.deadAt = performance.now();
    const score = this.sim.score;
    if (score > this.hiScore) {
      this.hiScore = score;
      try {
        localStorage.setItem('dino.hi', String(score));
      } catch {}
    }
    if (this.solo) {
      this.onSoloOver?.({ score, duration: this.sim.time });
    } else {
      this.net.send('race:dead', { score });
      this.onMultiScore?.({ score, duration: this.sim.time });
      const me = this.players.get(this.myId);
      if (me) me.alive = false;
    }
  }

  // ---- 描画 ----
  render(now) {
    const { ctx, W, H } = this.view;
    const sim = this.sim;
    const spec = this.spec;
    const world = spec ? spec.sim : sim; // 観戦中は観戦相手のコースを表示
    const target = spec ? this.players.get(spec.targetId) : null;
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, 0, W, H);

    for (const c of this.clouds) drawSprite(ctx, 'cloud', '#c9c9c9', c.x, c.y, 2);

    // 地面
    ctx.fillStyle = INK;
    ctx.fillRect(0, RACE.GROUND - 4, W, 1);
    for (const p of this.pebbles) ctx.fillRect(p.x, p.y, p.w, 1);

    // アイテム（観戦中は相手が取ったかわからないので出さない）
    for (const it of spec ? [] : sim.items) {
      if (it.gone) continue;
      const bob = Math.sin(this.anim * 6 + it.id) * 3;
      drawSprite(ctx, 'item', INK, it.x, it.y + bob, 2);
    }

    // 障害物
    const pteraFrame = Math.floor(this.anim * 6) % 2 ? 'ptera1' : 'ptera2';
    for (const o of [...world.course, ...world.extras]) {
      const color = o.extra ? '#c0392b' : INK;
      if (o.type === 'ptera') drawSprite(ctx, pteraFrame, color, o.x, o.y, 2);
      else for (let i = 0; i < o.size; i++) drawSprite(ctx, o.type, color, o.x + i * o.w, o.y, 2);
    }

    // ゴースト（他プレイヤー）：自分より少し前に半透明で表示（ゴースト同士は重なってよい）
    if (!this.solo) {
      ctx.globalAlpha = 0.35;
      for (const p of this.players.values()) {
        if (p.id === this.myId || !p.alive || p === target) continue;
        const st = spec ? this.sampleAt(p, spec.steps) : { y: p.ry ?? p.y, duck: p.duck };
        this.drawDino(ctx, p.color, st.y, st.duck, st.y > -1, true, GHOST_X);
      }
      ctx.globalAlpha = 1;
    }

    if (spec) {
      // 観戦相手をいつもの位置に表示
      if (target) {
        const st = this.sampleAt(target, spec.steps);
        this.drawDino(ctx, target.color, st.y, st.duck, st.y > -1, target.alive);
      }
    } else {
      // 自分
      const blink = sim.invuln > 0 && Math.floor(sim.invuln * 12) % 2 === 0;
      if (!blink) this.drawDino(ctx, this.myColor, sim.dino.y, sim.dino.ducking, sim.dino.onGround, sim.alive);
    }
    if (!spec && sim.shield > 0) {
      ctx.strokeStyle = `rgba(47,128,237,${0.5 + 0.3 * Math.sin(this.anim * 10)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(RACE.DINO_X + 22, RACE.GROUND + sim.dino.y - 22, 34, 0, Math.PI * 2);
      ctx.stroke();
    }

    // まっくら（おじゃま）
    if (!spec && sim.night > 0) {
      const cx = RACE.DINO_X + 22;
      const cy = RACE.GROUND + sim.dino.y - 22;
      const fade = Math.min(1, sim.night, 0.5) * 2;
      const g = ctx.createRadialGradient(cx, cy, 50, cx, cy, 170);
      g.addColorStop(0, 'rgba(15,15,25,0)');
      g.addColorStop(1, `rgba(15,15,25,${0.97 * fade})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 警告
    if (this.warnings.length) {
      pixelText(ctx, '!!', W - 30, 60, { size: 20, color: '#e5533d', align: 'center' });
    }

    // スコア
    const pad = (n) => String(n).padStart(5, '0');
    const score = target ? target.score : sim.score;
    pixelText(ctx, `HI ${pad(Math.max(this.hiScore, score))}  ${pad(score)}`, W - 10, 10, { size: 12, align: 'right', color: INK });
    if (!spec && !this.solo && this.settings.lives > 1) {
      for (let i = 0; i < sim.maxLives; i++) {
        ctx.globalAlpha = i < sim.lives ? 1 : 0.2;
        drawSprite(ctx, 'heart', INK, 10 + i * 18, 10, 2);
      }
      ctx.globalAlpha = 1;
    }

    if (now < this.startAt) {
      const c = Math.ceil((this.startAt - now) / 1000);
      pixelText(ctx, String(c), W / 2, H / 2 - 40, { size: 48, align: 'center', color: INK });
    } else if (now - this.startAt < 600) {
      pixelText(ctx, 'GO!', W / 2, H / 2 - 40, { size: 40, align: 'center', color: '#27ae60' });
    }

    if (spec) {
      if (target) {
        pixelText(ctx, `観戦中：${target.name}`, 10, 10, { size: 12, color: target.color, bold: false });
        if (this.aliveOthers().length > 1) pixelText(ctx, 'ジャンプ / しゃがむ で切り替え', 10, 28, { size: 10, color: INK, bold: false });
      }
    } else if (!sim.alive) {
      pixelText(ctx, 'G A M E   O V E R', W / 2, 60, { size: 16, align: 'center', color: INK });
      const msg = this.solo ? '▲ジャンプでリトライ' : '脱落… 観戦中';
      pixelText(ctx, msg, W / 2, 90, { size: 12, align: 'center', color: INK, bold: false });
    }
  }

  drawDino(ctx, color, y, ducking, onGround, alive, x = RACE.DINO_X) {
    const run = Math.floor(this.anim * 10) % 2;
    let name;
    if (!alive) name = 'dino_dead';
    else if (ducking && onGround) name = run ? 'dino_duck1' : 'dino_duck2';
    else if (!onGround || y < 0) name = 'dino_stand';
    else name = run ? 'dino_run1' : 'dino_run2';
    const h = name.startsWith('dino_duck') ? RACE.DUCK_H : RACE.DINO_H;
    drawSprite(ctx, name, color, x, RACE.GROUND + y - h, 2);
  }

  renderHud() {
    if (this.solo) {
      this.hud.innerHTML = '';
      return;
    }
    // 並び順はルームに入った順で固定（順位で並べ替えると表示がガタつくため）
    const list = [...this.players.values()];
    this.hud.innerHTML = `<ul class="standings">${list
      .map(
        (p) => `<li class="${p.alive ? '' : 'out'} ${p.id === this.myId ? 'me' : ''}">
          <i style="background:${p.color}"></i><span class="nm">${escapeHtml(p.name)}</span>
          <span class="sc">${p.alive ? p.score : '✖ ' + p.score}</span>
          ${p.shield ? '🛡️' : ''}${this.settings.lives > 1 && p.alive ? '♥'.repeat(Math.max(0, p.lives)) : ''}
        </li>`,
      )
      .join('')}</ul>`;
  }

  // マルチで最後まで生き残ったとき：レースを止めて、その時点のスコアをランキングに送る
  finish() {
    if (this.solo || this.finished || !this.sim.alive) return;
    this.finished = true;
    this.onMultiScore?.({ score: this.sim.score, duration: this.sim.time });
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    clearInterval(this.hudTimer);
    this.view.destroy();
    this.controls.destroy();
    this.hud.innerHTML = '';
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
