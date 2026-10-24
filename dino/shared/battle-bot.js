// バトルの CPU。操作は人間と同じ「左右移動・ジャンプ・しゃがむ・かむ」
// 攻撃は 2 つ：目の前の相手には「かむ」、少し離れていればジャンプして真上から「ふみつけ」。上から踏まれそうなら逃げる。穴には落ちない
import { BATTLE, STAGE, wrapDx, groundBelow } from './battle-sim.js';

export function createBattleBrain(skill = 0.6) {
  return { skill, jumpCd: 0.5, wander: 0, wanderDir: 1, detour: 0, detourDir: 1, runup: 0, runupDir: 1, biteCd: 0.6 };
}

// fighters: [{ id, alive, team, body }] / boxes: アイテムボックス [{ x, y }]
// チーム戦（team が 0 / 1）のときは、同じチームを狙わない
export function battleBotInput(fighters, me, brain, boxes = []) {
  const inp = { l: false, r: false, down: false, jump: false, bite: false };
  const b = me.body;
  const dt = BATTLE.DT;
  brain.jumpCd -= dt;
  brain.wander -= dt;
  brain.detour -= dt;
  brain.runup -= dt;
  brain.biteCd -= dt;
  const pit = STAGE.pit;
  const jump = () => {
    if (brain.jumpCd <= 0 && b.jumps > 0) {
      inp.jump = true;
      brain.jumpCd = 0.35 + Math.random() * 0.3;
    }
  };

  // 空中で真下に床がない → 近い岸へ戻る
  if (!b.onGround && !groundBelow(b.x, b.y)) {
    if (b.x < pit.x + pit.w / 2) inp.l = true;
    else inp.r = true;
    return inp;
  }
  if (b.hitstun > 0) return inp;

  const isEnemy = (o) => o !== me && o.alive && (me.team == null || o.team !== me.team);
  // 上から落ちてくる相手がいる → 横に逃げる
  for (const o of fighters) {
    if (!isEnemy(o)) continue;
    const odx = wrapDx(b.x, o.body.x);
    const ody = o.body.y - b.y;
    if (ody < -20 && ody > -160 && Math.abs(odx) < 70 && o.body.vy > 0 && Math.random() < brain.skill) {
      if (odx > 0) inp.l = true;
      else inp.r = true;
      return inp;
    }
  }

  let target = null;
  let best = Infinity;
  for (const o of fighters) {
    if (!isEnemy(o)) continue;
    const d = Math.hypot(wrapDx(b.x, o.body.x), o.body.y - b.y);
    if (d < best) {
      best = d;
      target = o.body;
    }
  }

  let dir = 0;
  if (target) {
    const dx = wrapDx(b.x, target.x);
    const dy = target.y - b.y;
    if (Math.abs(dx) > 10) dir = Math.sign(dx);
    // 目の前にいる → かむ（相手の方を向いていれば）
    if (Math.abs(dx) < 75 && Math.abs(dy) < 30 && Math.sign(dx) === b.facing && brain.biteCd <= 0 && b.atk < 0) {
      inp.bite = true;
      brain.biteCd = 0.35 + Math.random() * 0.6 * (1.2 - brain.skill);
    }
    // 同じ高さで近い → ジャンプして上から踏みにいく
    if (b.onGround && Math.abs(dx) > 60 && Math.abs(dx) < 160 && Math.abs(dy) < 30 && Math.random() < 0.03 + brain.skill * 0.06) jump();
    // 空中で相手より上にいる → 相手の真上に寄せる（近すぎたら止まって真下に落ちる）
    if (!b.onGround && dy > 0) dir = Math.abs(dx) > 8 ? Math.sign(dx) : 0;
    // 上にいる → 飛び乗る
    if (b.onGround && dy < -60 && Math.abs(dx) < 170) jump();
    // 真上・真下にいて届かない → しばらく横に回り込む（足場の端から降りる / 横から登る）
    if (Math.abs(dy) > 40 && Math.abs(dx) < 80 && brain.detour <= 0) {
      brain.detour = 0.7 + Math.random() * 0.5;
      brain.detourDir = Math.random() < 0.5 ? -1 : 1;
    }
    if (brain.detour > 0 && Math.abs(dy) > 40) dir = brain.detourDir;
    // 下にいる相手には、細い台からしゃがんで降りる
    if (b.onGround && b.platform && !b.platform.solid && dy > 50 && Math.abs(dx) < 220 && Math.random() < 0.06) {
      inp.down = true;
      return inp;
    }
  } else {
    if (brain.wander <= 0) {
      brain.wander = 1 + Math.random() * 2;
      brain.wanderDir = Math.random() < 0.5 ? -1 : 1;
    }
    dir = brain.wanderDir;
  }
  // アイテムを持っていなくて、近くの同じ高さにボックスがある → 取りにいく（相手が目の前のときは除く）
  if (!me.held && b.onGround) {
    const near = target ? Math.abs(wrapDx(b.x, target.x)) < 80 && Math.abs(target.y - b.y) < 30 : false;
    for (const box of boxes) {
      const bdx = wrapDx(b.x, box.x);
      if (!near && Math.abs(bdx) < 220 && Math.abs(box.y - b.y) < 30) {
        dir = Math.abs(bdx) > 4 ? Math.sign(bdx) : 0;
        break;
      }
    }
  }
  // 穴を飛び越えるための助走（いったん下がる）
  if (brain.runup > 0) dir = brain.runupDir;

  // 進む先の足元が穴 → 向こう岸の相手を十分な助走で狙うときだけ飛び越える。それ以外は止まる
  if (b.onGround && dir !== 0 && !groundBelow(b.x + dir * 28, b.y)) {
    const farEdge = dir > 0 ? pit.x + pit.w : pit.x;
    const targetAcross = target && Math.sign(wrapDx(farEdge, target.x)) === dir;
    if (targetAcross && Math.abs(b.vx) > BATTLE.RUN * 0.85) jump();
    else if (targetAcross && brain.runup <= 0) {
      brain.runup = 0.45;
      brain.runupDir = -dir;
      dir = -dir;
    } else {
      if (brain.detour > 0) brain.detourDir = -dir;
      dir = 0;
    }
  }

  if (dir > 0) inp.r = true;
  if (dir < 0) inp.l = true;
  return inp;
}
