// バトルモードの物理と当たり判定（クライアント・サーバー共通）
// マリオブラザーズ風：操作は移動・ジャンプ・しゃがむ・かむ（しゃがむと細い台から降りられる）。攻撃は「ふみつけ」と「かみつき（ボタン）」の 2 つだけ。
// 体がぶつかっただけではダメージにならず、お互いはじかれる。
// 画面の左右はつながっていて、右から出ると左から出てくる。脱落は HP 0 か、下の穴に落ちたとき。
//
// ラグ対策：自分の恐竜は各端末で即座に動かし（入力遅延ゼロ）、位置をサーバーに送る。
// 攻撃の判定は「攻撃した側の画面」で行い、サーバーが距離をチェックしてダメージを確定する。

export const BATTLE = {
  W: 960,
  H: 540,
  DT: 1 / 60,
  GRAVITY: 2000,
  MAX_FALL: 950,
  RUN: 300,
  GROUND_ACC: 2600,
  AIR_ACC: 1500,
  FRICTION: 2400,
  HITSTUN_DRAG: 0.8,
  JUMP_V: 820,
  DJUMP_V: 700,
  JUMP_CUT_V: 320, // ジャンプ中にボタンを離したときの上昇速度の上限（押し加減で高さが変わる）
  JUMPS: 1, // ジャンプ回数（マリオブラザーズと同じ 1 段。2 にすると空中でもう 1 回跳べる）
  BODY_W: 40,
  BODY_H: 44,
  DUCK_H: 26,
  SPAWN_INVULN: 1.5,
  HIT_INVULN: 0.5,
  SUDDEN_DEATH_TIME: 30,
  // ふみつけ：落下中に相手の頭に乗る。踏まれた側は吹っ飛ばずに一定時間気絶する
  STOMP: { dmg: 10, bounce: 640, cooldown: 0.3, faint: 1.0 },
  // かみつき：ボタンを押すと口の前に当たり判定が出る。HP が減るほど遠くに吹っ飛ぶ
  BITE: { dmg: 12, startup: 0.07, active: 0.12, recovery: 0.2, range: 44, kb: 320, kbScale: 700, angle: 0.55 },
  // 体がぶつかったとき：お互いはじかれる（ダメージなし）
  BUMP: { speed: 280, hop: 160, time: 0.18 },
  // サーバー側の判定許容範囲（通信遅延ぶんのずれを許す）
  HIT_TOLERANCE: 150,
};

export const STAGE = {
  platforms: [
    // 床（真ん中が穴）
    { x: 0, y: 500, w: 380, h: 40, solid: true },
    { x: 580, y: 500, w: 380, h: 40, solid: true },
    // 1 段目
    { x: 0, y: 380, w: 340, h: 14 },
    { x: 620, y: 380, w: 340, h: 14 },
    // 2 段目（左右の小さい足場は画面端でつながっている）
    { x: 0, y: 260, w: 120, h: 14 },
    { x: 840, y: 260, w: 120, h: 14 },
    { x: 270, y: 260, w: 420, h: 14 },
  ],
  pit: { x: 380, w: 200 },
  killY: 640,
  spawns: [
    { x: 120, y: 500, facing: 1 },
    { x: 840, y: 500, facing: -1 },
    { x: 170, y: 380, facing: 1 },
    { x: 790, y: 380, facing: -1 },
    { x: 400, y: 260, facing: 1 },
    { x: 560, y: 260, facing: -1 },
  ],
};

export const STATE = { IDLE: 0, RUN: 1, AIR: 2, BITE: 3, HURT: 4, FAINT: 5, DUCK: 6 };

export function wrapX(x) {
  const W = BATTLE.W;
  return ((x % W) + W) % W;
}

// 左右がつながっているので、近い方向の差分を返す
export function wrapDx(ax, bx) {
  let d = bx - ax;
  if (d > BATTLE.W / 2) d -= BATTLE.W;
  if (d < -BATTLE.W / 2) d += BATTLE.W;
  return d;
}

function approach(v, target, amount) {
  if (v < target) return Math.min(target, v + amount);
  if (v > target) return Math.max(target, v - amount);
  return v;
}

export function createFighter(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    prevY: spawn.y,
    vx: 0,
    vy: 0,
    facing: spawn.facing || 1,
    onGround: true,
    jumps: BATTLE.JUMPS,
    hitstun: 0,
    invuln: BATTLE.SPAWN_INVULN,
    stompCd: 0,
    atk: -1, // かみつきの経過時間（-1 は未使用）
    bumpT: 0,
    ducking: false,
    platform: null,
    dropT: 0, // 台から降りている途中（この間は細い台に着地しない）
    jumping: false, // 自分のジャンプで上昇中（ボタンを離すと低くなる）
  };
}

// 1 ステップ進める。inp = { l, r, down(押している間), jump(押した瞬間), jumpHeld(押している間), bite(押した瞬間) }
// jumpHeld を省略すると押しっぱなし扱い（CPU は常に最大の高さで跳ぶ）
export function stepFighter(f, inp, dt = BATTLE.DT) {
  const B = BATTLE;
  f.hitstun = Math.max(0, f.hitstun - dt);
  if (f.hitstun <= 0) f.faint = false;
  f.invuln = Math.max(0, f.invuln - dt);
  f.stompCd = Math.max(0, f.stompCd - dt);
  f.bumpT = Math.max(0, f.bumpT - dt);
  f.dropT = Math.max(0, f.dropT - dt);
  if (f.atk >= 0) {
    f.atk += dt;
    if (f.atk > B.BITE.startup + B.BITE.active + B.BITE.recovery) f.atk = -1;
  }

  const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  let jumped = false;
  f.ducking = false;
  if (f.hitstun <= 0 && inp.down && f.onGround) {
    if (f.platform && !f.platform.solid) {
      // 細い台の上でしゃがむ → 下に降りる
      f.dropT = 0.25;
      f.onGround = false;
      f.platform = null;
      f.y += 2;
    } else {
      // 床の上ではしゃがむだけ（その場で止まる）
      f.ducking = true;
    }
  }
  if (f.hitstun <= 0) {
    if (inp.jump && f.jumps > 0) {
      f.vy = -(f.onGround ? B.JUMP_V : B.DJUMP_V);
      f.jumps--;
      f.onGround = false;
      f.jumping = true;
      jumped = true;
    }
    if (inp.bite && f.atk < 0) {
      f.atk = 0;
      f.bitten = new Set();
    }
    const acc = (f.onGround ? B.GROUND_ACC : B.AIR_ACC) * dt;
    if (f.bumpT > 0) {
      // はじかれている間は操作が効かない
    } else if (f.ducking) {
      f.vx = approach(f.vx, 0, B.FRICTION * dt);
    } else if (dir !== 0) {
      f.vx = approach(f.vx, dir * B.RUN, acc);
      f.facing = dir;
    } else {
      f.vx = approach(f.vx, 0, (f.onGround ? B.FRICTION : B.AIR_ACC * 0.3) * dt);
    }
  } else {
    f.vx *= 1 - B.HITSTUN_DRAG * dt;
    if (f.onGround) f.vx = approach(f.vx, 0, B.FRICTION * 0.5 * dt);
  }

  // 上昇中にジャンプボタンを離したら、それ以上高く上がらないようにする
  if (f.jumping) {
    if (f.vy >= 0 || f.hitstun > 0) f.jumping = false;
    else if (inp.jumpHeld === false && f.vy < -B.JUMP_CUT_V) {
      f.vy = -B.JUMP_CUT_V;
      f.jumping = false;
    }
  }
  f.vy += B.GRAVITY * dt;
  if (f.vy > B.MAX_FALL && f.hitstun <= 0) f.vy = B.MAX_FALL;

  const wasOnGround = f.onGround;
  f.prevY = f.y;
  const prevTop = f.y - B.BODY_H;
  f.x = wrapX(f.x + f.vx * dt);
  f.y += f.vy * dt;
  collidePlatforms(f, prevTop);
  if (wasOnGround && !f.onGround && !jumped) f.jumps = Math.min(f.jumps, B.JUMPS - 1);
  return jumped;
}

function collidePlatforms(f, prevTop) {
  const B = BATTLE;
  const half = B.BODY_W / 2;
  f.onGround = false;
  f.platform = null;
  for (const p of STAGE.platforms) {
    if (!p.solid && f.dropT > 0) continue;
    // 画面端をまたいでいるときは反対側の座標でも判定する
    for (const shift of [0, -B.W, B.W]) {
      const x = f.x + shift;
      if (x + half <= p.x || x - half >= p.x + p.w) continue;
      if (f.prevY <= p.y + 0.5 && f.y >= p.y && f.vy >= 0) {
        f.y = p.y;
        f.vy = 0;
        f.onGround = true;
        f.platform = p;
        f.jumps = B.JUMPS;
      } else if (p.solid && f.y > p.y && f.y - B.BODY_H < p.y + p.h) {
        if (prevTop >= p.y + p.h - 1) {
          f.y = p.y + p.h + B.BODY_H;
          if (f.vy < 0) f.vy = 0;
        } else {
          const nx = x < p.x + p.w / 2 ? p.x - half : p.x + p.w + half;
          f.x = wrapX(nx - shift);
          f.vx = 0;
        }
      }
    }
  }
}

export function fighterState(f) {
  if (f.hitstun > 0) return f.faint ? STATE.FAINT : STATE.HURT;
  if (biteActive(f) || (f.atk >= 0 && f.atk < BATTLE.BITE.startup)) return STATE.BITE;
  if (!f.onGround) return STATE.AIR;
  if (f.ducking) return STATE.DUCK;
  if (Math.abs(f.vx) > 20) return STATE.RUN;
  return STATE.IDLE;
}

// a が b をふみつけたか（b は x, y だけあればよい）
export function stompCheck(a, b) {
  if (a.onGround || a.vy <= 100) return false;
  const headY = b.y - BATTLE.BODY_H;
  return Math.abs(wrapDx(a.x, b.x)) < BATTLE.BODY_W * 0.8 && a.y >= headY - 4 && a.prevY <= headY + 12;
}

export function biteActive(f) {
  const B = BATTLE.BITE;
  return f.atk >= B.startup && f.atk < B.startup + B.active;
}

// a のかみつきが b に当たったか（b は x, y だけあればよい）
export function biteCheck(a, b) {
  if (!biteActive(a)) return false;
  const W = BATTLE.BODY_W;
  const H = BATTLE.BODY_H;
  const range = BATTLE.BITE.range;
  const dx = wrapDx(a.x, b.x); // a から見た b の位置
  const hbLeft = a.facing > 0 ? 4 : -4 - range;
  const hbTop = a.y - H + 2;
  return hbLeft < dx + W / 2 && hbLeft + range > dx - W / 2 && hbTop < b.y && hbTop + 28 > b.y - H;
}

// かみつきで吹っ飛ばす：HP が減るほど遠くへ
export function biteKnockback(dir, hpAfter, maxHp) {
  const B = BATTLE.BITE;
  return knockback(dir, hpAfter, maxHp, B.kb, B.kbScale, B.angle);
}

// HP が減るほど強くなる吹っ飛ばし（かみつき・アイテム共通）
export function knockback(dir, hpAfter, maxHp, base, scale, angle) {
  const ratio = 1 - Math.max(0, hpAfter) / maxHp;
  const k = base + scale * ratio;
  return {
    vx: Math.round(dir * k * Math.cos(angle)),
    vy: Math.round(-k * Math.sin(angle)),
    stun: Math.round((0.12 + k / 1500) * 1000) / 1000,
  };
}

// ---------- アイテム ----------
// 一定時間ごとにランダムな台の上にアイテムボックスが出る。触れると取れて、アイテムボタンで使う
export const BATTLE_ITEMS = {
  FIRST: 4, // 最初のボックスが出るまでの秒数
  INTERVAL: 7, // 次のボックスが出るまでの秒数
  MAX: 2, // 同時に出ているボックスの最大数
  BOX: 24,
  TYPES: ['shield', 'cactus', 'ptera', 'meat'],
  SHIELD_TIME: 10, // バリア：この間に受けた攻撃を 1 回だけ防ぐ
  HEAL: 10, // おにく：HP 回復量（サドンデス中は回復しない）
  // サボテン：足元に置く罠。置いた人以外が触れるとダメージ + 吹っ飛び
  CACTUS: { time: 12, dmg: 8, w: 24, h: 50, kb: 260, kbScale: 360, angle: 0.6 },
  // プテラ：一番近い相手の頭の高さを狙って画面を横切る。しゃがめばよけられる
  PTERA: { speed: 420, dmg: 10, w: 46, h: 20, kb: 300, kbScale: 500, angle: 0.35 },
};

export const BATTLE_ITEM_LABELS = { shield: 'バリア', cactus: 'サボテン', ptera: 'プテラ', meat: 'おにく' };

// 恐竜の体の当たり判定（しゃがんでいると低くなる）
export function bodyRect(x, y, ducking = false) {
  const h = ducking ? BATTLE.DUCK_H : BATTLE.BODY_H;
  return { x: x - BATTLE.BODY_W / 2, y: y - h, w: BATTLE.BODY_W, h };
}

// 左右がつながっていることを考えた矩形の重なり判定
export function rectsOverlap(a, b) {
  const dx = wrapDx(a.x + a.w / 2, b.x + b.w / 2);
  return Math.abs(dx) < (a.w + b.w) / 2 && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function boxRect(box) {
  const S = BATTLE_ITEMS.BOX;
  return { x: box.x - S / 2, y: box.y - S - 6, w: S, h: S };
}

export function hazardRect(hz) {
  if (hz.k === 'cactus') {
    const C = BATTLE_ITEMS.CACTUS;
    return { x: hz.x - C.w / 2, y: hz.y - C.h, w: C.w, h: C.h };
  }
  const P = BATTLE_ITEMS.PTERA;
  return { x: hz.x - P.w / 2, y: hz.y - P.h / 2, w: P.w, h: P.h };
}

// x の真下（y より下）にある一番上の足場。なければ null（＝穴）
export function groundBelow(x, y) {
  const px = wrapX(x);
  let best = null;
  for (const p of STAGE.platforms) {
    if (px >= p.x && px <= p.x + p.w && p.y >= y - 1 && (!best || p.y < best.y)) best = p;
  }
  return best;
}

// 体どうしがぶつかったら f をはじく（ダメージなし）。o は x, y だけあればよい
export function bodyBump(f, o) {
  if (f.bumpT > 0) return false;
  const B = BATTLE;
  const dx = wrapDx(f.x, o.x);
  const dy = o.y - f.y;
  if (Math.abs(dx) >= B.BODY_W || Math.abs(dy) >= B.BODY_H * 0.6) return false;
  const dir = dx === 0 ? -f.facing : -Math.sign(dx);
  f.vx = dir * B.BUMP.speed;
  if (f.onGround) {
    f.vy = -B.BUMP.hop;
    f.onGround = false;
  }
  f.bumpT = B.BUMP.time;
  return true;
}

// ふみつけられた側への効果：吹っ飛ばずにその場で気絶
export function stompEffect() {
  return { vx: 0, vy: 0, stun: BATTLE.STOMP.faint, faint: true };
}

export function applyKnockback(f, kb) {
  f.vx = kb.vx;
  f.vy = Math.max(kb.vy, kb.faint ? f.vy : -Infinity);
  f.hitstun = kb.stun;
  f.faint = !!kb.faint;
  if (!kb.faint) f.onGround = false;
  f.jumps = Math.max(f.jumps, BATTLE.JUMPS - 1); // 2 段ジャンプ設定のときだけ空中ジャンプを回復
  f.invuln = BATTLE.HIT_INVULN;
  f.atk = -1;
}
