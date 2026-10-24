// バトルの画面
// 自分の恐竜：この端末で即座にシミュレート（入力遅延ゼロ）して、位置をサーバーに送る
// 他の恐竜：サーバーから届く位置を補間して表示（届かないときは速度で先読み）
// 攻撃：自分の画面で見えている相手に当たったらサーバーに送る（攻撃側の見た目を優先）
import {
  BATTLE,
  STAGE,
  STATE,
  createFighter,
  stepFighter,
  fighterState,
  stompCheck,
  biteCheck,
  bodyBump,
  applyKnockback,
  wrapDx,
  wrapX,
  BATTLE_ITEM_LABELS,
} from '../shared/battle-sim.js';
import { BATTLE_SNAPSHOT_HZ, TEAM_COLORS } from '../shared/config.js';
import { createView, pixelText } from './canvas.js';
import { drawSprite } from './sprites.js';
import { play, vibrate } from './audio.js';
import { escapeHtml } from './race-client.js';

const INK = '#535353';
const CLOUDS = [
  { x: 90, y: 70 },
  { x: 420, y: 110 },
  { x: 700, y: 50 },
  { x: 820, y: 150 },
];
const INTERP_MS = 50; // 他プレイヤー表示の遅延（スナップショット間隔 + 揺らぎ吸収）
const MAX_EXTRAP_MS = 100;
const SEND_EVERY = Math.round(60 / BATTLE_SNAPSHOT_HZ);
const HIT_RETRY_MS = 350;
const ITEM_ICONS = { shield: '🛡️', cactus: '🌵', ptera: '🦅', meat: '🍖' };

export class BattleClient {
  constructor({ canvas, hud, controls, net, players, myId, settings, countdown, snapshot, onToast }) {
    this.view = createView(canvas, BATTLE.W, BATTLE.H);
    this.hud = hud;
    this.controls = controls;
    this.net = net;
    this.myId = myId;
    this.settings = settings;
    this.onToast = onToast || (() => {});
    this.players = new Map(players.map((p) => [p.id, p]));
    const mine = this.players.get(myId);
    this.me = mine ? createFighter(mine.spawn) : null;
    this.myAlive = !!mine;
    this.snaps = [];
    this.latest = null;
    this.display = new Map();
    this.hitCd = new Map();
    this.particles = [];
    this.texts = [];
    this.bubbles = new Map();
    this.startAt = performance.now() + countdown;
    this.lastCount = -1;
    this.sudden = false;
    this.acc = 0;
    this.steps = 0;
    this.jumpLatch = false;
    this.biteLatch = false;
    if (snapshot) this.onSnapshot(snapshot);

    controls.setup('battle', { items: settings.items !== false });
    controls.onPress((name) => {
      if (name === 'j') this.jumpLatch = true;
      if (name === 'b') this.biteLatch = true;
      if (name === 'item' && this.myAlive && this.heldItem && performance.now() >= this.startAt) this.net.send('battle:item');
    });
    this.itemBtn = controls.el.querySelector('.ctl-itembtn');
    this.heldItem = null;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  // ---- サーバーからのメッセージ ----
  onSnapshot(s) {
    const now = performance.now();
    this.snaps.push(s);
    if (this.snaps.length > 30) this.snaps.shift();
    this.latest = s;
    this.latestAt = now;
    if (s.t > 0) {
      const est = s.t - now;
      this.offset = this.offset === undefined || Math.abs(est - this.offset) > 250 ? est : this.offset * 0.9 + est * 0.1;
    }
    const mine = s.p.find((p) => p.id === this.myId);
    if (mine && !mine.a && this.myAlive) this.myAlive = false;
    if (mine && (mine.it || null) !== this.heldItem) this.setHeldItem(mine.it || null);
    if (s.sd && !this.sudden) {
      this.sudden = true;
      this.onToast('サドンデス！全員HP1', 'danger');
      play('warn');
    }
    for (const e of s.ev || []) {
      if (e.t === 'ko') this.onKo(e);
      if (e.t === 'pickup' && e.id === this.myId) {
        play('pickup');
        this.onToast(`${ITEM_ICONS[e.item]} ${BATTLE_ITEM_LABELS[e.item]} をゲット！`, 'good');
      }
      if (e.t === 'use') {
        play('item');
        this.onToast(`${this.name(e.id)} の ${ITEM_ICONS[e.item]} ${BATTLE_ITEM_LABELS[e.item]}！`, e.id === this.myId ? 'good' : '');
      }
    }
  }

  // アイテムボタンの表示を、持っているアイテムに合わせる
  setHeldItem(item) {
    this.heldItem = item;
    if (!this.itemBtn) return;
    this.itemBtn.classList.toggle('has-item', !!item);
    this.itemBtn.querySelector('.ctl-item-icon').textContent = item ? ITEM_ICONS[item] : '?';
    this.itemBtn.querySelector('small').textContent = item ? BATTLE_ITEM_LABELS[item] : 'アイテム';
  }

  onHit(m) {
    if (m.blocked) {
      // バリアで防いだ
      play('bite');
      this.burst(m.x, m.y, '#2f80ed', 10);
      this.texts.push({ x: m.x, y: m.y - 10, text: 'ガード！', t: 0.8, color: '#2f80ed' });
      return;
    }
    // 自分のふみつけ・かみつきは当てた瞬間に表示済み。アイテムの攻撃はここで表示する
    const shown = m.from === this.myId && (m.kind === 'stomp' || m.kind === 'bite');
    if (!shown) {
      play('hit');
      this.effect(m.x, m.y, m.dmg);
    }
    if (m.to === this.myId && this.me && m.kb) {
      applyKnockback(this.me, m.kb);
      vibrate(80);
    }
  }

  // チャットのスタンプを恐竜の頭の上に出す
  onChat({ from, text }) {
    this.bubbles.set(from, { text, t: 2.2 });
  }

  onKo(e) {
    play('ko');
    if (e.id === this.myId) vibrate([100, 60, 250]);
    this.burst(e.x, e.y, INK, 20);
    const how = e.reason === 'out' ? '落下' : e.reason === 'hp' ? 'ノックアウト' : '退出';
    const by = e.by ? `（${this.name(e.by)}）` : '';
    this.onToast(`${this.name(e.id)} ${how}！${by}`, e.id === this.myId ? 'danger' : '');
  }

  // チーム戦で自分と同じチームか
  isTeammate(id) {
    const mine = this.players.get(this.myId);
    const other = this.players.get(id);
    return mine?.team != null && other?.team === mine.team;
  }

  teamColor(id) {
    const t = this.players.get(id)?.team;
    return t === 0 || t === 1 ? TEAM_COLORS[t] : null;
  }

  name(id) {
    return this.players.get(id)?.name || '？？？';
  }

  effect(x, y, dmg) {
    this.burst(x, y, '#e5533d', 8);
    this.texts.push({ x, y: y - 10, text: `-${dmg}`, t: 0.8, color: '#e5533d' });
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 220;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 100, t: 0.5 + Math.random() * 0.3, color });
    }
  }

  // ---- ループ ----
  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.updateDisplay(now);
    this.simulate(dt, now);
    this.updateFx(dt);
    this.render(now);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  simulate(dt, now) {
    if (now < this.startAt) {
      this.jumpLatch = false;
      this.biteLatch = false;
      return;
    }
    const me = this.me;
    if (!me || !this.myAlive || this.fell) return;
    this.acc += dt;
    while (this.acc >= BATTLE.DT) {
      this.acc -= BATTLE.DT;
      const c = this.controls;
      const inp = { l: c.get('l'), r: c.get('r'), down: c.get('d'), jump: this.jumpLatch, jumpHeld: c.get('j'), bite: this.biteLatch };
      this.jumpLatch = false;
      this.biteLatch = false;
      const biting = me.atk >= 0;
      if (stepFighter(me, inp, BATTLE.DT)) play('jump');
      if (!biting && me.atk >= 0) play('bite');
      this.checkContacts(now);
      if (me.y > STAGE.killY) {
        this.fell = true;
        this.sendState();
        return;
      }
      if (++this.steps % SEND_EVERY === 0) this.sendState();
    }
  }

  sendState() {
    const me = this.me;
    this.net.send('battle:state', {
      x: Math.round(me.x),
      y: Math.round(me.y),
      vx: Math.round(me.vx),
      vy: Math.round(me.vy),
      f: me.facing,
      s: fighterState(me),
    });
  }

  // 自分の画面に見えている相手との接触判定
  // ふみつけ・かみつきが当たったら攻撃、体がぶつかっただけならはじかれる
  checkContacts(now) {
    const me = this.me;
    for (const [id, d] of this.display) {
      if (id === this.myId || !d.alive || this.isTeammate(id)) continue; // 味方はすり抜ける
      let kind = null;
      const canHit = !d.inv && me.hitstun <= 0 && (this.hitCd.get(id) || 0) <= now;
      if (canHit && me.stompCd <= 0 && stompCheck(me, d)) {
        kind = 'stomp';
        me.vy = -BATTLE.STOMP.bounce;
        me.jumps = Math.max(me.jumps, BATTLE.JUMPS - 1);
        me.stompCd = BATTLE.STOMP.cooldown;
      } else if (canHit && biteCheck(me, d) && !me.bitten.has(id)) {
        kind = 'bite';
        me.bitten.add(id);
      } else {
        bodyBump(me, d);
        continue;
      }
      this.hitCd.set(id, now + HIT_RETRY_MS);
      this.net.send('battle:hit', { to: id, kind, x: Math.round(me.x), y: Math.round(me.y) });
      // サーバーの確定を待たずにエフェクトを出す
      play('hit');
      this.effect(d.x, d.y - 30, kind === 'stomp' ? BATTLE.STOMP.dmg : BATTLE.BITE.dmg);
    }
  }

  // 他プレイヤーの表示位置（補間・先読み）
  updateDisplay(now) {
    const snaps = this.snaps;
    if (!snaps.length) return;
    const latest = snaps[snaps.length - 1];
    const renderT = this.offset === undefined ? latest.t : now + this.offset - INTERP_MS;
    let a = null;
    let b = null;
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].t <= renderT && snaps[i].t >= renderT) {
        a = snaps[i - 1];
        b = snaps[i];
        break;
      }
    }
    const prev = a ? new Map(a.p.map((p) => [p.id, p])) : null;
    const k = a && b.t > a.t ? (renderT - a.t) / (b.t - a.t) : 0;
    const extrap = a ? 0 : Math.max(0, Math.min(MAX_EXTRAP_MS, renderT - latest.t)) / 1000;
    for (const p of (b || latest).p) {
      const cur = latest.p.find((q) => q.id === p.id) || p;
      let x = p.x;
      let y = p.y;
      const q = prev?.get(p.id);
      if (q) {
        x = q.x + wrapDx(q.x, p.x) * k;
        y = q.y + (p.y - q.y) * k;
      } else if (extrap > 0) {
        x = p.x + p.vx * extrap;
        y = p.s === STATE.AIR || p.s === STATE.HURT ? p.y + p.vy * extrap : p.y;
      }
      this.display.set(p.id, { x: wrapX(x), y, f: p.f, s: p.s, hp: cur.hp, alive: !!cur.a, inv: !!cur.inv, sh: !!cur.sh });
    }
  }

  updateFx(dt) {
    for (const p of this.particles) {
      p.t -= dt;
      p.vy += 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.t > 0);
    for (const t of this.texts) {
      t.t -= dt;
      t.y -= 40 * dt;
    }
    this.texts = this.texts.filter((t) => t.t > 0);
    for (const [id, b] of this.bubbles) {
      b.t -= dt;
      if (b.t <= 0) this.bubbles.delete(id);
    }
  }

  // ---- 描画 ----
  render(now) {
    const { ctx, W, H } = this.view;
    ctx.fillStyle = this.sudden ? '#202124' : '#f7f7f7';
    ctx.fillRect(0, 0, W, H);
    this.drawStage(ctx);
    this.drawItems(ctx, now);

    for (const [id, d] of this.display) {
      if (id === this.myId || !d.alive) continue;
      this.drawFighter(ctx, id, d, now);
    }
    if (this.me && this.myAlive) {
      const me = this.me;
      const mine = this.display.get(this.myId);
      this.drawFighter(ctx, this.myId, { x: me.x, y: me.y, f: me.facing, s: fighterState(me), inv: me.invuln > 0, hp: mine?.hp, sh: mine?.sh }, now, true);
    }

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.t * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.t * 2);
      pixelText(ctx, t.text, t.x, t.y, { size: 16, color: t.color, align: 'center' });
    }
    ctx.globalAlpha = 1;

    if (this.latest) {
      const l = this.latest;
      pixelText(ctx, `${l.sd ? 'SUDDEN ' : ''}${l.tl}`, W / 2, 12, { size: 20, align: 'center', color: l.sd ? '#e5533d' : INK });
      this.renderHud(l);
    }

    if (now < this.startAt) {
      const c = Math.ceil((this.startAt - now) / 1000);
      if (c !== this.lastCount) {
        this.lastCount = c;
        play('count');
      }
      pixelText(ctx, String(c), W / 2, H / 2 - 60, { size: 72, align: 'center', color: INK });
    } else if (now - this.startAt < 700) {
      if (this.lastCount > 0) {
        this.lastCount = 0;
        play('go');
      }
      pixelText(ctx, 'FIGHT!', W / 2, H / 2 - 50, { size: 56, align: 'center', color: '#e5533d' });
    }
    if (this.me && !this.myAlive) {
      pixelText(ctx, '脱落… 観戦中', W / 2, 60, { size: 20, align: 'center', color: this.ink, bold: false });
    }
  }

  // 元の恐竜ゲームと同じ白黒のテイスト。サドンデス中は夜モード（白黒反転）
  get ink() {
    return this.sudden ? '#e8eaed' : INK;
  }

  drawStage(ctx) {
    const ink = this.ink;
    // 雲（飾り）
    for (const c of CLOUDS) drawSprite(ctx, 'cloud', this.sudden ? '#5f6368' : '#c9c9c9', c.x, c.y, 2);

    for (const p of STAGE.platforms) {
      ctx.fillStyle = ink;
      if (p.solid) {
        // 地面：元のゲームと同じく 1 本の線と、その下の小石
        ctx.fillRect(p.x, p.y, p.w, 2);
        for (let x = p.x + 3; x < p.x + p.w - 3; x += 7) {
          const r = (x * 37) % 23;
          if (r < 9) ctx.fillRect(x, p.y + 6 + (r % 4) * 6, 1 + (r % 3), 1);
        }
        // 地面のでこぼこ
        for (let x = p.x + 30; x < p.x + p.w - 20; x += 97) ctx.fillRect(x, p.y - 1, 6, 1);
      } else {
        // 台：線 2 本と点々の模様
        ctx.fillRect(p.x, p.y, p.w, 2);
        ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);
        for (let x = p.x + 4; x < p.x + p.w - 2; x += 8) ctx.fillRect(x, p.y + 6, 2, 2);
      }
    }
    // 穴のふち
    const pit = STAGE.pit;
    ctx.fillStyle = ink;
    ctx.fillRect(pit.x - 2, 500, 2, 14);
    ctx.fillRect(pit.x + pit.w, 500, 2, 14);
  }

  // アイテムボックスと、サボテン・プテラ
  drawItems(ctx, now) {
    const l = this.latest;
    if (!l) return;
    const ink = this.ink;
    for (const box of l.box || []) {
      const bob = Math.sin(now / 160 + box.id) * 3;
      drawSprite(ctx, 'item', ink, box.x - 12, box.y - 30 + bob, 2);
    }
    const age = Math.min(0.2, (now - (this.latestAt || now)) / 1000);
    const flap = Math.floor(now / 150) % 2 ? 'ptera1' : 'ptera2';
    for (const hz of l.hz || []) {
      const owner = this.players.get(hz.o);
      const color = owner && owner.color !== INK ? owner.color : '#c0392b';
      if (hz.k === 'cactus') {
        drawSprite(ctx, 'cactusL', color, hz.x - 12, hz.y - 50, 2);
      } else {
        // プテラは左向きの絵なので、右に飛ぶときは反転
        drawSprite(ctx, flap, color, hz.x + hz.vx * age - 23, hz.y - 14, 2, hz.vx > 0);
      }
    }
  }

  drawFighter(ctx, id, p, now, isMe = false) {
    const info = this.players.get(id) || { color: INK, name: '?' };
    // 夜モード（サドンデス）ではクラシック色を明るくする
    const color = info.color === INK ? this.ink : info.color;
    let name = 'dino_stand';
    const run = Math.floor(now / 100) % 2;
    if (p.s === STATE.RUN) name = run ? 'dino_run1' : 'dino_run2';
    else if (p.s === STATE.BITE) name = 'dino_bite';
    else if (p.s === STATE.DUCK) name = run ? 'dino_duck1' : 'dino_duck2';
    else if (p.s === STATE.HURT || p.s === STATE.FAINT) name = 'dino_dead';
    const blink = p.inv && Math.floor(now / 80) % 2;
    // バリア
    if (p.sh) {
      ctx.strokeStyle = `rgba(47,128,237,${0.55 + 0.3 * Math.sin(now / 90)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 22, 34, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 画面端にいるときは反対側にも描く（左右がつながっている）
    const xs = [p.x];
    if (p.x < 30) xs.push(p.x + BATTLE.W);
    if (p.x > BATTLE.W - 30) xs.push(p.x - BATTLE.W);
    for (const x of xs) {
      ctx.globalAlpha = blink ? 0.4 : 1;
      const ducking = name.startsWith('dino_duck');
      drawSprite(ctx, name, color, x - (ducking ? 30 : 22), p.y - (ducking ? 26 : 44), 2, p.f < 0);
      ctx.globalAlpha = 1;
      if (p.s === STATE.BITE) {
        const base = p.f > 0 ? 0 : Math.PI;
        ctx.strokeStyle = '#e5533d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + p.f * 38, p.y - 30, 14, base - 1.2, base + 1.2);
        ctx.stroke();
      }
      const barW = 46;
      const ratio = Math.max(0, (p.hp ?? this.settings.hp) / this.settings.hp);
      const top = p.y - 60;
      ctx.fillStyle = this.sudden ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)';
      ctx.fillRect(x - barW / 2, top, barW, 6);
      ctx.fillStyle = ratio > 0.5 ? '#27ae60' : ratio > 0.25 ? '#f2994a' : '#e5533d';
      ctx.fillRect(x - barW / 2, top, barW * ratio, 6);
      // チーム戦は名前をチームの色にして、下に線を引く
      const teamColor = this.teamColor(id);
      pixelText(ctx, (isMe ? '▼' : '') + info.name, x, top - 16, { size: 12, align: 'center', color: teamColor || color, bold: !!teamColor });
      if (teamColor) {
        ctx.fillStyle = teamColor;
        ctx.fillRect(x - 16, top - 2, 32, 2);
      }
      // 気絶：頭の上をくるくる回る星
      if (p.s === STATE.FAINT) {
        for (let i = 0; i < 3; i++) {
          const a = now / 180 + (i * Math.PI * 2) / 3;
          pixelText(ctx, '★', x + Math.cos(a) * 18, p.y - 52 + Math.sin(a) * 5, { size: 12, align: 'center', color: '#ffd23f' });
        }
      }
      const bubble = this.bubbles.get(id);
      if (bubble) this.drawBubble(ctx, x, top - 22, bubble);
    }
  }

  drawBubble(ctx, x, bottom, bubble) {
    ctx.globalAlpha = Math.min(1, bubble.t * 3);
    ctx.font = '16px "DotGothic16", sans-serif';
    const w = Math.max(28, ctx.measureText(bubble.text).width + 16);
    const h = 24;
    const left = Math.max(2, Math.min(BATTLE.W - w - 2, x - w / 2));
    ctx.fillStyle = '#fff';
    ctx.fillRect(left, bottom - h, w, h);
    ctx.fillRect(x - 4, bottom, 8, 5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(left, bottom - h, w, h);
    pixelText(ctx, bubble.text, left + w / 2, bottom - h + 4, { size: 16, align: 'center', color: '#222', bold: false });
    ctx.globalAlpha = 1;
  }

  renderHud(s) {
    const html = s.p
      .map((p) => {
        const info = this.players.get(p.id) || {};
        const ratio = Math.max(0, p.hp / this.settings.hp);
        const tc = this.teamColor(p.id);
        return `<li class="${p.a ? '' : 'out'} ${p.id === this.myId ? 'me' : ''}" ${tc ? `style="border-color:${tc};box-shadow:inset 3px 0 0 ${tc}"` : ''}>
          <i style="background:${info.color}"></i><span class="nm">${escapeHtml(info.name || '?')}</span>
          <span class="hpbar"><b style="width:${ratio * 100}%"></b></span><span class="sc">${p.a ? p.hp : '✖'}</span>
        </li>`;
      })
      .join('');
    if (html !== this.lastHud) {
      this.lastHud = html;
      this.hud.innerHTML = `<ul class="standings">${html}</ul>`;
    }
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.view.destroy();
    this.controls.destroy();
    this.hud.innerHTML = '';
  }
}
