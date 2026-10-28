// アソビ大全から入れたゲームのテスト
import assert from 'node:assert/strict';
import * as morris from '../public/games/morris.js';
import * as hex from '../public/games/hex.js';
import * as checkers from '../public/games/checkers.js';
import * as domino from '../public/games/domino.js';
import * as ccheckers from '../public/games/ccheckers.js';
import * as ludo from '../public/games/ludo.js';
import * as sevens from '../public/games/sevens.js';
import * as speed from '../public/games/speed.js';
import * as memory from '../public/games/memory.js';
import * as blackjack from '../public/games/blackjack.js';
import * as lastcard from '../public/games/lastcard.js';
import * as pigtail from '../public/games/pigtail.js';
import * as yacht from '../public/games/yacht.js';
import * as koikoi from '../public/games/koikoi.js';
import * as tanks from '../public/games/tanks.js';
import * as hbball from '../public/games/hbball.js';
import * as chinchiro from '../public/games/chinchiro.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok -', name); };

// 決まった乱数（毎回同じ結果になる）
function seeded(seed) {
  let a = seed >>> 0;
  return (k = 6) => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return 1 + Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * k);
  };
}
// 時計をあやつる（tickAt を使うゲーム）
let clock = 1_000_000;
Date.now = () => clock;

// 全員 CPU で最後まで遊ぶ。終わった状態を返す
function playOut(mod, players, options = {}, seed = 1, maxSteps = 20000) {
  const rng = seeded(seed);
  const ctx = { hostSeat: 0, online: Array(players).fill(true), bots: Array(players).fill(true) };
  let s = mod.init(options, players, rng, ctx);
  for (let step = 0; step < maxSteps; step++) {
    if (s.result) return s;
    let moved = false;
    const seats = [s.turn, ...[...Array(players).keys()].filter((p) => p !== s.turn)];
    if (mod.aiMove) {
      for (const p of seats) {
        if (s.turn !== p && !mod.canActOutOfTurn?.(s)) continue;
        const mv = mod.aiMove(s, p, rng);
        if (!mv) continue;
        s = mod.applyMove(s, mv, p, rng, ctx);
        moved = true;
        break;
      }
    }
    if (moved) continue;
    if (s.tickAt || s.tickAfter) {
      clock = s.tickAt ? Math.max(clock, s.tickAt) : clock + s.tickAfter;
      s = mod.tick(s, rng, ctx);
      continue;
    }
    throw new Error(`${mod.id}: だれも動けない（${JSON.stringify({ phase: s.phase, turn: s.turn })}）`);
  }
  throw new Error(`${mod.id}: ${maxSteps}手で終わらなかった`);
}

const allCpu = [
  [morris, 2], [hex, 2], [checkers, 2], [domino, 2], [domino, 4], [ccheckers, 2], [ccheckers, 3], [ccheckers, 6],
  [ludo, 2], [ludo, 4], [sevens, 3], [sevens, 6], [speed, 2], [memory, 1], [memory, 3], [blackjack, 1], [blackjack, 4],
  [lastcard, 3], [pigtail, 4], [yacht, 1], [yacht, 3], [koikoi, 2], [tanks, 2], [tanks, 4], [hbball, 1], [hbball, 3], [chinchiro, 2], [chinchiro, 5],
];
for (const [mod, players] of allCpu) {
  test(`${mod.id}: ${players}人の CPU 対戦が最後まで進む`, () => {
    for (const seed of [1, 2, 3]) {
      const s = playOut(mod, players, {}, seed, mod.id === 'tanks' ? 60000 : mod.id === 'ccheckers' ? 40000 : 20000);
      assert.ok(s.result, '結果がある');
      assert.ok(s.result.winner == null || (s.result.winner >= 0 && s.result.winner < players));
    }
  });
}

test('morris: ミルを作ると相手のコマを取る・ミルの中のコマは取れない', () => {
  let s = morris.init({});
  const mv = (m, p) => { s = morris.applyMove(s, m, p); };
  mv({ place: 0 }, 0); mv({ place: 9 }, 1); mv({ place: 1 }, 0); mv({ place: 21 }, 1);
  // 黒がミルの手前（9・21）。白が 2 に置くとミル
  mv({ place: 2 }, 0);
  assert.equal(s.removing, true);
  assert.equal(s.turn, 0);
  mv({ remove: 9 }, 0);
  assert.equal(s.board[9], null);
  assert.equal(s.turn, 1);
  // 黒が 3 4 5 でミル → 白のミル（0,1,2）の中しかなければ取れる
  assert.deepEqual(morris.removable({ ...s, turn: 1 }, 1).sort((a, b) => a - b), [0, 1, 2]);
});

test('hex: 上下（赤）・左右（青）がつながると勝ち', () => {
  let s = hex.init({ size: 7 });
  for (let r = 0; r < 7; r++) {
    s = hex.applyMove(s, { to: [r, 0] }, 0);
    if (s.result) break;
    s = hex.applyMove(s, { to: [r, 3] }, 1);
  }
  assert.equal(s.result.winner, 0);
  assert.equal(s.winPath.length, 7);
});

test('checkers: 取れるときは必ず取る・続けて跳ぶ・奥でキング', () => {
  const s = checkers.init({});
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  b[5][2] = { o: 0, k: false };
  b[4][3] = { o: 1, k: false };
  b[2][3] = { o: 1, k: false };
  b[7][0] = { o: 0, k: false };
  const t = { ...s, board: b };
  const moves = checkers.legalMoves(t);
  assert.deepEqual(moves, [[[5, 2], [3, 4], [1, 2]]], '2回続けて跳ぶ手だけ');
  const ns = checkers.applyMove(t, { path: moves[0] }, 0);
  assert.equal(ns.board[1][2].o, 0);
  assert.equal(ns.board[4][3], null);
  assert.equal(ns.board[2][3], null);
  assert.equal(ns.result.winner, 0, '相手のコマがなくなった');
  const b2 = Array.from({ length: 8 }, () => Array(8).fill(null));
  b2[1][2] = { o: 0, k: false }; b2[6][1] = { o: 1, k: false };
  const k = checkers.applyMove({ ...s, board: b2 }, { path: [[1, 2], [0, 1]] }, 0);
  assert.equal(k.board[0][1].k, true);
});

test('domino: 同じ目でつながり、置けなければ引く', () => {
  let s = domino.init({}, 2, seeded(5));
  const t0 = s.hands[0][0];
  s = domino.applyMove(s, { play: t0.id, side: 'R' }, 0);
  const [l, r] = domino.ends(s);
  assert.deepEqual([l, r], [t0.a, t0.b]);
  const hand = s.hands[1];
  if (!domino.playable(s, 1).length) {
    const before = hand.length;
    s = domino.applyMove(s, { draw: true }, 1);
    assert.equal(s.hands[1].length, before + 1);
  } else assert.throws(() => domino.applyMove(s, { draw: true }, 1), /置ける牌/);
});

test('ccheckers: 盤は121の穴、跳び越しは続けられる', () => {
  assert.equal(ccheckers.CELLS.length, 121);
  const s = ccheckers.init({}, 2);
  assert.equal(s.board.filter((x) => x === 0).length, 10);
  // 最初の陣地の先頭のコマは、となりのコマを跳び越せる
  const reach = [...s.board.keys()].filter((i) => s.board[i] === 0).map((i) => ccheckers.reach(s.board, i).size);
  assert.ok(reach.some((k) => k > 0));
});

test('ludo: 6でコマを出す・相手のコマを取る・ちょうどの目でゴール', () => {
  let s = ludo.init({}, 2);
  s = { ...s, dice: 6, rolled: true };
  assert.deepEqual(ludo.movable(s, 0), [0, 1, 2, 3]);
  s = ludo.applyMove(s, { token: 0 }, 0);
  assert.equal(s.tokens[0][0], 0);
  assert.equal(s.turn, 0, '6はもう1回');
  // 黄（席1）のコマが赤の 5 マス目（通し番号 5）にいるとき、5 で取れる
  s = { ...s, tokens: [[0, -1, -1, -1], [ (5 - 26 + 52) % 52, -1, -1, -1]], dice: 5, rolled: true, turn: 0 };
  s = ludo.applyMove(s, { token: 0 }, 0);
  assert.equal(s.tokens[1][0], -1);
  s = { ...s, tokens: [[54, 56, 56, 56], [-1, -1, -1, -1]], dice: 3, rolled: true, turn: 0 };
  assert.deepEqual(ludo.movable(s, 0), [], 'ゴールを越える目では動けない');
  s = { ...s, dice: 2 };
  s = ludo.applyMove(s, { token: 0 }, 0);
  assert.equal(s.result.winner, 0);
});

test('sevens: となりの数だけ出せる・パスしすぎるとドボン', () => {
  let s = sevens.init({ passes: 1 }, 3, seeded(2));
  const c = s.hands[0].find((x) => x.r === 6 || x.r === 8);
  if (c) assert.ok(sevens.canPlay(s, c));
  const far = s.hands[0].find((x) => x.r === 1);
  if (far) assert.ok(!sevens.canPlay(s, far));
  s = sevens.applyMove(s, { pass: true }, 0);
  s = sevens.applyMove(s, { pass: true }, 1);
  s = sevens.applyMove(s, { pass: true }, 2);
  s = sevens.applyMove(s, { pass: true }, 0);
  assert.equal(s.out[0], true, '2回目のパスでドボン');
  assert.equal(s.hands[0].length, 0);
});

test('sevens: ドボンした人のカードはその場所に置かれ、間のカードも出せる', () => {
  let s = sevens.init({ passes: 0 }, 3, seeded(4));
  const heart2 = { id: 900, s: 'h', r: 2 };
  // P1 が ♥A と ♥3 を持ったままドボン → ♥2 は ♥A と ♥3 の間に出せる
  s = { ...s, options: { passes: 0 }, hands: [[{ id: 901, s: 'h', r: 1 }, { id: 902, s: 'h', r: 3 }], [heart2, { id: 903, s: 's', r: 1 }], s.hands[2]], turn: 0 };
  s = sevens.applyMove(s, { pass: true }, 0);
  assert.equal(s.out[0], true);
  assert.ok(s.table.h[1] && s.table.h[3] && !s.table.h[2]);
  assert.ok(sevens.canPlay(s, heart2), '間の ♥2 を出せる');
  s = sevens.applyMove(s, { play: 900 }, 1);
  assert.ok(s.table.h[2]);
});

test('speed: まちがったカードを出すと1秒出せない', () => {
  let s = speed.init({}, 2, seeded(3));
  s = { ...s, phase: 'play', piles: [[{ id: 'h5', s: 'h', r: 5 }], [{ id: 's9', s: 's', r: 9 }]], field: [[{ id: 'd6', s: 'd', r: 6 }, { id: 'h1', s: 'h', r: 1 }, null, null], s.field[1]] };
  const t0 = clock;
  let t = speed.applyMove(s, { play: 1, pile: 0 }, 0); // A は 5 にも 9 にも出せない
  assert.equal(t.penalty[0], t0 + speed.PENALTY_MS);
  assert.equal(t.field[0][1].id, 'h1', 'カードは手元に残る');
  assert.equal(speed.applyMove(t, { play: 0, pile: 0 }, 0), t, 'ペナルティ中は出せない（何も変わらない）');
  clock += speed.PENALTY_MS + 1;
  t = speed.applyMove(t, { play: 0, pile: 0 }, 0); // 6 は 5 の上に出せる
  assert.equal(t.piles[0].at(-1).id, 'd6');
  clock = t0;
});

test('speed: 1つちがい（KとAはつながる）だけ出せる', () => {
  assert.ok(speed.adjacent(13, 1));
  assert.ok(speed.adjacent(5, 6));
  assert.ok(!speed.adjacent(5, 7));
});

test('memory: 同じ数字ならもらってもう一度、ちがえば次の人', () => {
  let s = memory.init({ pairs: 12 }, 2, seeded(3));
  const a = 0, b = s.cards.findIndex((c, i) => i !== 0 && c.r === s.cards[0].r);
  s = memory.applyMove(memory.applyMove(s, { flip: a }, 0), { flip: b }, 0);
  assert.equal(s.scores[0], 1);
  assert.equal(s.turn, 0);
  const x = s.cards.findIndex((c, i) => s.taken[i] == null);
  const y = s.cards.findIndex((c, i) => s.taken[i] == null && c.r !== s.cards[x].r);
  s = memory.applyMove(memory.applyMove(s, { flip: x }, 0), { flip: y }, 0);
  assert.equal(s.phase, 'show');
  s = memory.tick(s);
  assert.equal(s.turn, 1);
  assert.equal(memory.viewFor(s).cards[x], null, 'めくっていない札の中身は見えない');
});

test('blackjack: 合計の数え方と配当', () => {
  assert.equal(blackjack.total([{ r: 1 }, { r: 13 }]), 21);
  assert.equal(blackjack.total([{ r: 1 }, { r: 1 }, { r: 9 }]), 21);
  assert.equal(blackjack.total([{ r: 10 }, { r: 5 }, { r: 9 }]), 24);
  let s = blackjack.init({}, 1, seeded(4));
  s = blackjack.applyMove(s, { bet: 100 }, 0);
  assert.equal(s.phase === 'play' || s.phase === 'dealer', true);
  assert.equal(s.chips[0], 900);
  assert.equal(blackjack.viewFor(s).dealer[1] === null || s.phase !== 'play', true, 'ディーラーの2枚目は伏せる');
});

test('lastcard: 言い忘れを指摘されると2枚', () => {
  let s = lastcard.init({}, 3, seeded(9));
  const card = { id: 999, c: s.color, v: '5' };
  s = { ...s, hands: [[card, { id: 998, c: 'g', v: '1' }], ...s.hands.slice(1)], turn: 0, drawn: null };
  s = lastcard.applyMove(s, { play: 999 }, 0);
  assert.equal(s.unoPending, 0);
  s = lastcard.applyMove(s, { catchUno: 0 }, 2);
  assert.equal(s.hands[0].length, 3);
});

test('lastcard: ドロー2・ドロー4は重ねられて、重ねられなかった人がまとめて引く', () => {
  let s = lastcard.init({}, 3, seeded(11));
  const c = (id, col, v) => ({ id, c: col, v });
  s = { ...s, color: 'r', discard: [c(900, 'r', '5')], turn: 0, drawn: null,
    hands: [[c(901, 'r', '+2'), c(902, 'g', '1')], [c(903, 'b', '+2'), c(904, 'y', '3')], [c(905, null, '+4'), c(906, 'g', '7')]] };
  s = lastcard.applyMove(s, { play: 901 }, 0);
  assert.equal(s.drawStack, 2);
  assert.equal(s.turn, 1);
  assert.deepEqual(lastcard.playableIds(s, 1), [903], '重ね中はドロー2だけ（色はちがってよい）');
  s = lastcard.applyMove(s, { play: 903 }, 1);
  assert.equal(s.drawStack, 4);
  s = lastcard.applyMove(s, { play: 905, color: 'g' }, 2);
  assert.equal(s.drawStack, 8);
  assert.equal(s.turn, 0);
  const before = s.hands[0].length;
  s = lastcard.applyMove(s, { draw: true }, 0);
  assert.equal(s.hands[0].length, before + 8, 'たまった8枚をまとめて引く');
  assert.equal(s.drawStack, 0);
  assert.equal(s.turn, 1, '引いた人は飛ばされる');
});

test('lastcard: イベント（雷・早押し・手札まわし・もう1回）', () => {
  const c = (id, col, v) => ({ id, c: col, v });
  const base = () => ({ ...lastcard.init({}, 3, seeded(12)), color: 'r', discard: [c(900, 'r', '5')], turn: 0, drawn: null,
    hands: [[c(901, 'r', 'event'), c(902, 'g', '1'), c(907, 'g', '2')], [c(903, 'b', '9')], [c(905, 'y', '4'), c(906, 'g', '7')]] });
  // rng(n) が返す値で効果を選ぶ（0:雷 1:早押し 2:手札まわし 3:もう1回）
  const pickEvent = (k, after = []) => { const q = [k + 1, ...after]; return () => (q.length ? q.shift() : 100); };
  let s = lastcard.applyMove(base(), { play: 901 }, 0, pickEvent(0, [100]));
  assert.equal(s.thunder, 1, '雷が次の人に付く');
  s = lastcard.applyMove(base(), { play: 901 }, 0, pickEvent(0, [1])); // 番が来た瞬間に雷が落ちた
  assert.equal(s.thunder, null);
  assert.equal(s.hands[1].length, 1 + lastcard.THUNDER_DRAW);
  s = lastcard.applyMove(base(), { play: 901 }, 0, pickEvent(2));
  assert.deepEqual(s.hands[1].map((x) => x.id), [902, 907], '手札まわし');
  s = lastcard.applyMove(base(), { play: 901 }, 0, pickEvent(3));
  assert.equal(s.turn, 0, 'もう1回');
  s = lastcard.applyMove(base(), { play: 901 }, 0, pickEvent(1), { bots: [false, false, false] });
  assert.ok(s.race, '早押しが始まる');
  assert.throws(() => lastcard.applyMove(s, { draw: true }, 1), /早押し中/);
  s = lastcard.applyMove(s, { press: true }, 2);
  s = lastcard.applyMove(s, { press: true }, 0);
  s = lastcard.applyMove(s, { press: true }, 1);
  assert.equal(s.race, null);
  assert.deepEqual(s.hands.map((h) => h.length), [2 + 1, 1 + 2, 2 + 0], '押した順に +0・+1・+2');
  assert.equal(s.turn, 1);
  // 押さなかった人は時間切れで最後
  s = lastcard.applyMove(base(), { play: 901 }, 0, pickEvent(1), { bots: [false, false, false] });
  s = lastcard.applyMove(s, { press: true }, 1);
  clock = s.race.deadline + 1;
  s = lastcard.tick(s, seeded(1), { bots: [false, false, false] });
  assert.equal(s.race, null);
  assert.deepEqual(s.hands.map((h) => h.length), [2 + 1, 1, 2 + 2]);
});

test('pigtail: マークか数字がそろうと山を全部引き取る', () => {
  let s = pigtail.init({}, 2, seeded(6));
  const ring = s.ring.map((c, i) => [c, i]);
  const [c0, i0] = ring[0];
  const [, i1] = ring.find(([c]) => c.s === c0.s && c !== c0);
  s = pigtail.applyMove(s, { flip: i0 }, 0);
  s = pigtail.applyMove(s, { flip: i1 }, 1);
  assert.equal(s.hands[1].length, 2);
  assert.equal(s.pile.length, 0);
});

test('yacht: 役の点数', () => {
  assert.equal(yacht.scoreFor('yacht', [4, 4, 4, 4, 4]), 50);
  assert.equal(yacht.scoreFor('full', [2, 2, 3, 3, 3]), 13);
  assert.equal(yacht.scoreFor('full', [2, 2, 3, 3, 4]), 0);
  assert.equal(yacht.scoreFor('sstr', [1, 2, 3, 4, 6]), 15);
  assert.equal(yacht.scoreFor('bstr', [2, 3, 4, 5, 6]), 30);
  assert.equal(yacht.scoreFor('four', [6, 6, 6, 6, 1]), 25);
  assert.equal(yacht.scoreFor('fives', [5, 5, 1, 2, 5]), 15);
  assert.equal(yacht.bonusOf({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }), 35);
});

test('koikoi: 役（三光・猪鹿蝶・赤短・タネ・カス）', () => {
  const pts = (ids) => Object.fromEntries(koikoi.yaku(ids));
  assert.equal(pts([0, 8, 28])['三光'], 5);
  assert.equal(pts([0, 8, 28, 40])['雨四光'], 7);
  assert.equal(pts([24, 36, 20])['猪鹿蝶'], 5);
  assert.equal(pts([1, 5, 9])['赤短'], 5);
  assert.equal(pts([8, 32])['花見で一杯'], 5);
  assert.equal(pts([4, 12, 16, 20, 24, 36])['タネ'], 2);
  const kasu = koikoi.CARDS.filter((c) => c.type === 'kasu').slice(0, 10).map((c) => c.id);
  assert.equal(pts(kasu)['カス'], 1);
});

test('koikoi: 同じ月が2枚あるときは取る札を選ぶ', () => {
  let s = koikoi.init({}, 2, seeded(7));
  s = { ...s, hands: [[1, ...s.hands[0].slice(1)], s.hands[1]], field: [2, 3, ...s.field.filter((x) => koikoi.monthOf(x) !== 1)].slice(0, 8), deck: s.deck.filter((x) => koikoi.monthOf(x) !== 1), turn: 0, phase: 'play' };
  assert.throws(() => koikoi.applyMove(s, { play: 1 }, 0), /取る札/);
  const ns = koikoi.applyMove(s, { play: 1, target: 3 }, 0);
  assert.ok(ns.captured[0].includes(1) && ns.captured[0].includes(3));
  assert.ok(ns.field.includes(2));
});

test('tanks: 入力はみんなに送り直さない・弾は壁で1回はね返る', () => {
  assert.equal(tanks.quietMove({ input: {} }), true);
  let s = tanks.init({}, 2, seeded(1));
  s = { ...s, phase: 'play', map: 0, bullets: [{ id: 1, by: 0, x: 0.12, y: 5.5, vx: -6, vy: 0, bounces: 1, age: 1 }], tanks: s.tanks.map((t, i) => ({ ...t, x: 8.5 + i, y: 0.5 })) };
  s = tanks.tick(s, seeded(1), { bots: [false, false] });
  assert.ok(s.bullets[0].vx > 0, 'はね返った');
});

test('hbball: ヒットとブローの数え方', () => {
  assert.deepEqual(hbball.judge([0, 1, 2, 3], [0, 2, 1, 5]), { hit: 1, blow: 2 });
  assert.deepEqual(hbball.judge([0, 0, 1, 1], [1, 0, 0, 2]), { hit: 1, blow: 2 });
  const s = hbball.init({}, 2, seeded(8));
  assert.equal(hbball.viewFor(s).secret, null);
});

test('chinchiro: 役の強さ', () => {
  const r = (d, t = 3) => chinchiro.role(d, t);
  assert.equal(r([1, 1, 1]).kind, 'pinzoro');
  assert.equal(r([4, 4, 4]).mult, 3);
  assert.equal(r([6, 4, 5]).kind, 'shigoro');
  assert.equal(r([3, 1, 2]).kind, 'hifumi');
  assert.deepEqual([r([2, 2, 5]).kind, r([2, 2, 5]).rank], ['me', 5]);
  assert.equal(r([1, 3, 6], 1).final, false, '役なしは3回までふり直し');
  assert.equal(r([1, 3, 6], 3).name, '目なし');
  assert.ok(r([1, 1, 1]).rank > r([6, 6, 6]).rank && r([2, 2, 2]).rank > r([4, 5, 6]).rank && r([4, 5, 6]).rank > r([6, 6, 1]).rank);
});

test('chinchiro: 親のシゴロで子全員から2倍、2〜5の目なら子がふって比べる', () => {
  // サイコロの目を決めてふらせる（rng(6) は 1〜6 を返す）
  const fixed = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
  let s = chinchiro.init({}, 3);
  s = chinchiro.applyMove(s, { bet: 100 }, 1);
  s = chinchiro.applyMove(s, { bet: 50 }, 2);
  assert.equal(s.phase, 'roll');
  let t = chinchiro.applyMove(s, { roll: true }, 0, fixed([4, 5, 6]));
  assert.deepEqual(t.chips, [1300, 800, 900]);
  assert.equal(t.phase, 'result');
  t = chinchiro.applyMove(s, { roll: true }, 0, fixed([3, 3, 4])); // 親は4の目
  assert.equal(t.turn, 1);
  t = chinchiro.applyMove(t, { roll: true }, 1, fixed([5, 5, 6])); // 子は6の目で勝ち
  assert.deepEqual(t.chips, [900, 1100, 1000]);
  t = chinchiro.applyMove(t, { roll: true }, 2, fixed([2, 2, 4])); // 4の目で引き分け
  assert.deepEqual(t.chips, [900, 1100, 1000]);
  assert.equal(t.phase, 'result');
  t = chinchiro.tick(t);
  assert.equal(t.parent, 1, '親は次の人へ');
});

console.log(`\n${n} tests passed`);
