import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceSim, RACE } from '../shared/race-sim.js';
import { createRaceBrain, raceBotInput } from '../shared/race-bot.js';
import { BATTLE, STAGE, STATE, createFighter, stepFighter, stompCheck, biteCheck, bodyBump, wrapDx, stompEffect, applyKnockback, fighterState } from '../shared/battle-sim.js';
import { BattleGame } from '../server/battle-game.js';
import { BATTLE_ITEMS } from '../shared/battle-sim.js';
import { maxPlausibleScore, sanitizeSettings } from '../shared/config.js';

const courseOf = (sim) => sim.course.map((o) => `${o.type}:${o.size}:${o.y}`).join(',');

test('同じ seed なら同じコースになる（おじゃまを受けてもずれない）', () => {
  const a = new RaceSim({ seed: 42, items: true });
  const b = new RaceSim({ seed: 42, items: true });
  const seenA = [];
  const seenB = [];
  for (let i = 0; i < 60 * 30; i++) {
    a.step({ jump: true }); // ずっとジャンプ
    b.step({});
    if (i === 300) b.receiveAttack('cactus');
    a.alive = b.alive = true; // 衝突しても走らせ続ける
    seenA.push(courseOf(a));
    seenB.push(courseOf(b));
  }
  assert.deepEqual(seenA, seenB);
});

test('何もしないと障害物にぶつかって脱落する', () => {
  const sim = new RaceSim({ seed: 7 });
  for (let i = 0; i < 60 * 30 && sim.alive; i++) sim.step({});
  assert.equal(sim.alive, false);
  assert.ok(sim.score > 0);
});

test('CPU はしばらく生き残れる', () => {
  let total = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const sim = new RaceSim({ seed });
    const brain = createRaceBrain(0.9);
    for (let i = 0; i < 60 * 120 && sim.alive; i++) sim.step(raceBotInput(sim, brain));
    total += sim.time;
  }
  assert.ok(total / 5 > 15, `平均生存時間 ${total / 5}s`);
});

test('スコア上限チェックは実際のプレイを弾かない', () => {
  const sim = new RaceSim({ seed: 3 });
  const brain = createRaceBrain(1);
  for (let i = 0; i < 60 * 60 && sim.alive; i++) sim.step(raceBotInput(sim, brain));
  assert.ok(sim.score <= maxPlausibleScore(sim.time));
  assert.ok(maxPlausibleScore(10) < 200);
});

test('設定値の検証', () => {
  assert.deepEqual(sanitizeSettings('race', { lives: 99, items: false }), { maxPlayers: 8, lives: 1, items: false });
  assert.equal(sanitizeSettings('nope', {}), null);
});

function fakeRoom() {
  const sent = [];
  return { sent, broadcast: (type, data) => sent.push({ type, ...data }), sendTo() {}, endGame() {} };
}

test('バトル: CPU 同士で決着がつき、数値が壊れない', () => {
  const players = [1, 2, 3, 4].map((i) => ({ id: `b${i}`, name: `b${i}`, color: '#000', bot: true, skill: 0.8 }));
  const room = fakeRoom();
  const game = new BattleGame(room, players, { hp: 100, timeLimit: 60 }, { autoStart: false });
  let steps = 0;
  while (!game.over && steps < 60 * 120) {
    game.tick(true);
    steps++;
    for (const f of game.fighters.values()) assert.ok(Number.isFinite(f.body.x) && Number.isFinite(f.body.y));
  }
  game.destroy();
  assert.ok(game.over, 'game should end');
  assert.deepEqual(game.results().map((r) => r.place).sort(), [1, 2, 3, 4]);
  assert.ok(room.sent.some((m) => m.type === 'battle:hit'), 'CPU が攻撃している');
});

test('バトル: 足場に着地できる', () => {
  const f = createFighter({ x: 480, y: 100 });
  f.onGround = false;
  for (let i = 0; i < 120; i++) stepFighter(f, {});
  assert.ok(f.onGround);
  assert.equal(f.y, 260);
});

test('バトル: 右端から出ると左端から出てくる', () => {
  const f = createFighter({ x: BATTLE.W - 5, y: 500 });
  for (let i = 0; i < 10; i++) stepFighter(f, { r: true });
  assert.ok(f.x < 50, `x=${f.x}`);
  assert.ok(f.onGround, '端をまたいでも床に立っている');
  assert.equal(wrapDx(950, 10), 20);
});

test('バトル: 穴に落ちる', () => {
  const f = createFighter({ x: 480, y: 500 });
  f.onGround = false;
  for (let i = 0; i < 60; i++) stepFighter(f, {});
  assert.ok(f.y > STAGE.killY);
});

test('バトル: ふみつけの判定', () => {
  const a = { x: 100, y: 456, prevY: 454, vy: 400, vx: 0, onGround: false };
  assert.ok(stompCheck(a, { x: 105, y: 500 }));
  assert.ok(!stompCheck({ ...a, vy: -100 }, { x: 105, y: 500 }), '上昇中は踏めない');
  assert.ok(!stompCheck({ ...a, y: 500, prevY: 498 }, { x: 105, y: 500 }), '横からぶつかっても攻撃にならない');
  assert.ok(stompCheck({ ...a, x: 955 }, { x: 5, y: 500 }), '画面端をまたいでも踏める');
});

test('バトル: 遠すぎる攻撃・無敵中の攻撃はサーバーが無効にする', () => {
  const room = fakeRoom();
  const players = [{ id: 'a' }, { id: 'b' }].map((p) => ({ ...p, name: p.id, color: '#000' }));
  const game = new BattleGame(room, players, { hp: 100, timeLimit: 60 }, { autoStart: false });
  game.startAt = 0;
  const client = { id: 'a' };
  game.handle({ id: 'b' }, { type: 'battle:state', x: 300, y: 500 });
  game.handle(client, { type: 'battle:hit', to: 'b', kind: 'stomp', x: 290, y: 460 });
  assert.equal(game.fighters.get('b').hp, 100, '開始直後の無敵中');
  game.time = 2;
  game.handle(client, { type: 'battle:hit', to: 'b', kind: 'stomp', x: 700, y: 460 });
  assert.equal(game.fighters.get('b').hp, 100, '遠すぎる');
  game.handle(client, { type: 'battle:hit', to: 'b', kind: 'stomp', x: 305, y: 460 });
  assert.equal(game.fighters.get('b').hp, 100 - BATTLE.STOMP.dmg);
  const hit = room.sent.find((m) => m.type === 'battle:hit');
  assert.ok(hit.kb.faint && hit.kb.vx === 0, '踏まれると吹っ飛ばずに気絶');
  game.handle(client, { type: 'battle:hit', to: 'b', kind: 'stomp', x: 305, y: 460 });
  assert.equal(game.fighters.get('b').hp, 100 - BATTLE.STOMP.dmg, '連続ヒットしない');
  game.handle({ id: 'b' }, { type: 'battle:state', x: 480, y: 700 });
  game.tick(true);
  assert.ok(game.over && game.fighters.get('b').place === 2, '穴に落ちて脱落');
  game.destroy();
  void RACE;
});

test('バトル: ふみつけられると約1秒気絶して動けない（吹っ飛ばない）', () => {
  const f = createFighter({ x: 200, y: 500 });
  f.invuln = 0;
  applyKnockback(f, stompEffect());
  assert.equal(fighterState(f), STATE.FAINT);
  for (let i = 0; i < 50; i++) stepFighter(f, { r: true, jump: true });
  assert.ok(Math.abs(f.x - 200) < 1 && f.onGround, '気絶中は移動もジャンプもできない');
  assert.equal(fighterState(f), STATE.FAINT);
  for (let i = 0; i < 15; i++) stepFighter(f, { r: true });
  assert.notEqual(fighterState(f), STATE.FAINT, '約1秒で回復');
  assert.ok(f.x > 200, '回復後は動ける');
});

test('バトル: かみつきはボタンを押して当てたときだけ', () => {
  const a = createFighter({ x: 100, y: 500, facing: 1 });
  const target = { x: 140, y: 500 };
  assert.ok(!biteCheck(a, target), '体が近いだけでは当たらない');
  stepFighter(a, { bite: true });
  for (let i = 0; i < 6; i++) stepFighter(a, {});
  assert.equal(fighterState(a), STATE.BITE);
  assert.ok(biteCheck({ ...a, x: 100 }, target), '口の前にいれば当たる');
  assert.ok(!biteCheck({ ...a, x: 100, facing: -1 }, target), '後ろには当たらない');
  assert.ok(biteCheck({ ...a, x: 950 }, { x: 25, y: 500 }), '画面端をまたいでも当たる');
  for (let i = 0; i < 40; i++) stepFighter(a, {});
  assert.ok(!biteCheck(a, { x: a.x + 40, y: 500 }), 'かみつきが終われば当たらない');
});

test('バトル: 体がぶつかるとお互いはじかれる（ダメージなし）', () => {
  const a = createFighter({ x: 100, y: 500 });
  const b = createFighter({ x: 130, y: 500 });
  assert.ok(bodyBump(a, b) && bodyBump(b, a));
  assert.ok(a.vx < 0 && b.vx > 0, '反対方向にはじかれる');
  assert.ok(!bodyBump(a, b), '連続ではじかれない');
  const far = createFighter({ x: 300, y: 500 });
  assert.ok(!bodyBump(far, b), '離れていれば何もしない');
  for (let i = 0; i < 5; i++) stepFighter(a, { r: true });
  assert.ok(a.vx < 0, 'はじかれている間は入力が効かない');
});

test('バトル: かみつきは吹っ飛ばし、CPU は体当たりではダメージを与えない', () => {
  const room = fakeRoom();
  const players = [{ id: 'a' }, { id: 'b' }].map((p) => ({ ...p, name: p.id, color: '#000' }));
  const game = new BattleGame(room, players, { hp: 100, timeLimit: 60 }, { autoStart: false });
  game.startAt = 0;
  game.time = 2;
  game.handle({ id: 'b' }, { type: 'battle:state', x: 300, y: 500 });
  game.handle({ id: 'a' }, { type: 'battle:hit', to: 'b', kind: 'bite', x: 265, y: 500 });
  const hit = room.sent.find((m) => m.type === 'battle:hit');
  assert.equal(game.fighters.get('b').hp, 100 - BATTLE.BITE.dmg);
  assert.ok(hit.kb.vx > 0 && hit.kb.vy < 0 && !hit.kb.faint, '攻撃した方向に吹っ飛ぶ');
  game.destroy();

  // CPU 同士を密着させても、かむ・踏むをしない限り HP は減らない
  const bots = [1, 2].map((i) => ({ id: `c${i}`, name: 'c', color: '#000', bot: true, skill: 0.5 }));
  const g2 = new BattleGame(fakeRoom(), bots, { hp: 100, timeLimit: 60 }, { autoStart: false });
  const [c1, c2] = [...g2.fighters.values()];
  c1.body.x = 200;
  c2.body.x = 225;
  c1.body.y = c2.body.y = 500;
  c1.brain.biteCd = c2.brain.biteCd = 99;
  c1.brain.jumpCd = c2.brain.jumpCd = 99;
  for (let i = 0; i < 30; i++) g2.tick(true);
  assert.equal(c1.hp + c2.hp, 200, '体当たりではダメージなし');
  assert.ok(Math.abs(wrapDx(c1.body.x, c2.body.x)) >= 30, 'はじかれて離れる');
  g2.destroy();
});

test('バトル: 細い台の上でしゃがむと下に降りられる / 床の上ではしゃがむだけ', () => {
  const f = createFighter({ x: 480, y: 260 }); // 2 段目の台の上
  stepFighter(f, {});
  assert.ok(f.onGround && f.y === 260);
  for (let i = 0; i < 40; i++) stepFighter(f, { down: i < 2 });
  assert.ok(f.y > 260, `台をすり抜けて下に降りる y=${f.y}`);

  const g = createFighter({ x: 120, y: 500 }); // 床（穴の手前）
  stepFighter(g, {});
  for (let i = 0; i < 30; i++) stepFighter(g, { down: true, r: true });
  assert.equal(g.y, 500, '床はすり抜けない');
  assert.ok(Math.abs(g.x - 120) < 1, 'しゃがんでいる間は動かない');
  assert.equal(fighterState(g), STATE.DUCK);
});

test('バトル: アイテムボックスが出て、触れると取れる', () => {
  const room = fakeRoom();
  const players = [{ id: 'a' }, { id: 'b' }].map((p) => ({ ...p, name: p.id, color: '#000' }));
  const game = new BattleGame(room, players, { hp: 100, timeLimit: 120, items: true }, { autoStart: false });
  game.startAt = 0;
  for (let i = 0; i < 60 * 5; i++) game.tick(true);
  assert.equal(game.boxes.length, 1, '数秒でボックスが出る');
  const box = game.boxes[0];
  game.handle({ id: 'a' }, { type: 'battle:state', x: box.x, y: box.y });
  game.tick(true);
  assert.equal(game.boxes.length, 0);
  assert.ok(BATTLE_ITEMS.TYPES.includes(game.fighters.get('a').held), 'アイテムを持つ');
  const snap = game.snapshot();
  assert.equal(snap.p.find((p) => p.id === 'a').it, game.fighters.get('a').held);
  game.destroy();

  const off = new BattleGame(fakeRoom(), players, { hp: 100, timeLimit: 120, items: false }, { autoStart: false });
  for (let i = 0; i < 60 * 10; i++) off.tick(true);
  assert.equal(off.boxes.length, 0, 'アイテムOFFなら出ない');
  off.destroy();
});

test('バトル: おにく・バリア・サボテン・プテラの効果', () => {
  const room = fakeRoom();
  const players = [{ id: 'a' }, { id: 'b' }, { id: 'c' }].map((p) => ({ ...p, name: p.id, color: '#000' }));
  const game = new BattleGame(room, players, { hp: 100, timeLimit: 120, items: true }, { autoStart: false });
  game.startAt = 0;
  game.time = 2;
  const [a, b, c] = ['a', 'b', 'c'].map((id) => game.fighters.get(id));
  const put = (id, x, y, s = 0) => game.handle({ id }, { type: 'battle:state', x, y, s });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) game.updateItems();
    game.time += 0.6; // 無敵時間を明ける
  };

  // おにく：回復
  a.hp = 50;
  a.held = 'meat';
  game.handle({ id: 'a' }, { type: 'battle:item' });
  assert.equal(a.hp, 50 + BATTLE_ITEMS.HEAL);
  assert.equal(a.held, null);

  // バリア：1 回だけ防ぐ
  b.held = 'shield';
  game.handle({ id: 'b' }, { type: 'battle:item' });
  put('a', 100, 500);
  put('b', 130, 500);
  game.handle({ id: 'a' }, { type: 'battle:hit', to: 'b', kind: 'bite', x: 100, y: 500 });
  assert.equal(b.hp, 100, 'バリアで防いだ');
  assert.ok(room.sent.some((m) => m.type === 'battle:hit' && m.blocked));
  game.time += 1;
  game.handle({ id: 'a' }, { type: 'battle:hit', to: 'b', kind: 'bite', x: 100, y: 500 });
  assert.equal(b.hp, 100 - BATTLE.BITE.dmg, '2 回目は防げない');

  // サボテン：置いた人は平気、ほかの人はダメージ
  put('c', 700, 500);
  c.held = 'cactus';
  c.body.onGround = true;
  game.handle({ id: 'c' }, { type: 'battle:item' });
  tick();
  assert.equal(c.hp, 100, '置いた本人は当たらない');
  const aHp = a.hp;
  put('a', 705, 500);
  tick();
  assert.equal(a.hp, aHp - BATTLE_ITEMS.CACTUS.dmg, '触れるとダメージ');

  // プテラ：立っている相手に当たり、しゃがんでいればよけられる
  put('a', 200, 380); // 1 段目の台
  put('b', 800, 380, STATE.DUCK);
  a.held = 'ptera';
  const bHp = b.hp;
  game.handle({ id: 'c' }, { type: 'battle:state', x: 700, y: 500 });
  c.held = 'ptera';
  game.handle({ id: 'c' }, { type: 'battle:item' }); // c に一番近いのは b（しゃがみ中）
  for (let i = 0; i < 200; i++) game.updateItems();
  assert.equal(b.hp, bHp, 'しゃがんでいればプテラはよけられる');
  put('b', 800, 380, STATE.IDLE);
  c.held = 'ptera';
  game.time += 1;
  game.handle({ id: 'c' }, { type: 'battle:item' });
  for (let i = 0; i < 200; i++) game.updateItems();
  assert.equal(b.hp, bHp - BATTLE_ITEMS.PTERA.dmg, '立っていると当たる');
  game.destroy();
});

test('バトル: ジャンプは押し加減で高さが変わる', () => {
  const peak = (holdSteps) => {
    const f = createFighter({ x: 120, y: 500 });
    stepFighter(f, {});
    let top = f.y;
    for (let i = 0; i < 90; i++) {
      stepFighter(f, { jump: i === 0, jumpHeld: i < holdSteps });
      top = Math.min(top, f.y);
    }
    return 500 - top;
  };
  const tap = peak(2);
  const mid = peak(12);
  const full = peak(90);
  assert.ok(tap < mid && mid < full, `tap=${tap} mid=${mid} full=${full}`);
  assert.ok(full > 140, '長押しなら上の台に届く高さ');
  assert.ok(tap < 70, 'すぐ離すと低い');
  // jumpHeld を渡さない（CPU）は最大の高さ
  const f = createFighter({ x: 120, y: 500 });
  stepFighter(f, {});
  let top = f.y;
  for (let i = 0; i < 90; i++) {
    stepFighter(f, { jump: i === 0 });
    top = Math.min(top, f.y);
  }
  assert.equal(Math.round(500 - top), Math.round(full));
});

test('バトル: チーム戦は味方に攻撃が当たらず、相手チームが全滅したら勝ち', () => {
  const room = fakeRoom();
  const players = [0, 1, 2, 3].map((i) => ({ id: `t${i}`, name: `t${i}`, color: '#000', bot: true, skill: 0.8, team: i % 2 }));
  const game = new BattleGame(room, players, { hp: 100, timeLimit: 120, items: true }, { autoStart: false });
  // 赤チームは左、青チームは右から出る
  const [a0, b0] = [game.fighters.get('t0'), game.fighters.get('t1')];
  assert.ok(a0.body.x < BATTLE.W / 2 && b0.body.x > BATTLE.W / 2);
  // 味方への攻撃は無効
  game.time = 2;
  assert.equal(game.tryHit(game.fighters.get('t0'), game.fighters.get('t2'), 'bite'), false);
  assert.equal(game.fighters.get('t2').hp, 100);

  let steps = 0;
  while (!game.over && steps < 60 * 200) {
    game.tick(true);
    steps++;
  }
  game.destroy();
  assert.ok(game.over);
  const team = (id) => game.fighters.get(id).team;
  const friendly = room.sent.filter((m) => m.type === 'battle:hit' && team(m.from) === team(m.to));
  assert.equal(friendly.length, 0, '味方への攻撃は一度もない');
  assert.ok(game.winnerTeam === 0 || game.winnerTeam === 1);
  for (const r of game.results()) assert.equal(r.place, r.team === game.winnerTeam ? 1 : 2);
});
