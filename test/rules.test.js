import assert from 'node:assert/strict';
import * as chess from '../public/games/chess.js';
import * as shogi from '../public/games/shogi.js';
import * as gobblet from '../public/games/gobblet.js';
import * as gomoku from '../public/games/gomoku.js';
import * as othello from '../public/games/othello.js';
import * as wbk from '../public/games/wordbasket.js';
import * as cc from '../public/games/catchoco.js';
import * as uno from '../public/games/uno.js';
import * as ww from '../public/games/werewolf.js';
import * as ito from '../public/games/ito.js';
import * as df from '../public/games/daifugo.js';
import * as pk from '../public/games/poker.js';
import * as bk from '../public/games/blokus.js';
import * as paint from '../public/games/paint.js';
import * as skull from '../public/games/skull.js';
import * as gungi from '../public/games/gungi.js';

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
test('ito: 設定・配り方・お題（ジャンル分けなし）', () => {
  assert.ok(ito.THEME_COUNT > 0);
  assert.deepEqual(ito.normalizeOptions({ cardsPerPlayer: 9, genres: ['food'] }), { cardsPerPlayer: 5 });
  const s = ito.init({ cardsPerPlayer: 2 }, 3);
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


// ---------- 大富豪 ----------
let dfId = 500;
const dc = (spec) => spec.split(' ').map((x) => (x === 'JK' ? { id: dfId++, s: 'j', r: 16 } : { id: dfId++, s: x[0], r: { J: 11, Q: 12, K: 13, A: 14, 2: 15 }[x.slice(1)] || Number(x.slice(1)) }));
const dfState = (hands, extra = {}) => Object.assign(df.init({}, hands.length), { hands: hands.map(dc), phase: 'play', turn: 0, field: null, finished: [], passed: hands.map(() => false), revolution: false }, extra);
const dfLabel = (x) => (x === 'JK' ? 'JOKER' : df.SUIT_MARK[x[0]] + x.slice(1));
const ids = (s, seat, spec) => spec.split(' ').map((x) => s.hands[seat].find((c) => df.cardLabel(c) === dfLabel(x)).id);
test('daifugo: 配り切り・♦3から', () => {
  const s = df.init({}, 4);
  assert.equal(s.hands.flat().length, 53);
  assert.ok(s.hands[s.turn].some((c) => c.s === 'd' && c.r === 3));
});
test('daifugo: 組の判定（ペア・階段・ジョーカー）', () => {
  assert.deepEqual(df.combos(dc('s5 h5')).map((c) => c.type), ['set']);
  assert.ok(df.combos(dc('s5 s6 s7')).some((c) => c.type === 'seq' && c.key === 5));
  assert.ok(df.combos(dc('s5 JK s7')).some((c) => c.type === 'seq' && c.key === 5), 'ジョーカーで穴埋め');
  assert.equal(df.combos(dc('s5 h6 s7')).length, 0, 'マークが違う階段はだめ');
  assert.equal(df.combos(dc('s5 h6')).length, 0);
});
test('daifugo: 強い方しか出せない・パスで場が流れる', () => {
  let s = dfState(['s5 sK', 'h4 h9', 'c3 c6']);
  s = df.applyMove(s, { play: ids(s, 0, 's5') }, 0);
  assert.throws(() => df.applyMove(s, { play: ids(s, 1, 'h4') }, 1), /強い/);
  s = df.applyMove(s, { play: ids(s, 1, 'h9') }, 1);
  s = df.applyMove(s, { pass: true }, 2);
  s = df.applyMove(s, { pass: true }, 0);
  assert.equal(s.field, null, '全員パスで流れる');
  assert.equal(s.turn, 1, '最後に出した人から');
});
test('daifugo: 8切り・革命・スペ3返し', () => {
  let s = dfState(['s8 sK', 'h4 h9', 'c3 c6']);
  s = df.applyMove(s, { play: ids(s, 0, 's8') }, 0);
  assert.equal(s.field, null);
  assert.equal(s.turn, 0, '8切りで同じ人から');
  let r = dfState(['s5 h5 d5 c5 s3', 'h4 h9', 'c3 c6']);
  r = df.applyMove(r, { play: ids(r, 0, 's5 h5 d5 c5') }, 0);
  assert.equal(r.revolution, true);
  let j = dfState(['JK s9', 's3 h9', 'c4 c6']);
  j = df.applyMove(j, { play: ids(j, 0, 'JK') }, 0);
  j = df.applyMove(j, { play: ids(j, 1, 's3') }, 1);
  assert.equal(j.field.key, 3, 'スペ3でジョーカーに勝てる');
});
test('daifugo: 上がり順で順位・次のラウンドでカード交換', () => {
  let s = dfState(['s9', 'h4 h5', 'c3 c6 c7']);
  s = df.applyMove(s, { play: ids(s, 0, 's9') }, 0);
  assert.deepEqual(s.finished, [0]);
  s = df.applyMove(s, { pass: true }, 1);
  s = df.applyMove(s, { pass: true }, 2);
  assert.equal(s.turn, 1, '上がった人の次から');
  s = df.applyMove(s, { play: ids(s, 1, 'h4') }, 1);
  s = df.applyMove(s, { play: ids(s, 2, 'c6') }, 2);
  s = df.applyMove(s, { pass: true }, 1);
  s = df.applyMove(s, { play: ids(s, 2, 'c3') }, 2);
  s = df.applyMove(s, { play: ids(s, 1, 'h5') }, 1);
  assert.equal(s.phase, 'result');
  assert.deepEqual(s.lastRanks, [0, 1, 2]);
  assert.deepEqual(s.points, [2, 1, 0]);
  assert.throws(() => df.applyMove(s, { next: true }, 1, null, { hostSeat: 0 }), /ホストだけ/);
  s = df.applyMove(s, { next: true }, 0, null, { hostSeat: 0 });
  assert.equal(s.phase, 'exchange');
  assert.equal(s.turn, 2, '大貧民から');
  assert.equal(s.hands[0].length, 20, '大富豪は2枚もらう');
  s = df.applyMove(s, { give: s.hands[0].slice(0, 2).map((c) => c.id) }, 0);
  assert.equal(s.phase, 'play');
  assert.equal(s.hands.flat().length, 53);
});
test('daifugo: ランダム対局が必ず終わる', () => {
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let g = 0; g < 30; g++) {
    let s = df.init({}, 2 + (g % 5)), guard = 0;
    while (s.phase !== 'result' && guard++ < 2000) {
      const p = s.turn, hand = s.hands[p];
      let played = false;
      for (const k of [2, 1]) {
        for (let i = 0; i + k <= hand.length && !played; i++) {
          const pick = hand.slice(i, i + k).map((c) => c.id);
          try {
            df.checkPlay(s, p, pick);
            if (rnd() < 0.8 || !s.field) { s = df.applyMove(s, { play: pick }, p); played = true; }
          } catch { /* 出せない組 */ }
        }
        if (played) break;
      }
      if (!played) s = s.field ? df.applyMove(s, { pass: true }, p) : df.applyMove(s, { play: [hand[0].id] }, p);
    }
    assert.equal(s.phase, 'result', '終わらない');
    assert.equal(s.lastRanks.length, s.players);
  }
});

// ---------- ポーカー ----------
const pc = (spec) => spec.split(' ').map((x) => ({ s: x.at(-1).toLowerCase(), r: { A: 14, K: 13, Q: 12, J: 11, T: 10 }[x[0]] || Number(x.slice(0, -1)) }));
const chips = (s) => s.stacks.reduce((a, b) => a + b, 0) + s.pot;
test('poker: 役の強さ', () => {
  const name = (x) => pk.bestHand(pc(x)).name;
  assert.equal(name('AS KS QS JS TS 2D 3C'), 'ロイヤルフラッシュ');
  assert.equal(name('5H 4D 3C 2S AH KD KC'), 'ストレート');
  assert.equal(name('9S 9H 9D 4C 4S 2D 7H'), 'フルハウス');
  assert.equal(name('2H 2D 9C 9D KH 3S 4D'), 'ツーペア');
  const a = pk.bestHand(pc('AS AH KD 7C 3S 2D 9H')).score, b = pk.bestHand(pc('AD AC QD 7H 3D 2C 9S')).score;
  assert.ok(pk.compareScore(a, b) > 0, 'キッカーで勝つ');
});
test('poker: ブラインド・フォールドで勝つ・次のハンド', () => {
  let s = pk.init({}, 3);
  const bb = s.bb;
  assert.equal(s.stacks[s.sb], 990);
  assert.equal(s.stacks[bb], 980);
  assert.equal(s.turn, s.button, '3人ならボタンから');
  s = pk.applyMove(s, { fold: true }, s.turn);
  s = pk.applyMove(s, { fold: true }, s.turn);
  assert.equal(s.phase, 'showdown');
  assert.equal(s.stacks[bb], 1010);
  assert.equal(s.tickAfter, pk.NEXT_HAND_MS);
  const next = pk.tick(s);
  assert.equal(next.handNo, 2);
  assert.equal(chips(next), 3000);
});
test('poker: コールとチェックで最後まで進みショーダウン', () => {
  let s = pk.init({}, 2);
  s = pk.applyMove(s, { call: true }, s.turn);
  s = pk.applyMove(s, { check: true }, s.turn);
  assert.equal(s.phase, 'flop');
  assert.equal(s.board.length, 3);
  for (let i = 0; i < 6 && s.phase !== 'showdown'; i++) s = pk.applyMove(s, { check: true }, s.turn);
  assert.equal(s.phase, 'showdown');
  assert.equal(s.stacks[0] + s.stacks[1], 2000);
  assert.equal(Object.keys(s.showdown.hands).length, 2);
  assert.notEqual(pk.viewFor(s, 0).holes[1], 'hidden', 'ショーダウンでは相手の手札が見える');
});
test('poker: レイズの最小額・オールインでサイドポット', () => {
  let s = pk.init({}, 3);
  assert.throws(() => pk.applyMove(s, { raise: 30 }, s.turn), /40〜/);
  const short = s.turn;
  s.stacks[short] = 100; // 少ないチップにしてオールインさせる
  const total = chips(s);
  s = pk.applyMove(s, { raise: 100 }, short);
  assert.ok(s.allIn[short]);
  s = pk.applyMove(s, { raise: 500 }, s.turn);
  s = pk.applyMove(s, { call: true }, s.turn);
  for (let i = 0; i < 10 && s.phase !== 'showdown'; i++) s = pk.applyMove(s, { check: true }, s.turn);
  assert.equal(s.phase, 'showdown');
  assert.equal(s.showdown.pots.length, 2, 'メインポットとサイドポット');
  assert.equal(s.stacks.reduce((a, b) => a + b, 0), total, 'チップの合計が変わらない');
});
test('poker: ランダム対局でチップが保たれ、勝者が決まる', () => {
  let seed = 9;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rng = (n = 6) => 1 + Math.floor(rnd() * n);
  for (let g = 0; g < 15; g++) {
    const n = 2 + (g % 5);
    let s = pk.init({}, n, rng), guard = 0;
    while (!s.result && guard++ < 20000) {
      if (s.phase === 'showdown') { s = pk.tick(s, rng); continue; }
      const p = s.turn, o = pk.options(s, p);
      const x = rnd();
      if (x < 0.15 && !o.canCheck) s = pk.applyMove(s, { fold: true }, p);
      else if (x < 0.35 && o.canRaise) s = pk.applyMove(s, { raise: o.maxRaiseTo }, p);
      else if (x < 0.5 && o.canRaise) s = pk.applyMove(s, { raise: o.minRaiseTo }, p);
      else s = pk.applyMove(s, o.canCheck ? { check: true } : { call: true }, p);
      assert.equal(chips(s), n * pk.START_CHIPS, 'チップの合計が変わらない');
    }
    assert.ok(s.result, '勝者が決まらない');
  }
});

// ---------- ブロックス ----------
test('blokus: ピースは21個・89マス、向きの変換', () => {
  assert.equal(bk.PIECES.length, 21);
  assert.equal(bk.TOTAL, 89);
  assert.deepEqual(bk.orient([[0, 0], [0, 1]], 1), [[0, 0], [1, 0]]);
});
test('blokus: 最初は角・2個目は角で接して辺で接しない', () => {
  let s = bk.init({}, 4);
  assert.throws(() => bk.applyMove(s, { piece: 0, t: 0, r: 5, c: 5 }, 0), /角のマス/);
  s = bk.applyMove(s, { piece: 1, t: 0, r: 0, c: 0 }, 0);
  assert.equal(s.color, 1);
  s = bk.applyMove(s, { piece: 0, t: 0, r: 0, c: 19 }, 1);
  s = bk.applyMove(s, { piece: 0, t: 0, r: 19, c: 19 }, 2);
  s = bk.applyMove(s, { piece: 0, t: 0, r: 19, c: 0 }, 3);
  assert.throws(() => bk.applyMove(s, { piece: 0, t: 0, r: 0, c: 2 }, 0), /辺で接して/);
  assert.throws(() => bk.applyMove(s, { piece: 0, t: 0, r: 3, c: 3 }, 0), /角で接する/);
  s = bk.applyMove(s, { piece: 0, t: 0, r: 1, c: 2 }, 0);
  assert.equal(s.board[1][2], 0);
});
test('blokus: 2人なら1人2色・3人なら緑なし・点数', () => {
  const s = bk.init({}, 2);
  assert.deepEqual(bk.colorsOf(2, 0), [0, 2]);
  assert.equal(bk.ownerOf(2, 3), 1);
  assert.equal(bk.seatScore(s, 0), -178);
  assert.equal(bk.init({}, 3).done[3], true);
});
test('blokus: ランダム対局で盤とピースの数が合う', () => {
  let seed = 21;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const n of [2, 3, 4]) {
    let s = bk.init({}, n), guard = 0;
    while (!s.result && guard++ < 200) {
      const color = s.color, seat = bk.ownerOf(n, color);
      let placed = false;
      for (let tries = 0; tries < 4000 && !placed; tries++) {
        const piece = Math.floor(rnd() * 21);
        if (!s.remaining[color][piece]) continue;
        const t = Math.floor(rnd() * 8), r = Math.floor(rnd() * 20), c = Math.floor(rnd() * 20);
        if (!bk.placementError(s, color, bk.placeCells(piece, t, r, c))) { s = bk.applyMove(s, { piece, t, r, c }, seat); placed = true; }
      }
      if (!placed) break;
    }
    const squares = s.board.flat().filter((x) => x !== null).length;
    const used = [0, 1, 2, 3].reduce((a, c) => a + bk.PIECES.reduce((b, p, i) => b + (s.remaining[c][i] ? 0 : p.length), 0), 0);
    assert.equal(squares, used, '盤のマス数と使ったピースが一致');
    assert.ok(squares > 40, '何手も置けている');
  }
});


// ---------- みんなでポンコツペイント ----------
const ptAnswer = (s) => paint.THEME_LIST[s.theme][0];
test('paint: お題の一覧と答えの比べ方', () => {
  assert.ok(paint.THEME_LIST.length >= 200, 'お題は200以上');
  assert.equal(new Set(paint.THEME_LIST.map((t) => t[0])).size, paint.THEME_LIST.length, 'お題の重複なし');
  assert.equal(paint.normalizeAnswer('ネ コ'), paint.normalizeAnswer('ねこ'));
  assert.equal(paint.normalizeAnswer('ＰＣ'), 'pc');
});
test('paint: お題選び→描く（直線と円だけ）→正解で点数', () => {
  let s = paint.init({ turns: 1, seconds: 60 }, 3);
  assert.equal(s.phase, 'choose');
  assert.equal(s.painter, 0);
  assert.equal(s.totalRounds, 3);
  const v1 = paint.viewFor(s, 1);
  assert.ok(v1.choices.every((c) => c === '？'), '描く人以外にはお題候補が見えない');
  assert.throws(() => paint.applyMove(s, { pick: 0 }, 1), /選べません/);
  s = paint.applyMove(s, { pick: 1 }, 0);
  assert.equal(s.phase, 'draw');
  assert.equal(paint.viewFor(s, 1).theme, null, '答える人にはお題が見えない');
  assert.equal(paint.viewFor(s, 0).theme, ptAnswer(s));
  s = paint.applyMove(s, { shape: { type: 'line', x1: 10, y1: 10, x2: 300, y2: 200 } }, 0);
  s = paint.applyMove(s, { shape: { type: 'circle', x1: 500, y1: 300, x2: 600, y2: 300 } }, 0);
  assert.throws(() => paint.applyMove(s, { shape: { type: 'free' } }, 0), /直線と円/);
  assert.throws(() => paint.applyMove(s, { shape: { type: 'line' } }, 1), /描けません/);
  s = paint.applyMove(s, { undo: true }, 0);
  assert.equal(s.shapes.length, 1);
  s = paint.applyMove(s, { guess: 'ぜったいちがうこたえ' }, 1);
  assert.equal(s.feed.at(-1).correct, false);
  s = paint.applyMove(s, { guess: paint.THEME_LIST[s.theme].at(-1) }, 1);
  assert.equal(s.scores[1], 10);
  assert.equal(s.scores[0], 3);
  assert.equal(paint.viewFor(s, 2).feed.at(-1).text, null, '正解の答えはほかの人に見えない');
  assert.throws(() => paint.applyMove(s, { guess: 'x' }, 1), /もう正解/);
  s = paint.applyMove(s, { guess: ptAnswer(s) }, 2);
  assert.equal(s.scores[2], 8);
  assert.equal(s.phase, 'reveal', '全員正解で答え発表');
  assert.ok(s.tickAt > Date.now());
});
test('paint: 時間切れ・全ラウンドで終了', () => {
  let s = paint.init({ turns: 1 }, 2);
  s = paint.tick(s); // お題選びの時間切れ → 1つ目のお題で描き始める
  assert.equal(s.phase, 'draw');
  s = paint.tick(s); // 描く時間切れ
  assert.equal(s.phase, 'reveal');
  s = paint.tick(s);
  assert.equal(s.round, 2);
  assert.equal(s.painter, 1);
  s = paint.applyMove(s, { pick: 0 }, 1);
  s = paint.applyMove(s, { guess: ptAnswer(s) }, 0);
  assert.equal(s.phase, 'reveal');
  s = paint.tick(s);
  assert.equal(s.phase, 'end');
  assert.equal(s.result.winner, 0);
});
test('paint: 描く人が抜けたら答え発表', () => {
  let s = paint.init({}, 3);
  s = paint.applyMove(s, { pick: 0 }, 0);
  s = paint.applyMove(s, { resign: true }, 0);
  assert.equal(s.phase, 'reveal');
  s = paint.tick(s);
  assert.equal(s.painter, 1, '抜けた人は飛ばす');
});


// ---------- スカル ----------
const skPlaceAll = (s, types) => types.reduce((st, t, p) => skull.applyMove(st, { place: t }, p), s);
test('skull: 1枚目は全員が同時に置く・中身はほかの人に見えない', () => {
  let s = skull.init({}, 3);
  assert.equal(s.phase, 'place');
  assert.ok(skull.canActOutOfTurn(s));
  s = skull.applyMove(s, { place: 'skull' }, 2);
  assert.throws(() => skull.applyMove(s, { place: 'flower' }, 2), /もう置きました/);
  assert.equal(skull.viewFor(s, 0).stacks[2][0], 'hidden');
  assert.equal(skull.viewFor(s, 2).stacks[2][0], 'skull');
  assert.deepEqual(skull.viewFor(s, 0).hands[2], { count: 3 });
  s = skull.applyMove(s, { place: 'flower' }, 0);
  s = skull.applyMove(s, { place: 'flower' }, 1);
  assert.equal(s.phase, 'build');
  assert.equal(s.turn, s.first);
});
test('skull: 置く・宣言・パスで挑戦者が決まり、花だけなら成功', () => {
  let s = skull.init({}, 3);
  s.first = 0;
  s = skPlaceAll(s, ['flower', 'flower', 'flower']);
  s.turn = 0;
  s = skull.applyMove(s, { place: 'flower' }, 0);
  assert.equal(s.turn, 1);
  assert.throws(() => skull.applyMove(s, { bid: 5 }, 1), /1〜4枚/);
  s = skull.applyMove(s, { bid: 2 }, 1);
  assert.equal(s.phase, 'bid');
  assert.throws(() => skull.applyMove(s, { bid: 2 }, 2), /3〜4枚/);
  s = skull.applyMove(s, { pass: true }, 2);
  s = skull.applyMove(s, { pass: true }, 0);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.challenger, 1);
  assert.equal(s.flowersFound, 1, '自分の山は自動でめくる');
  assert.throws(() => skull.applyMove(s, { flip: 1 }, 1), /自分の山/);
  s = skull.applyMove(s, { flip: 0 }, 1);
  assert.equal(s.points[1], 1);
  assert.equal(s.phase, 'roundEnd');
  s = skull.tick(s);
  assert.equal(s.phase, 'place');
  assert.equal(s.first, 1, '挑戦者から次のラウンド');
  assert.equal(s.hands[0].flower, 3, 'コースターは手元に戻る');
});
test('skull: ドクロで失敗すると1枚失い、ドクロの持ち主から次のラウンド', () => {
  let s = skull.init({}, 3);
  s.first = 0;
  s = skPlaceAll(s, ['flower', 'skull', 'flower']);
  s.turn = 0;
  s = skull.applyMove(s, { bid: 3 }, 0); // 場の枚数ちょうど → すぐ挑戦
  assert.equal(s.phase, 'reveal');
  s = skull.applyMove(s, { flip: 1 }, 0);
  assert.equal(s.phase, 'roundEnd');
  assert.equal(s.owned[0].flower + s.owned[0].skull, 3);
  assert.equal(s.first, 1);
  assert.ok(['flower', 'skull'].includes(skull.viewFor(s, 0).lost[0]));
  assert.equal(skull.viewFor(s, 1).lost[0], null, '何を失ったかは本人にだけ見える');
});
test('skull: 自分のドクロで失敗・2回成功で勝ち', () => {
  let s = skull.init({}, 3);
  s.first = 0;
  s = skPlaceAll(s, ['skull', 'flower', 'flower']);
  s.turn = 0;
  s = skull.applyMove(s, { bid: 3 }, 0);
  assert.equal(s.phase, 'roundEnd', '自分の山にドクロがあれば即失敗');
  assert.equal(s.lastRound.skullOwner, 0);
  let t = skull.init({}, 3);
  t.points[2] = 1;
  t.first = 2;
  t = skPlaceAll(t, ['flower', 'flower', 'flower']);
  t.turn = 2;
  t = skull.applyMove(t, { bid: 1 }, 2);
  t = skull.applyMove(t, { pass: true }, 0);
  t = skull.applyMove(t, { pass: true }, 1);
  assert.equal(t.result.winner, 2);
});
test('skull: ランダム対局で枚数が合い、必ず終わる', () => {
  let seed = 13;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rng = (n = 6) => 1 + Math.floor(rnd() * n);
  for (let g = 0; g < 40; g++) {
    const n = 3 + (g % 4);
    let s = skull.init({}, n, rng), guard = 0;
    while (!s.result && guard++ < 3000) {
      if (s.phase === 'roundEnd') { s = skull.tick(s); continue; }
      if (s.phase === 'place') {
        const p = [...Array(n).keys()].find((q) => !s.out[q] && !s.stacks[q].length);
        const h = s.hands[p];
        s = skull.applyMove(s, { place: h.skull && rnd() < 0.3 ? 'skull' : h.flower ? 'flower' : 'skull' }, p, rng);
      } else if (s.phase === 'build') {
        const p = s.turn, h = s.hands[p];
        if (h.flower + h.skull && rnd() < 0.6) s = skull.applyMove(s, { place: h.flower ? 'flower' : 'skull' }, p, rng);
        else s = skull.applyMove(s, { bid: 1 + Math.floor(rnd() * Math.min(3, skull.tableCount(s))) }, p, rng);
      } else if (s.phase === 'bid') {
        const p = s.turn;
        if (rnd() < 0.5 && s.bid.n < skull.tableCount(s)) s = skull.applyMove(s, { bid: s.bid.n + 1 }, p, rng);
        else s = skull.applyMove(s, { pass: true }, p, rng);
      } else if (s.phase === 'reveal') {
        const t = [...Array(n).keys()].filter((q) => q !== s.challenger && s.revealed[q] < s.stacks[q].length);
        s = skull.applyMove(s, { flip: t[Math.floor(rnd() * t.length)] }, s.challenger, rng);
      }
      for (let p = 0; p < n; p++) {
        assert.equal(s.hands[p].flower + s.hands[p].skull + s.stacks[p].length, s.phase === 'roundEnd' || s.phase === 'end' ? s.hands[p].flower + s.hands[p].skull + s.stacks[p].length : s.owned[p].flower + s.owned[p].skull);
      }
    }
    assert.ok(s.result, '終わらない');
  }
});


test('paint: フリーハンドモード（ペンの線）・ポンコツモードでは使えない', () => {
  assert.equal(paint.normalizeOptions({ mode: 'free' }).mode, 'free');
  assert.equal(paint.normalizeOptions({ mode: 'x' }).mode, 'ponkotsu');
  const path = { type: 'path', pts: [[10, 10], [20, 30], [40, 35], [2000, -5]] };
  let s = paint.applyMove(paint.init({ mode: 'free' }, 2), { pick: 0 }, 0);
  s = paint.applyMove(s, { shape: path }, 0);
  assert.deepEqual(s.shapes[0].pts.at(-1), [paint.WIDTH, 0], '座標は盤の中に収める');
  s = paint.applyMove(s, { shape: { type: 'line', x1: 0, y1: 0, x2: 50, y2: 50 } }, 0);
  assert.equal(s.shapes.length, 2, 'フリーハンドでも直線は使える');
  assert.throws(() => paint.applyMove(s, { shape: { type: 'path', pts: [[1, 1]] } }, 0), /短すぎ/);
  const long = { type: 'path', pts: Array.from({ length: 1000 }, (_, i) => [i % 1000, 100]) };
  s = paint.applyMove(s, { shape: long }, 0);
  assert.equal(s.shapes.at(-1).pts.length, paint.MAX_PATH_POINTS, '点の数は上限まで');
  let p = paint.applyMove(paint.init({}, 2), { pick: 0 }, 0);
  assert.throws(() => paint.applyMove(p, { shape: path }, 0), /直線と円しか/);
});
test('paint: お題を増やした', () => {
  assert.ok(paint.THEME_LIST.length >= 400);
  const answers = paint.THEME_LIST.map((t) => t[0]);
  assert.equal(new Set(answers).size, answers.length);
});


// ---------- 軍儀 ----------
const gEmpty = (mode = 'advanced', extra = {}) => Object.assign(gungi.init({ mode }), {
  phase: 'play', board: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [])),
  hands: [{}, {}], turn: 0, positions: {}, history: [],
}, extra);
const gPut = (s, r, c, ...pieces) => { s.board[r][c].push(...pieces.map(([o, t]) => ({ o, t }))); return s; };
const gTargets = (s, r, c) => gungi.reachable(s.board, r, c).map((x) => x.to.join(',')).sort();
test('gungi: 入門・初級の固定配置と持ち駒', () => {
  const intro = gungi.init({ mode: 'intro' });
  const count = (s, o) => s.board.flat().flat().filter((x) => x.o === o).length + Object.values(s.hands[o]).reduce((a, b) => a + b, 0);
  assert.equal(count(intro, 0), 20);
  assert.equal(count(intro, 1), 20);
  assert.equal(intro.board[8][4][0].t, '帥');
  assert.equal(intro.board[0][4][0].t, '帥');
  assert.equal(intro.board[0][4][0].o, 1);
  assert.deepEqual(intro.hands[0], { 帥: 0, 大: 0, 中: 0, 小: 2, 侍: 0, 槍: 2, 馬: 2, 忍: 0, 砦: 0, 兵: 1 });
  const beg = gungi.init({ mode: 'beginner' });
  assert.equal(count(beg, 0), 22);
  assert.equal(beg.board[7][2][0].t, '弓');
  assert.equal(beg.phase, 'play');
  assert.equal(gungi.init({ mode: 'advanced' }).phase, 'draft');
});
test('gungi: 段が上がると遠くまで動ける・間に駒があると進めない', () => {
  const s = gEmpty();
  gPut(s, 4, 4, [0, '兵']);
  gPut(s, 0, 0, [1, '帥']); gPut(s, 8, 8, [0, '帥']);
  assert.deepEqual(gTargets(s, 4, 4), ['3,4', '5,4']);
  gPut(s, 4, 4, [0, '兵']); // 2段目
  assert.deepEqual(gTargets(s, 4, 4), ['2,4', '3,4', '5,4', '6,4']);
  gPut(s, 3, 4, [1, '兵']);
  assert.ok(!gTargets(s, 4, 4).includes('2,4'), '前に駒があると2マス先へは行けない');
});
test('gungi: 低い駒は高い塔に手を出せない・取ると敵の駒だけ消える', () => {
  const s = gEmpty();
  gPut(s, 0, 0, [1, '帥']); gPut(s, 8, 8, [0, '帥']);
  gPut(s, 5, 4, [0, '兵']);
  gPut(s, 4, 4, [0, '侍'], [1, '兵']); // 2段の塔（上が敵）
  assert.ok(!gungi.legalMoves(s).some((m) => m.from && m.from[0] === 5 && m.to[0] === 4), '1段では2段の塔を取れない');
  gPut(s, 5, 4, [0, '兵']); // 2段に
  const cap = gungi.legalMoves(s).find((m) => m.from && m.from[0] === 5 && m.to[0] === 4 && m.kind === 'capture');
  assert.ok(cap);
  const ns = gungi.applyMove(s, cap, 0);
  assert.deepEqual(ns.board[4][4].map((x) => x.o + x.t), ['0侍', '0兵'], '味方の侍は残り、敵の兵だけ取られる');
});
test('gungi: 飛び越える駒（弓）と、高い塔は飛び越えられない', () => {
  const s = gEmpty();
  gPut(s, 0, 0, [1, '帥']); gPut(s, 8, 8, [0, '帥']);
  gPut(s, 6, 4, [0, '弓']);
  gPut(s, 5, 4, [1, '兵']);
  const t = gungi.reachable(s.board, 6, 4);
  assert.ok(t.some((x) => x.to[0] === 4 && x.to[1] === 4 && x.jump), '前の駒を飛び越えて2マス先へ');
  gPut(s, 5, 4, [1, '兵']); // 2段の塔になったら飛び越えられない
  assert.ok(!gungi.reachable(s.board, 6, 4).some((x) => x.to[0] === 4 && x.to[1] === 4));
});
test('gungi: 帥にはツケられない・入門は2段まで・自分の帥が取られる手は指せない', () => {
  const s = gEmpty('intro');
  gPut(s, 0, 0, [1, '帥']); gPut(s, 8, 4, [0, '帥']);
  gPut(s, 7, 4, [0, '兵']);
  assert.ok(!gungi.legalMoves(s).some((m) => m.from && m.from[0] === 7 && m.to[0] === 8), '帥の上には乗れない');
  gPut(s, 6, 4, [0, '兵'], [0, '兵']);
  const ms = gungi.legalMoves(s).filter((m) => m.from && m.from[0] === 7 && m.from[1] === 4 && m.to[0] === 6 && m.to[1] === 4);
  assert.equal(ms.length, 0, '入門は2段までなので3段目にはツケられない');
  // 帥を動かして敵の利きに入る手は指せない
  const t = gEmpty();
  gPut(t, 0, 0, [1, '帥']); gPut(t, 8, 4, [0, '帥']);
  gPut(t, 5, 3, [1, '大']); // 縦に走る大が7,3にも8,3にも利く
  assert.ok(!gungi.legalMoves(t).some((m) => m.from && m.to[0] === 8 && m.to[1] === 3));
});
test('gungi: 新は一番前の駒より前に打てない・帥の上に打てない', () => {
  const s = gEmpty('advanced', { hands: [{ 兵: 1 }, {}] });
  gPut(s, 0, 0, [1, '帥']); gPut(s, 8, 4, [0, '帥']); gPut(s, 6, 0, [0, '兵']);
  const drops = gungi.legalMoves(s).filter((m) => m.drop);
  assert.ok(drops.every((m) => m.to[0] >= 6), '6行目より前には打てない');
  assert.ok(!drops.some((m) => m.to[0] === 8 && m.to[1] === 4), '帥の上には打てない');
  assert.ok(drops.some((m) => m.to[0] === 6 && m.to[1] === 0), '自分の駒の上には打てる');
});
test('gungi: 謀の寝返り', () => {
  const s = gEmpty('advanced', { hands: [{ 侍: 1 }, {}] });
  gPut(s, 0, 0, [1, '帥']); gPut(s, 8, 8, [0, '帥']);
  gPut(s, 5, 4, [0, '謀']); gPut(s, 4, 3, [1, '侍']);
  const b = gungi.legalMoves(s).find((m) => m.betray);
  assert.ok(b);
  const ns = gungi.applyMove(s, b, 0);
  assert.deepEqual(ns.board[4][3].map((x) => x.o + x.t), ['0侍', '0謀']);
  assert.equal(ns.hands[0].侍, 0);
});
test('gungi: 詰みで勝ち', () => {
  const s = gEmpty();
  gPut(s, 0, 0, [1, '帥']);
  gPut(s, 8, 8, [0, '帥']);
  gPut(s, 2, 1, [0, '大']); // 1行目をふさぐ
  gPut(s, 2, 8, [0, '大']);
  gPut(s, 5, 0, [0, '中']);
  // 大を0,1… ではなく、縦の大で1列目へ王手
  const mate = gungi.legalMoves(s).find((m) => m.from && m.from[0] === 2 && m.from[1] === 8 && m.to[0] === 0 && m.to[1] === 8);
  assert.ok(mate);
  const ns = gungi.applyMove(s, mate, 0);
  assert.equal(ns.check, true);
  assert.equal(ns.result && ns.result.winner, 0, JSON.stringify(ns.result));
});
test('gungi: 自由配置（帥から・自陣3段・配置完了・おすすめ配置）', () => {
  let s = gungi.init({ mode: 'advanced' });
  assert.throws(() => gungi.applyMove(s, { place: '兵', to: [8, 0] }, 0), /帥/);
  assert.throws(() => gungi.applyMove(s, { place: '帥', to: [5, 4] }, 0), /置けません/);
  s = gungi.applyMove(s, { place: '帥', to: [8, 4] }, 0);
  assert.equal(s.turn, 1);
  s = gungi.applyMove(s, { autoSetup: true }, 1);
  assert.ok(s.done[1]);
  assert.equal(s.turn, 0, '相手が完了したら自分だけ続けて置ける');
  s = gungi.applyMove(s, { place: '兵', to: [6, 4] }, 0);
  assert.equal(s.turn, 0);
  s = gungi.applyMove(s, { done: true }, 0);
  assert.equal(s.phase, 'play');
  assert.equal(s.turn, 0);
  assert.equal(s.board[0][4][0].t, '帥', '後手の帥は180度回した位置');
});
test('gungi: ランダム対局・CPU同士の対局でエラーなく進み、駒の数が増えない', () => {
  let seed = 17;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rng = (n = 6) => 1 + Math.floor(rnd() * n);
  const total = (s) => s.board.flat().flat().length + s.hands.reduce((a, h) => a + Object.values(h).reduce((x, y) => x + y, 0), 0);
  for (const mode of ['intro', 'beginner', 'intermediate', 'advanced']) {
    for (const cpu of [false, true]) {
      let s = gungi.init({ mode });
      let prev = total(s);
      for (let i = 0; i < (cpu ? 60 : 200) && !s.result; i++) {
        const move = cpu || s.phase === 'draft' ? gungi.aiMove(s, s.turn, rng) : (() => { const ms = gungi.legalMoves(s); return ms[Math.floor(rnd() * ms.length)]; })();
        s = gungi.applyMove(s, move, s.turn);
        const now = total(s);
        assert.ok(now <= prev, '駒が増えた');
        prev = now;
        assert.ok(!gungi.inCheck(s.board, 1 - s.turn) || s.result, '指した側の帥が取られる状態になっていない');
        for (const row of s.board) for (const st of row) assert.ok(st.length <= gungi.MODES[mode].maxTier, '段数の上限を超えた');
      }
    }
  }
});

test('paint: むずかしいお題・キャラクターのお題', () => {
  const idx = (w) => paint.THEME_LIST.findIndex((t) => t[0] === w);
  assert.equal(paint.THEME_TAGS[idx('ドラえもん')], 'chara');
  assert.equal(paint.THEME_TAGS[idx('自由の女神')], 'hard');
  assert.equal(paint.THEME_TAGS[idx('犬')], '');
  assert.ok(paint.THEME_LIST[idx('ミッキーマウス')].includes('ミッキー'), '短い呼び方でも正解');
  assert.equal(paint.THEME_TAGS.length, paint.THEME_LIST.length);
});
test('paint: 誰も正解できないと描いた人は -5点、履歴用の絵が取り出せる', () => {
  let s = paint.init({ turns: 1, seconds: 60 }, 3);
  s = paint.applyMove(s, { pick: 0 }, 0);
  assert.equal(paint.archive(s), null, 'まだ答え発表ではない');
  s = paint.applyMove(s, { shape: { type: 'line', x1: 10, y1: 10, x2: 300, y2: 200 } }, 0);
  s = paint.tick(s); // 時間切れ
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.scores, [-5, 0, 0]);
  assert.equal(s.penalty, 5);
  const a = paint.archive(s);
  assert.equal(a.theme, ptAnswer(s));
  assert.equal(a.shapes.length, 1);
  assert.deepEqual(a.correct, []);
  assert.equal(a.guessers, 2);
  // 1人でも正解すれば減点なし
  s = paint.tick(s);
  assert.equal(s.painter, 1);
  s = paint.applyMove(s, { pick: 0 }, 1);
  s = paint.applyMove(s, { guess: ptAnswer(s) }, 2);
  s = paint.applyMove(s, { giveUp: true }, 1);
  assert.equal(s.penalty, 0);
  assert.deepEqual(s.scores, [-5, 3, 10]);
  // 何も描かずに終わった絵は履歴に入れない
  assert.equal(paint.archive(s), null);
});
test('paint: 描く人固定モードはホストがずっと描く', () => {
  assert.equal(paint.normalizeOptions({ painter: 'fixed' }).painter, 'fixed');
  assert.equal(paint.normalizeOptions({ painter: 'x' }).painter, 'rotate');
  assert.match(paint.variantName({ painter: 'fixed', turns: 2 }), /描く人固定・10問/);
  let s = paint.init({ turns: 1, seconds: 60, painter: 'fixed' }, 3, undefined, { hostSeat: 1 });
  assert.equal(s.totalRounds, 5);
  for (let r = 1; r <= 3; r++) {
    assert.equal(s.painter, 1, `第${r}ラウンドもホスト`);
    s = paint.applyMove(s, { pick: 0 }, 1);
    s = paint.applyMove(s, { giveUp: true }, 1);
    s = paint.tick(s);
  }
  // 描く人が抜けたら次の人が引き継ぐ
  s = paint.applyMove(s, { resign: true }, 1);
  s = paint.tick(s);
  assert.equal(s.painter, 2);
  assert.equal(s.round, 5);
  s = paint.applyMove(s, { pick: 0 }, 2);
  s = paint.applyMove(s, { giveUp: true }, 2);
  s = paint.tick(s);
  assert.ok(s.result, '5問で終わり');
});

test('gungi: どちらの駒でも動ける範囲を出せる（相手の番でも）', () => {
  const s = gungi.init({ mode: 'intro' });
  // 先手の番に後手の兵（９三）の動ける所: 前後に1つ
  const t = gungi.pieceTargets(s, 2, 0);
  assert.deepEqual(t.map((x) => x.to).sort(), [[1, 0], [3, 0]]);
  assert.deepEqual(t[0].kinds, ['move']);
  assert.deepEqual(gungi.pieceTargets(s, 4, 4), [], '空きマスは何もない');
});
test('paint: お題の3つのうち1つは必ずむずかしいお題', () => {
  let s = paint.init({ turns: 3, seconds: 60 }, 8);
  for (let r = 0; r < 24; r++) {
    assert.ok(s.choices.some((i) => paint.THEME_TAGS[i] === 'hard'), `第${s.round}ラウンド`);
    assert.equal(new Set(s.choices).size, 3, '同じお題は出ない');
    s = paint.tick(paint.tick(paint.tick(s))); // 選ぶ→時間切れ→次のラウンド
    if (s.result) break;
  }
});
console.log(`\n${n} tests passed`);
