import assert from 'node:assert/strict';
import * as chess from '../public/games/chess.js';
import * as shogi from '../public/games/shogi.js';
import * as gobblet from '../public/games/gobblet.js';
import * as gomoku from '../public/games/gomoku.js';
import * as othello from '../public/games/othello.js';
import * as igo from '../public/games/go.js';
import * as bg from '../public/games/backgammon.js';
import * as wbk from '../public/games/wordbasket.js';
import * as cc from '../public/games/catchoco.js';
import * as uno from '../public/games/uno.js';
import * as ww from '../public/games/werewolf.js';
import * as ito from '../public/games/ito.js';

const sqc = (s) => [8 - Number(s[1]), 'abcdefgh'.indexOf(s[0])];
const cm = (s, a, b, promo) => chess.applyMove(s, { from: sqc(a), to: sqc(b), promo });
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok -', name); };

test('chess: 初期局面は20手', () => assert.equal(chess.legalMoves(chess.init()).length, 20));
test('chess: perft(3)=8902', () => {
  const perft = (s, d) => d === 0 ? 1 : chess.legalMoves(s).reduce((a, m) => a + perft(chess.applyMove(s, m), d - 1), 0);
  assert.equal(perft(chess.init(), 3), 8902);
});
test('chess: フールズメイト', () => {
  let s = chess.init();
  s = cm(s, 'f2', 'f3'); s = cm(s, 'e7', 'e5'); s = cm(s, 'g2', 'g4'); s = cm(s, 'd8', 'h4');
  assert.deepEqual(s.result, { winner: 1, reason: 'チェックメイト' });
  assert.equal(s.history.at(-1), 'Qd8-h4#');
});
test('chess: キャスリングとアンパッサン', () => {
  let s = chess.init();
  for (const [a, b] of [['e2','e4'],['a7','a6'],['e4','e5'],['d7','d5']]) s = cm(s, a, b);
  s = cm(s, 'e5', 'd6'); // en passant
  assert.equal(s.board[3][3], null);
  for (const [a, b] of [['a6','a5'],['g1','f3'],['a5','a4'],['f1','e2'],['a4','a3']]) s = cm(s, a, b);
  s = cm(s, 'e1', 'g1');
  assert.equal(s.board[7][5], 'wR');
  assert.equal(s.history.at(-1), 'O-O');
});
test('chess: 不正な手は拒否', () => assert.throws(() => cm(chess.init(), 'e2', 'e5')));

const sm = (s, m) => shogi.applyMove(s, m);
const sh = (f, r) => [r - 1, 9 - f]; // 筋, 段 → [r,c]
test('shogi: 初期局面は30手', () => assert.equal(shogi.legalMoves(shogi.init()).length, 30));
test('shogi: 角交換と持ち駒', () => {
  let s = shogi.init();
  s = sm(s, { from: sh(7, 7), to: sh(7, 6) });
  s = sm(s, { from: sh(3, 3), to: sh(3, 4) });
  s = sm(s, { from: sh(8, 8), to: sh(2, 2), promote: true });
  assert.equal(s.hands[0].B, 1);
  assert.equal(s.board[1][7].t, '+B');
  assert.equal(s.history.at(-1), '▲２二角成');
  s = sm(s, { from: sh(3, 1), to: sh(2, 2) });
  assert.equal(s.history.at(-1), '△同銀');
  s = sm(s, { drop: 'B', to: sh(5, 5) });
  assert.equal(s.hands[0].B, 0);
});
test('shogi: 二歩は不可', () => {
  const s = shogi.init();
  s.hands[0].P = 1;
  assert.ok(!shogi.legalMoves(s).some((m) => m.drop === 'P'));
});
test('shogi: 打ち歩詰めは不可・頭金で詰み', () => {
  const s = shogi.init();
  s.board = Array.from({ length: 9 }, () => Array(9).fill(null));
  s.board[0][0] = { o: 1, t: 'K' };            // 後手玉 9一
  s.board[0][1] = { o: 1, t: 'L' };            // 8一 香で逃げ道を塞ぐ
  s.board[2][0] = { o: 0, t: 'G' };            // 9三 金が9二に利く
  s.board[8][8] = { o: 0, t: 'K' };
  s.hands[0].P = 1; s.hands[0].G = 1;
  s.board[1][1] = { o: 1, t: 'P' };            // 8二 塞ぐ
  const legal = shogi.legalMoves(s);
  assert.ok(!legal.some((m) => m.drop === 'P' && m.to[0] === 1 && m.to[1] === 0), '打ち歩詰め');
  const s2 = sm(s, { drop: 'G', to: [1, 0] });
  assert.deepEqual(s2.result, { winner: 0, reason: '詰み' });
});
test('shogi: 行き所のない駒は強制成り', () => {
  const s = shogi.init();
  s.board = Array.from({ length: 9 }, () => Array(9).fill(null));
  s.board[8][8] = { o: 0, t: 'K' }; s.board[8][0] = { o: 1, t: 'K' };
  s.board[1][4] = { o: 0, t: 'P' };
  const ms = shogi.legalMoves(s).filter((m) => m.from && m.from[0] === 1);
  assert.deepEqual(ms.map((m) => m.promote), [true]);
});

const gm = (s, m) => gobblet.applyMove(s, m);
test('gobblet: 横3つで勝ち', () => {
  let s = gobblet.init();
  s = gm(s, { size: 1, to: 0 }); s = gm(s, { size: 1, to: 3 });
  s = gm(s, { size: 1, to: 1 }); s = gm(s, { size: 1, to: 4 });
  s = gm(s, { size: 2, to: 2 });
  assert.deepEqual(s.result, { winner: 0, reason: '3つ並び' });
});
test('gobblet: かぶせ・小さい駒にはかぶせられない', () => {
  let s = gobblet.init();
  s = gm(s, { size: 2, to: 4 });
  assert.throws(() => gm(s, { size: 1, to: 4 }));
  s = gm(s, { size: 3, to: 4 });
  assert.equal(gobblet.top(s.board[4]).o, 1);
  assert.equal(s.board[4].length, 2);
});
test('gobblet: 持ち上げて相手の列が現れたら相手の勝ち', () => {
  let s = gobblet.init();
  s = gm(s, { size: 1, to: 0 }); // O
  s = gm(s, { size: 3, to: 0 }); // B covers
  s = gm(s, { size: 1, to: 1 }); // O
  s = gm(s, { size: 1, to: 6 }); // B
  s = gm(s, { size: 2, to: 2 }); // O: 0は青が乗っているので未完成
  assert.equal(s.result, null);
  s = gm(s, { from: 0, to: 8 }); // B 大を持ち上げる → オレンジの列が出現
  assert.equal(s.result.winner, 0);
});

const go = (s, r, c) => gomoku.applyMove(s, { to: [r, c] });
test('gomoku: 斜め5つで勝ち', () => {
  let s = gomoku.init();
  for (let i = 0; i < 4; i++) { s = go(s, i, i); s = go(s, i, 10); }
  assert.equal(s.result, null);
  s = go(s, 4, 4);
  assert.deepEqual(s.result, { winner: 0, reason: '五目並び' });
  assert.equal(s.winLine.length, 5);
});
test('gomoku: 4つでは勝たない・置いた場所には置けない', () => {
  let s = gomoku.init();
  s = go(s, 7, 7);
  assert.throws(() => go(s, 7, 7));
  assert.throws(() => go(s, 15, 0));
  for (let c = 8; c < 11; c++) { s = go(s, 0, c); s = go(s, 7, c); }
  assert.equal(s.result, null); // 黒は7段目に4つ
  s = go(s, 1, 0);
  s = go(s, 7, 11);
  assert.equal(s.result.winner, 0); // 5つ目で黒の勝ち
});


// 黒石・白石を直接並べた局面を作る（黒番）
const renju = (blacks, whites = [], renjuOn = true) => {
  const s = gomoku.init({ renju: renjuOn });
  for (const [r, c] of blacks) s.board[r][c] = 0;
  for (const [r, c] of whites) s.board[r][c] = 1;
  return s;
};
test('renju: 三三は禁じ手', () => {
  const s = renju([[7, 5], [7, 6], [5, 7], [6, 7]]);
  assert.ok(gomoku.isForbidden(s.board, 7, 7));
  assert.throws(() => go(s, 7, 7), /禁じ手/);
  assert.ok(gomoku.forbiddenPoints(s).some(([r, c]) => r === 7 && c === 7));
});
test('renju: 片方が止められた三なら三三ではない', () => {
  const s = renju([[7, 5], [7, 6], [5, 7], [6, 7]], [[4, 7], [9, 7]]);
  assert.ok(!gomoku.isForbidden(s.board, 7, 7));
});
test('renju: 四四は禁じ手、四三は打てる', () => {
  assert.ok(gomoku.isForbidden(renju([[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]]).board, 7, 7));
  assert.ok(!gomoku.isForbidden(renju([[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]]).board, 7, 7));
});
test('renju: 一直線の四四も禁じ手', () => {
  // ●・●□●・● の □ に打つと同じ列に四が2つ
  assert.ok(gomoku.isForbidden(renju([[7, 3], [7, 5], [7, 7], [7, 9]]).board, 7, 6));
});
test('renju: 長連は禁じ手、ルールなしなら勝ち', () => {
  const blacks = [[7, 2], [7, 3], [7, 4], [7, 6], [7, 7]];
  assert.throws(() => go(renju(blacks), 7, 5), /禁じ手/);
  assert.equal(go(renju(blacks, [], false), 7, 5).result.winner, 0);
});
test('renju: 五と同時の禁じ手形は五が優先', () => {
  const s = go(renju([[7, 3], [7, 4], [7, 5], [7, 6], [5, 7], [6, 7], [4, 7]]), 7, 7);
  assert.equal(s.result.winner, 0);
});
test('renju: 白は長連でも勝ち', () => {
  const s = renju([[0, 0]], [[7, 2], [7, 3], [7, 4], [7, 6], [7, 7]]);
  s.turn = 1;
  assert.equal(go(s, 7, 5).result.winner, 1);
});


const oth = (s, r, c) => othello.applyMove(s, { to: [r, c] });
test('othello: 初期局面は4手・はさんだ石が裏返る', () => {
  let s = othello.init();
  assert.equal(othello.legalMoves(s).length, 4);
  assert.throws(() => oth(s, 0, 0));
  s = oth(s, 2, 3); // d3
  assert.equal(s.board[3][3], 0);
  assert.equal(othello.count(s.board, 0), 4);
  assert.equal(othello.count(s.board, 1), 1);
  assert.equal(s.turn, 1);
});
test('othello: 最短の全滅で黒の勝ち', () => {
  let s = othello.init();
  for (const m of ['e6', 'f4', 'e3', 'f6', 'g5', 'd6', 'e7', 'f5', 'c5']) s = oth(s, Number(m[1]) - 1, 'abcdefgh'.indexOf(m[0]));
  assert.equal(othello.count(s.board, 1), 0);
  assert.equal(s.result.winner, 0);
});
test('othello: 打てない側は自動パス・両者打てなければ終局', () => {
  let seed = 1, passes = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let game = 0; game < 300; game++) {
    let s = othello.init();
    while (!s.result) {
      const ms = othello.legalMoves(s);
      assert.ok(ms.length > 0, '手番側には必ず打てる手がある');
      const prev = s;
      s = othello.applyMove(s, ms[Math.floor(rnd() * ms.length)]);
      if (!s.result && s.turn === prev.turn) {
        passes++;
        assert.ok(s.history.at(-1).endsWith('パス'));
        assert.equal(othello.legalMoves({ ...s, turn: 1 - s.turn }).length, 0);
      }
    }
    const b = othello.count(s.board, 0), w = othello.count(s.board, 1);
    assert.equal(othello.legalMoves({ ...s, result: null }).length, 0);
    assert.equal(othello.legalMoves({ ...s, result: null, turn: 1 - s.turn }).length, 0);
    assert.equal(s.result.winner, b === w ? null : b > w ? 0 : 1);
  }
  assert.ok(passes > 0, 'パスが一度も発生していない');
});



// 囲碁: 'D4' 形式の座標で打つ
const gp = (s, m) => {
  if (m === 'pass') return igo.applyMove(s, { pass: true });
  const c = 'ABCDEFGHJKLMNOPQRST'.indexOf(m[0]), r = s.size - Number(m.slice(1));
  return igo.applyMove(s, { to: [r, c] });
};
const gseq = (s, ms) => ms.reduce(gp, s);
test('go: 盤サイズの選択', () => {
  assert.equal(igo.init({ size: 9 }).board.length, 9);
  assert.equal(igo.init({ size: 7 }).size, 19);
});
test('go: 石を取る・アゲハマ', () => {
  // 白 E5 を黒が4方向から囲む
  const s = gseq(igo.init({ size: 9 }), ['D5', 'E5', 'F5', 'A1', 'E4', 'A2', 'E6']);
  assert.equal(s.board[4][4], null);
  assert.equal(s.captures[0], 1);
});
test('go: 自殺手は打てない', () => {
  const s = gseq(igo.init({ size: 9 }), ['A2', 'J9', 'B1']);
  assert.throws(() => gp(s, 'A1'), /自殺手/);
});
test('go: コウはすぐ取り返せない', () => {
  // 黒 D5 E6 E4・白 F6 F4 G5 の典型的なコウ形
  let s = gseq(igo.init({ size: 9 }), ['D5', 'F6', 'E6', 'F4', 'E4', 'G5', 'J1', 'E5']);
  // 白が E5 に打ち、黒は F5 で E5 を取れる
  s = gp(s, 'F5');
  assert.equal(s.board[4][4], null);
  assert.throws(() => gp(s, 'E5'), /コウ/);
  s = gseq(s, ['A9', 'B9']); // コウ立てとその応手
  s = gp(s, 'E5');           // 1手おけば取り返せる
  assert.equal(s.board[4][5], null);
});
test('go: 2回パスで終局処理、死に石指定と合意で勝敗', () => {
  let s = gseq(igo.init({ size: 9 }), ['E5', 'pass', 'pass']);
  assert.equal(s.phase, 'scoring');
  assert.ok(igo.canActOutOfTurn(s));
  // 黒1子で盤全体が黒地: 80目、白はコミのみ
  assert.deepEqual(igo.score(s), [80, 6.5]);
  s = igo.applyMove(s, { accept: true }, 0);
  assert.equal(s.result, null);
  s = igo.applyMove(s, { accept: true }, 1);
  assert.equal(s.result.winner, 0);
});
test('go: 死に石は相手の地とアゲハマになる', () => {
  let s = gseq(igo.init({ size: 9 }), ['E5', 'A1', 'pass', 'pass']);
  s = igo.applyMove(s, { toggle: [8, 0] }, 0);
  assert.deepEqual(igo.score(s), [81, 6.5]); // 地80 + 死に石1
  s = igo.applyMove(s, { toggle: [8, 0] }, 1); // 解除
  assert.equal(s.dead.length, 0);
  s = igo.applyMove(s, { resume: true }, 1);
  assert.equal(s.phase, 'play');
  assert.equal(s.turn, 0);
});


// バックギャモン: 指定した目を返す rng
const fixedDice = (...ds) => () => ds.shift();
const bgState = (setup) => Object.assign(bg.init(), setup);
test('backgammon: 初期配置と振り出し', () => {
  const s0 = bg.init();
  assert.equal(bg.pips(s0, 0), 167);
  assert.equal(bg.pips(s0, 1), 167);
  const s = bg.applyMove(s0, { roll: true }, 0, fixedDice(3, 1));
  assert.deepEqual(s.dice, [3, 1]);
  assert.ok(bg.legalSteps(s).some((x) => x.from === 8 && x.to === 5));
  let t = bg.applyMove(s, { from: 8, to: 5 });
  t = bg.applyMove(t, { from: 6, to: 5 });
  assert.equal(t.pts[5], 2);
  assert.equal(t.turn, 1);
  assert.equal(t.phase, 'roll');
  assert.equal(t.history.at(-1), '○3-1: 8/5 6/5');
});
test('backgammon: ゾロ目は4回', () => {
  const s = bg.applyMove(bg.init(), { roll: true }, 0, fixedDice(6, 6));
  assert.deepEqual(s.dice, [6, 6, 6, 6]);
});
test('backgammon: ヒットとバーからのエントリー', () => {
  const pts = Array(26).fill(0);
  pts[10] = 1; pts[7] = -1; pts[20] = -14;
  let s = bgState({ pts, off: [14, 0] });
  s = bg.applyMove(s, { roll: true }, 0, fixedDice(3, 1));
  s = bg.applyMove(s, { from: 10, to: 7 });
  assert.equal(s.bar[1], 1);
  assert.ok(s.history.at(-1).includes('*'));
  s = bg.applyMove(s, { from: 7, to: 6 });
  s = bg.applyMove(s, { roll: true }, 1, fixedDice(2, 5));
  const steps = bg.legalSteps(s);
  assert.ok(steps.length && steps.every((x) => x.from === 'bar'), 'バーにある駒を先に入れる');
});
test('backgammon: 片方しか使えないなら大きい目', () => {
  // 白の駒は 13 に1つだけ。6 でも 5 でも動けるが、どちらの後も 2 がふさがれていて両方は使えない
  const pts = Array(26).fill(0);
  pts[13] = 1; pts[1] = -2; pts[2] = -2;
  const s = bg.applyMove(bgState({ pts, off: [14, 11] }), { roll: true }, 0, fixedDice(5, 6));
  const steps = bg.legalSteps(s);
  assert.ok(steps.length > 0);
  assert.ok(steps.every((x) => x.die === 6), JSON.stringify(steps));
});
test('backgammon: ベアオフと勝ちの種類', () => {
  const pts = Array(26).fill(0);
  pts[1] = 1; pts[2] = 1; pts[20] = -15;
  let s = bgState({ pts, off: [13, 0] });
  s = bg.applyMove(s, { roll: true }, 0, fixedDice(6, 5)); // 大きい目で奥の駒から上がれる
  s = bg.applyMove(s, { from: 2, to: 'off' });
  s = bg.applyMove(s, { from: 1, to: 'off' });
  assert.deepEqual(s.result, { winner: 0, reason: 'ギャモン勝ち' });
});
test('backgammon: ランダム対局が必ず終わり、駒数が保たれる', () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const die = () => 1 + Math.floor(rnd() * 6);
  for (let game = 0; game < 30; game++) {
    let s = bg.init(), guard = 0;
    while (!s.result && guard++ < 5000) {
      if (s.phase === 'roll') { s = bg.applyMove(s, { roll: true }, s.turn, die); continue; }
      const steps = bg.legalSteps(s);
      assert.ok(steps.length, 'move フェーズでは必ず動かせる');
      const st = steps[Math.floor(rnd() * steps.length)];
      s = bg.applyMove(s, { from: st.from, to: st.to });
      for (const p of [0, 1]) {
        let n = s.bar[p] + s.off[p];
        for (let i = 1; i <= 24; i++) n += Math.max(s.pts[i] * (p === 0 ? 1 : -1), 0);
        assert.equal(n, 15);
      }
    }
    assert.ok(s.result, '対局が終わらない');
  }
});


// ワードバスケット: 場と手札を指定した状態を作る
const wbState = (field, hands) => {
  const s = wbk.init({}, hands.length);
  let id = 1000;
  s.field = field;
  s.fieldCard = { id: id++, t: 'kana', c: field };
  s.hands = hands.map((h) => h.map((c) => ({ id: id++, ...(typeof c === 'string' ? (c.endsWith('行') ? { t: 'row', c: c[0] } : { t: 'kana', c }) : { t: 'len', n: c }) })));
  return s;
};
test('wordbasket: 配り方', () => {
  const s = wbk.init({}, 4);
  assert.equal(s.hands.length, 4);
  assert.ok(s.hands.every((h) => h.length === 5));
  assert.equal(s.fieldCard.t, 'kana');
  assert.equal(s.deck.length + 4 * 5 + 1 + s.discard.length, 59);
});
test('wordbasket: 文字の正規化', () => {
  assert.equal(wbk.normalize('リンゴ'), 'りんご');
  assert.equal(wbk.normalize('apple'), null);
  assert.equal(wbk.lastChar('りんご'), 'こ');
  assert.equal(wbk.lastChar('こーひー'), 'ひ');
  assert.equal(wbk.lastChar('ちきゅう'), 'う');
  assert.equal(wbk.lastChar('しゃしんきょ'), 'よ');
  assert.equal(wbk.firstChar('ぱんだ'), 'は');
});
test('wordbasket: 言葉を出す・出せない理由', () => {
  const s = wbState('り', [['こ', 'す', 'か行'], ['あ']]);
  assert.throws(() => wbk.applyMove(s, { word: 'りす' }, 0), /3文字以上/);
  assert.throws(() => wbk.applyMove(s, { word: 'かめら' }, 0), /「り」から/);
  assert.throws(() => wbk.applyMove(s, { word: 'りれきしょ' }, 0), /持っていません/);
  assert.throws(() => wbk.applyMove(s, { word: 'りもこん' }, 0), /「ん」/);
  const ns = wbk.applyMove(s, { word: 'リンゴ' }, 0);
  assert.equal(ns.field, 'こ');
  assert.equal(ns.hands[0].length, 2);
  assert.equal(ns.hands[0].some((c) => c.t === 'kana' && c.c === 'こ'), false, '文字カードを優先して使う');
  assert.throws(() => wbk.applyMove({ ...ns, field: 'り' }, { word: 'りんご' }, 0), /もう使われ/);
});
test('wordbasket: 行カードと文字数カード', () => {
  const s = wbState('た', [['か行', 5], ['あ']]);
  let ns = wbk.applyMove(s, { word: 'たいこ' }, 0); // か行
  assert.equal(ns.field, 'こ');
  ns = wbk.applyMove(ns, { word: 'こいのぼり' }, 0); // 5文字
  assert.deepEqual(ns.result, { winner: 0, reason: '「こいのぼり」で上がり', byPlay: true });
});
test('wordbasket: ダメ出しで取り消し・1枚引く・上がりも取り消せる', () => {
  const s = wbState('さ', [['ら'], ['あ', 'い']]);
  const played = wbk.applyMove(s, { word: 'さくら' }, 0);
  assert.equal(played.result.winner, 0);
  assert.throws(() => wbk.applyMove(played, { challenge: 0 }, 0), /自分の言葉/);
  const ns = wbk.applyMove(played, { challenge: 0 }, 1);
  assert.equal(ns.result, null);
  assert.equal(ns.field, 'さ');
  assert.equal(ns.hands[0].length, 2);
  assert.ok(ns.plays[0].challenged);
  assert.throws(() => wbk.applyMove(ns, { challenge: 0 }, 1), /もうダメ出し/);
  assert.ok(wbk.applyMove(ns, { word: 'さくら' }, 0), '取り消された言葉は使い直せる');
});
test('wordbasket: 全員の投票で場を流す・投了', () => {
  const s = wbState('ぬ', [['あ'], ['い'], ['う']]);
  let ns = wbk.applyMove(s, { flip: true }, 0);
  ns = wbk.applyMove(ns, { flip: true }, 1);
  assert.equal(ns.fieldCard.id, s.fieldCard.id);
  ns = wbk.applyMove(ns, { resign: true }, 2); // 投了した人は投票不要
  assert.notEqual(ns.fieldCard.id, s.fieldCard.id);
  ns = wbk.applyMove(ns, { resign: true }, 1);
  assert.equal(ns.result.winner, 0);
});
test('wordbasket: 相手の手札は見えない', () => {
  const s = wbk.init({}, 3);
  const v = wbk.viewFor(s, 1);
  assert.equal(v.hands[0], null);
  assert.equal(v.hands[1].length, 5);
  assert.equal(v.deck, null);
  assert.deepEqual(v.handCounts, [5, 5, 5]);
});


// キャット＆チョコレート
const ccPick = (s) => [...Array(s.event.count).keys()];
test('catchoco: 配り方とチーム分け', () => {
  const s = cc.init({}, 5);
  assert.ok(s.hands.every((h) => h.length === 3));
  assert.deepEqual([0, 1].map((t) => s.teams.filter((x) => x === t).length).sort(), [2, 3]);
  assert.equal(s.totalTurns, 10);
  const v = cc.viewFor(s, 2);
  assert.equal(v.teams.filter((t) => t !== null).length, 1, '自分のチームだけ見える');
  assert.equal(v.hands[0], null);
});
test('catchoco: 説明→投票→成功で獲得・使ったアイテムは補充', () => {
  let s = cc.init({}, 3);
  const used = ccPick(s).map((i) => s.hands[0][i].id);
  assert.throws(() => cc.applyMove(s, { explain: { items: [], text: 'なにもしない' } }, 0), /ちょうど/);
  assert.throws(() => cc.applyMove(s, { explain: { items: ccPick(s), text: 'x' } }, 0), /詳しく/);
  assert.throws(() => cc.applyMove(s, { explain: { items: ccPick(s), text: 'がんばって解決する' } }, 1), /あなたの番/);
  s = cc.applyMove(s, { explain: { items: ccPick(s), text: 'がんばって解決する' } }, 0);
  assert.equal(s.phase, 'vote');
  assert.ok(cc.canActOutOfTurn(s));
  assert.throws(() => cc.applyMove(s, { vote: true }, 0), /自分/);
  s = cc.applyMove(s, { vote: true }, 1);
  assert.throws(() => cc.applyMove(s, { vote: true }, 1), /もう投票/);
  s = cc.applyMove(s, { vote: true }, 2);
  assert.equal(s.won[0].length, 1);
  assert.equal(s.turn, 1);
  assert.equal(s.hands[0].length, 3);
  assert.ok(used.every((id) => !s.hands[0].some((c) => c.id === id)));
  assert.ok(s.log[0].success);
});
test('catchoco: 同数は失敗・ギブアップ', () => {
  let s = cc.init({}, 3);
  s = cc.applyMove(s, { explain: { items: ccPick(s), text: 'うまくいくはず' } }, 0);
  s = cc.applyMove(s, { vote: true }, 1);
  s = cc.applyMove(s, { vote: false }, 2);
  assert.equal(s.won[0].length, 0);
  s = cc.applyMove(s, { giveUp: true }, 1);
  assert.equal(s.turn, 2);
  assert.ok(s.log[1].gaveUp);
});
test('catchoco: 規定ターンで終了しチームの合計で勝敗', () => {
  let s = cc.init({}, 2);
  // 2人なら投票者は1人。プレイヤー0だけ成功させる
  while (!s.result) {
    const p = s.turn;
    s = cc.applyMove(s, { explain: { items: ccPick(s), text: 'なんとかなる方法' } }, p);
    s = cc.applyMove(s, { vote: p === 0 }, 1 - p);
  }
  assert.equal(s.log.length, 4);
  assert.deepEqual(s.result.winners, [0]);
  assert.equal(s.result.team, s.teams[0]);
});
test('catchoco: 手番の人が抜けたら次の人へ', () => {
  let s = cc.init({}, 3);
  s = cc.applyMove(s, { resign: true }, 0);
  assert.equal(s.turn, 1);
  assert.equal(s.result, null);
  s = cc.applyMove(s, { explain: { items: ccPick(s), text: 'これで解決できる' } }, 1);
  s = cc.applyMove(s, { vote: true }, 2); // 抜けた人は投票しない
  assert.equal(s.won[1].length, 1);
  s = cc.applyMove(s, { resign: true }, 1);
  assert.ok(s.result);
});


// UNO: 手札と場を指定した状態を作る
let unoId = 1000;
const uc = (c, v) => ({ id: unoId++, c, v });
const unoState = (players, hands, topCard, color) => {
  const s = uno.init({}, players);
  s.hands = hands;
  s.discard = [topCard];
  s.color = color || topCard.c;
  return s;
};
const unoTotal = (s) => s.deck.length + s.discard.length + s.hands.reduce((a, h) => a + h.length, 0);
test('uno: 配り方', () => {
  const s = uno.init({}, 4);
  assert.ok(s.hands.every((h) => h.length === 7));
  assert.match(uno.top(s).v, /^\d$/);
  assert.equal(unoTotal(s), 108);
  const v = uno.viewFor(s, 1);
  assert.equal(v.hands[0], null);
  assert.equal(v.deck, null);
});
test('uno: 色か数字を合わせる・ワイルドドロー4の制限', () => {
  const r5 = uc('r', '5'), b5 = uc('b', '5'), g7 = uc('g', '7'), w4 = uc(null, '+4'), w = uc(null, 'wild');
  const s = unoState(2, [[r5, b5, g7, w4, w], [uc('y', '1')]], uc('r', '3'));
  const ids = uno.playableIds(s, 0);
  assert.ok(ids.includes(r5.id) && ids.includes(w.id));
  assert.ok(!ids.includes(b5.id) && !ids.includes(g7.id));
  assert.ok(!ids.includes(w4.id), '場の色を持っているとドロー4は出せない');
  assert.throws(() => uno.applyMove(s, { play: w.id }, 0), /色を選んで/);
  const ns = uno.applyMove(s, { play: w.id, color: 'g' }, 0);
  assert.equal(ns.color, 'g');
  assert.equal(ns.turn, 1);
  assert.throws(() => uno.applyMove(ns, { play: g7.id }, 0), /あなたの番では/);
});
test('uno: スキップ・リバース・ドロー2', () => {
  const s = unoState(3, [[uc('r', 'skip'), uc('r', 'rev'), uc('r', '+2'), uc('r', '1')], [uc('y', '1')], [uc('y', '2')]], uc('r', '3'));
  let ns = uno.applyMove(s, { play: s.hands[0][0].id }, 0);
  assert.equal(ns.turn, 2, 'スキップで1人飛ばす');
  ns = uno.applyMove({ ...s, turn: 0 }, { play: s.hands[0][1].id }, 0);
  assert.equal(ns.direction, -1);
  assert.equal(ns.turn, 2, 'リバースで逆回り');
  const before = s.hands[1].length;
  ns = uno.applyMove(s, { play: s.hands[0][2].id }, 0);
  assert.equal(ns.hands[1].length, before + 2);
  assert.equal(ns.turn, 2);
});
test('uno: 2人のリバースはもう一度自分の番', () => {
  const s = unoState(2, [[uc('r', 'rev'), uc('r', '1')], [uc('y', '1')]], uc('r', '3'));
  assert.equal(uno.applyMove(s, { play: s.hands[0][0].id }, 0).turn, 0);
});
test('uno: 引いたカードはそのまま出せる・出せなければパス', () => {
  const s = unoState(2, [[uc('b', '1')], [uc('y', '1')]], uc('r', '3'));
  s.deck.push(uc('r', '9'));
  let ns = uno.applyMove(s, { draw: true }, 0);
  assert.equal(ns.turn, 0);
  assert.equal(uno.playableIds(ns, 0).length, 1, '引いたカードだけ出せる');
  assert.throws(() => uno.applyMove(ns, { draw: true }, 0), /もう引きました/);
  ns = uno.applyMove(ns, { pass: true }, 0);
  assert.equal(ns.turn, 1);
  const s2 = unoState(2, [[uc('b', '1')], [uc('y', '1')]], uc('r', '3'));
  s2.deck.push(uc('g', '9'));
  assert.equal(uno.applyMove(s2, { draw: true }, 0).turn, 1, '出せないカードなら自動で次へ');
});
test('uno: UNO の言い忘れを指摘されると2枚・宣言すれば指摘されない', () => {
  const s = unoState(3, [[uc('r', '1'), uc('r', '2')], [uc('y', '1')], [uc('y', '2')]], uc('r', '3'));
  let ns = uno.applyMove(s, { play: s.hands[0][0].id }, 0);
  assert.equal(ns.unoPending, 0);
  ns = uno.applyMove(ns, { catchUno: 0 }, 2);
  assert.equal(ns.hands[0].length, 3);
  const said = uno.applyMove(s, { play: s.hands[0][0].id, uno: true }, 0);
  assert.equal(said.unoPending, null);
  assert.throws(() => uno.applyMove(said, { catchUno: 0 }, 2), /指摘できません/);
  // 次の人が動いたら指摘できない
  let late = uno.applyMove(s, { play: s.hands[0][0].id }, 0);
  late = uno.applyMove(late, { draw: true }, 1);
  assert.equal(late.unoPending, null);
});
test('uno: ランダム対局が終わり、カード枚数が保たれる', () => {
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rng = (n = 6) => 1 + Math.floor(rnd() * n);
  for (let game = 0; game < 40; game++) {
    let s = uno.init({}, 2 + (game % 5), rng), guard = 0;
    while (!s.result && guard++ < 3000) {
      const p = s.turn, ids = uno.playableIds(s, p);
      if (ids.length) {
        const id = ids[Math.floor(rnd() * ids.length)];
        s = uno.applyMove(s, { play: id, color: uno.COLORS[Math.floor(rnd() * 4)], uno: rnd() < 0.7 }, p, rng);
      } else if (s.drawn != null) s = uno.applyMove(s, { pass: true }, p, rng);
      else s = uno.applyMove(s, { draw: true }, p, rng);
      if (s.unoPending !== null && rnd() < 0.5) s = uno.applyMove(s, { catchUno: s.unoPending }, (s.unoPending + 1) % s.players, rng);
      assert.equal(unoTotal(s), 108);
    }
    assert.ok(s.result, '対局が終わらない');
  }
});


// ワンナイト人狼: 役職を指定した状態を作る
const wwState = (roles, center) => Object.assign(ww.init({}, roles.length), { roles, center });
const wwNightAll = (s, acts = {}) => {
  for (let p = 0; p < s.players; p++) s = ww.applyMove(s, { night: acts[p] || {} }, p);
  return s;
};
const wwVote = (s, votes) => votes.reduce((st, t, p) => ww.applyMove(st, { vote: t }, p), s);
test('werewolf: 役職の構成と秘密', () => {
  assert.deepEqual(ww.composition(3).sort(), ['seer', 'thief', 'villager', 'wolf', 'wolf']);
  assert.ok(ww.composition(5).includes('madman'));
  const s = ww.init({}, 4);
  assert.equal(s.roles.length + s.center.length, 6);
  const v = ww.viewFor(s, 0);
  assert.equal(v.roles.filter((r) => r !== null).length, 1);
  assert.equal(v.center, null);
});
test('werewolf: 占い師は交換前のカードを見る・怪盗は交換後の役職になる', () => {
  let s = wwState(['seer', 'thief', 'wolf', 'villager'], ['wolf', 'villager']);
  s = ww.applyMove(s, { night: { swap: 2 } }, 1);
  s = ww.applyMove(s, { night: { look: 1 } }, 0);
  assert.ok(s.night[0].info[0].includes('怪盗'));
  assert.ok(s.night[1].info[0].includes('人狼'));
  s = ww.applyMove(s, { night: {} }, 2);
  assert.equal(s.night[2].info[0], '人狼はあなた1人です');
  assert.equal(s.phase, 'night');
  s = ww.applyMove(s, { night: {} }, 3);
  assert.equal(s.phase, 'day');
  assert.deepEqual(s.final, ['seer', 'wolf', 'thief', 'villager']);
});
test('werewolf: 占い師は中央2枚も見られる', () => {
  const s = wwState(['seer', 'wolf', 'wolf'], ['thief', 'villager']);
  assert.throws(() => ww.applyMove(s, { night: { center: [0] } }, 0), /2枚/);
  const ns = ww.applyMove(s, { night: { center: [0, 1] } }, 0);
  assert.equal(ns.night[0].info.length, 2);
});
test('werewolf: 人狼を処刑すれば村人陣営の勝ち', () => {
  let s = wwNightAll(wwState(['seer', 'wolf', 'villager', 'villager'], ['wolf', 'thief']));
  assert.throws(() => ww.applyMove(s, { vote: 0 }, 0), /投票できません/);
  s = wwVote(s, [1, 0, 1, 1]);
  assert.deepEqual(s.executed, [1]);
  assert.deepEqual(s.result.winners, [0, 2, 3]);
  assert.equal(s.result.team, 0);
});
test('werewolf: 人狼が生き残れば人狼陣営（狂人も）の勝ち・投票は変更できる', () => {
  let s = wwNightAll(wwState(['wolf', 'madman', 'villager', 'villager', 'seer'], ['wolf', 'thief']));
  s = ww.applyMove(s, { vote: 3 }, 0);
  s = ww.applyMove(s, { vote: 4 }, 0); // 変更
  assert.equal(s.votes[0], 4);
  s = wwVote(s, [2, 2, 1, 2, 3]);
  assert.deepEqual(s.executed, [2]);
  assert.deepEqual(s.result.winners, [0, 1]);
});
test('werewolf: 全員1票ずつなら処刑なし・人狼が中央なら平和村で村人の勝ち', () => {
  let s = wwNightAll(wwState(['seer', 'thief', 'villager'], ['wolf', 'wolf']));
  s = wwVote(s, [1, 2, 0]);
  assert.deepEqual(s.executed, []);
  assert.deepEqual(s.result.winners, [0, 1, 2]);
  let t = wwNightAll(wwState(['seer', 'thief', 'villager'], ['wolf', 'wolf']));
  t = wwVote(t, [2, 2, 0]);
  assert.deepEqual(t.result.winners, []);
  assert.ok(t.result.allLose);
});
test('werewolf: 怪盗が人狼と交換すると人狼陣営になる', () => {
  let s = wwState(['thief', 'wolf', 'villager'], ['wolf', 'seer']);
  s = wwNightAll(s, { 0: { swap: 1 } });
  s = wwVote(s, [2, 2, 1]); // 元人狼（今は怪盗）の1に1票、2に2票
  assert.deepEqual(s.executed, [2]);
  assert.deepEqual(s.result.winners, [0]);
});


test('catchoco: アイテムは180種類で重複なし', () => {
  const s = cc.init({}, 2);
  const all = [...s.itemDeck, ...s.hands.flat()].map((c) => c.name);
  assert.equal(all.length, 180);
  assert.equal(new Set(all).size, 180);
});
test('wordbasket: 山札から1枚引く', () => {
  const s = wbk.init({}, 2);
  const ns = wbk.applyMove(s, { draw: true }, 0);
  assert.equal(ns.hands[0].length, 6);
  assert.equal(ns.deck.length, s.deck.length - 1);
  assert.equal(ns.hands[1].length, 5);
});
test('wordbasket: 手札リセットで元の枚数＋1枚に・カードの総数は変わらない', () => {
  const s = wbk.init({}, 3);
  const old = s.hands[1].map((c) => c.id);
  const ns = wbk.applyMove(s, { resetHand: true }, 1);
  assert.equal(ns.hands[1].length, 6);
  assert.ok(old.every((id) => ns.discard.some((c) => c.id === id)), '元の手札は捨て札へ');
  const total = (st) => st.deck.length + st.discard.length + st.hands.flat().length + 1;
  assert.equal(total(ns), 59);
  // 山札が足りなくなっても捨て札を混ぜ直して引ける
  let t = ns;
  for (let i = 0; i < 30; i++) t = wbk.applyMove(t, { resetHand: true }, 0);
  assert.equal(total(t), 59);
  assert.throws(() => wbk.applyMove({ ...ns, out: [false, true, false] }, { resetHand: true }, 1), /投了/);
});


// ito
const itoCtx = (n, host = 0) => ({ hostSeat: host, online: Array(n).fill(true) });
const itoTickAll = (s) => { while (s.phase === 'reveal') s = ito.tick(s); return s; };
test('ito: 設定・配り方・お題のジャンル', () => {
  assert.deepEqual(ito.GENRES.map((g) => g.key), ['entertainment', 'things']);
  assert.ok(ito.GENRES[0].count >= 400, 'エンタメは400以上');
  assert.deepEqual(ito.normalizeOptions({ cardsPerPlayer: 9, genres: ['food'] }), { cardsPerPlayer: 5, genres: ['entertainment', 'things'] });
  const s = ito.init({ cardsPerPlayer: 2, genres: ['things'] }, 3);
  assert.equal(s.cards.length, 6);
  assert.equal(new Set(s.cards.map((c) => c.value)).size, 6);
  assert.ok(s.cards.every((c) => c.value >= 1 && c.value <= 100));
  assert.equal(s.phase, 'arrange');
  assert.ok(s.theme);
  const v = ito.viewFor(s, 1);
  assert.ok(v.cards.every((c) => (c.owner === 1 ? c.value !== null : c.value === null)), '数字は自分のだけ見える');
  assert.equal(v.themeDeck, null);
});
test('ito: 書き込み・並べ替えでOKが取り消される・他人のカードには書けない', () => {
  let s = ito.init({}, 2);
  const mine = s.cards.find((c) => c.owner === 0), theirs = s.cards.find((c) => c.owner === 1);
  s = ito.applyMove(s, { ready: true }, 1, null, itoCtx(2));
  assert.equal(s.ready[1], true);
  s = ito.applyMove(s, { hint: { cardId: mine.id, text: 'ライオン' } }, 0, null, itoCtx(2));
  assert.equal(s.cards.find((c) => c.id === mine.id).hint, 'ライオン');
  assert.equal(s.ready[1], false);
  assert.throws(() => ito.applyMove(s, { hint: { cardId: theirs.id, text: 'x' } }, 0, null, itoCtx(2)), /自分のカード/);
  const first = s.cards[0].id;
  s = ito.applyMove(s, { move: { cardId: first, to: 1 } }, 1, null, itoCtx(2));
  assert.equal(s.cards[1].id, first);
});
test('ito: 全員OKで答え合わせ→1枚ずつめくって成功判定', () => {
  let s = ito.init({}, 3);
  // 小さい順に並べてから全員OK
  const sorted = s.cards.slice().sort((a, b) => a.value - b.value);
  sorted.forEach((c, i) => { s = ito.applyMove(s, { move: { cardId: c.id, to: i } }, 0, null, itoCtx(3)); });
  for (const p of [0, 1]) s = ito.applyMove(s, { ready: true }, p, null, itoCtx(3));
  assert.equal(s.phase, 'arrange');
  s = ito.applyMove(s, { ready: true }, 2, null, itoCtx(3));
  assert.equal(s.phase, 'reveal');
  assert.equal(s.tickAfter, ito.REVEAL_INTERVAL_MS);
  s = ito.tick(s);
  assert.equal(s.revealed, 1);
  assert.notEqual(ito.viewFor(s, 0).cards[0].value, null, 'めくったカードは全員に見える');
  s = itoTickAll(s);
  assert.equal(s.phase, 'result');
  assert.equal(s.outcome, 'success');
  assert.equal(s.wins, 1);
  assert.equal(s.tickAfter, null);
});
test('ito: 順番ミスで失敗・切断中の人はOK待ちに含めない', () => {
  let s = ito.init({}, 3);
  const desc = s.cards.slice().sort((a, b) => b.value - a.value);
  desc.forEach((c, i) => { s = ito.applyMove(s, { move: { cardId: c.id, to: i } }, 0, null, itoCtx(3)); });
  const ctx = { hostSeat: 0, online: [true, true, false] };
  s = ito.applyMove(s, { ready: true }, 0, null, ctx);
  s = ito.applyMove(s, { ready: true }, 1, null, ctx);
  assert.equal(s.phase, 'reveal');
  s = itoTickAll(s);
  assert.equal(s.outcome, 'fail');
  assert.equal(s.wins, 0);
});
test('ito: ホストだけの操作（お題変更・強制答え合わせ・次のラウンド）', () => {
  let s = ito.init({}, 2);
  assert.throws(() => ito.applyMove(s, { reroll: true }, 1, null, itoCtx(2)), /ホストだけ/);
  s = ito.applyMove(s, { customTheme: '好きな食べ物' }, 0, null, itoCtx(2));
  assert.equal(s.theme, '好きな食べ物');
  const before = s.theme;
  s = ito.applyMove(s, { reroll: true }, 0, null, itoCtx(2));
  assert.notEqual(s.theme, before);
  s = ito.applyMove(s, { forceReveal: true }, 0, null, itoCtx(2));
  s = itoTickAll(s);
  assert.throws(() => ito.applyMove(s, { next: true }, 1, null, itoCtx(2)), /ホストだけ/);
  s = ito.applyMove(s, { next: true }, 0, null, itoCtx(2));
  assert.equal(s.round, 2);
  assert.equal(s.phase, 'arrange');
});
test('ito: 外されたプレイヤーのカードは場から消え、次のラウンドも配られない', () => {
  let s = ito.init({ cardsPerPlayer: 2 }, 3);
  s = ito.applyMove(s, { resign: true }, 2, null, itoCtx(3));
  assert.ok(s.cards.every((c) => c.owner !== 2));
  s = ito.applyMove(s, { forceReveal: true }, 0, null, itoCtx(3));
  s = ito.applyMove(itoTickAll(s), { next: true }, 0, null, itoCtx(3));
  assert.equal(s.cards.length, 4);
});

console.log(`\n${n} tests passed`);
