import assert from 'node:assert/strict';
import * as chess from '../public/games/chess.js';
import * as shogi from '../public/games/shogi.js';
import * as gobblet from '../public/games/gobblet.js';
import * as othello from '../public/games/othello.js';
import * as wbk from '../public/games/wordbasket.js';
import * as cc from '../public/games/catchoco.js';
import * as ito from '../public/games/ito.js';
import * as df from '../public/games/daifugo.js';
import * as pk from '../public/games/poker.js';
import * as bk from '../public/games/blokus.js';
import * as paint from '../public/games/paint.js';
import * as skull from '../public/games/skull.js';
import * as gungi from '../public/games/gungi.js';
import * as towerbattle from '../public/games/towerbattle.js';
import * as hitblow from '../public/games/hitblow.js';
import * as dotsboxes from '../public/games/dotsboxes.js';
import * as asasore from '../public/games/asasore.js';
import * as geister from '../public/games/geister.js';
import * as mancala from '../public/games/mancala.js';
import * as connect4 from '../public/games/connect4.js';
import * as hagetaka from '../public/games/hagetaka.js';
import * as itchi from '../public/games/itchi.js';
import { simulate as towerPhysics } from '../lib/towerbattle-physics.js';

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


test('catchoco: アイテムは222種類で重複なし', () => {
  const s = cc.init({}, 2);
  const all = [...s.itemDeck, ...s.hands.flat()].map((c) => c.name);
  assert.equal(all.length, 222);
  assert.equal(new Set(all).size, 222);
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
// 接続中の全員が自分のカードに書いて「書き終わった」を押す（言葉が公開される）
const itoWriteAll = (s, ctx) => {
  for (let p = 0; p < s.players; p++) {
    if (s.out[p] || !ctx.online[p]) continue;
    for (const card of s.cards.filter((x) => x.owner === p)) s = ito.applyMove(s, { hint: { cardId: card.id, text: `言葉${card.value}` } }, p, null, ctx);
    s = ito.applyMove(s, { written: true }, p, null, ctx);
  }
  return s;
};
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
test('ito: 言葉は全員が書き終わるまで見えず、一斉に公開されたら書き直せない', () => {
  let s = ito.init({}, 2);
  const ctx = itoCtx(2);
  const mine = s.cards.find((x) => x.owner === 0), theirs = s.cards.find((x) => x.owner === 1);
  s = ito.applyMove(s, { hint: { cardId: mine.id, text: 'ライオン' } }, 0, null, ctx);
  assert.equal(ito.viewFor(s, 0).cards.find((x) => x.id === mine.id).hint, 'ライオン', '自分には見える');
  assert.equal(ito.viewFor(s, 1).cards.find((x) => x.id === mine.id).hint, '', 'ほかの人には見えない');
  assert.equal(ito.viewFor(s, -1).cards.find((x) => x.id === mine.id).hint, '', '観戦者にも見えない');
  assert.throws(() => ito.applyMove(s, { hint: { cardId: theirs.id, text: 'x' } }, 0, null, ctx), /自分のカード/);
  assert.throws(() => ito.applyMove(s, { written: true }, 1, null, ctx), /まだ書いていない/);
  assert.throws(() => ito.applyMove(s, { ready: true }, 0, null, ctx), /公開されてから/);
  s = ito.applyMove(s, { written: true }, 0, null, ctx);
  assert.throws(() => ito.applyMove(s, { hint: { cardId: mine.id, text: 'ネコ' } }, 0, null, ctx), /書き直す/);
  s = ito.applyMove(s, { written: false }, 0, null, ctx); // 書き直す
  s = ito.applyMove(s, { hint: { cardId: mine.id, text: 'ネコ' } }, 0, null, ctx);
  s = ito.applyMove(s, { written: true }, 0, null, ctx);
  assert.equal(s.hintsOpen, false, 'まだ1人書いていない');
  s = ito.applyMove(s, { hint: { cardId: theirs.id, text: 'ゾウ' } }, 1, null, ctx);
  s = ito.applyMove(s, { written: true }, 1, null, ctx);
  assert.equal(s.hintsOpen, true, '全員そろったら公開');
  assert.equal(ito.viewFor(s, 1).cards.find((x) => x.id === mine.id).hint, 'ネコ');
  assert.throws(() => ito.applyMove(s, { hint: { cardId: mine.id, text: 'トラ' } }, 0, null, ctx), /書き直せません/);
  // 並べ替えると OK は取り消し
  s = ito.applyMove(s, { ready: true }, 1, null, ctx);
  const first = s.cards[0].id;
  s = ito.applyMove(s, { move: { cardId: first, to: 1 } }, 0, null, ctx);
  assert.equal(s.cards[1].id, first);
  assert.equal(s.ready[1], false);
  // お題が変わったら書き直し
  s = ito.applyMove(s, { reroll: true }, 0, null, ctx);
  assert.equal(s.hintsOpen, false);
  assert.ok(s.cards.every((x) => x.hint === ''));
});
test('ito: 切断中の人は書き終わり待ちに含めない・ホストは待たずに公開できる', () => {
  let s = ito.init({}, 3);
  const ctx = { hostSeat: 0, online: [true, true, false] };
  s = itoWriteAll(s, ctx);
  assert.equal(s.hintsOpen, true);
  let t = ito.init({}, 2);
  assert.throws(() => ito.applyMove(t, { openHints: true }, 1, null, itoCtx(2)), /ホストだけ/);
  t = ito.applyMove(t, { openHints: true }, 0, null, itoCtx(2));
  assert.equal(t.hintsOpen, true);
});
test('ito: 全員OKで答え合わせ→1枚ずつめくって成功判定', () => {
  let s = ito.init({}, 3);
  // 小さい順に並べてから全員OK
  const sorted = s.cards.slice().sort((a, b) => a.value - b.value);
  sorted.forEach((c, i) => { s = ito.applyMove(s, { move: { cardId: c.id, to: i } }, 0, null, itoCtx(3)); });
  s = itoWriteAll(s, itoCtx(3));
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
  s = itoWriteAll(s, ctx);
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
  // 中級・上級はおすすめ配置で始まる（後手は180度回した形）
  const adv = gungi.init({ mode: 'advanced' });
  assert.equal(adv.phase, 'play');
  assert.equal(adv.board[8][4][0].t, '帥');
  assert.equal(adv.board[0][4][0].t, '帥');
  assert.equal(adv.board[0][4][0].o, 1);
  assert.equal(count(adv, 0), 25);
  assert.equal(adv.board.flat().flat().filter((x) => x.o === 0).length, 19);
  assert.equal(adv.hands[0]['兵'], 1, '型に入らない駒は持ち駒');
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
        const move = cpu ? gungi.aiMove(s, s.turn, rng) : (() => { const ms = gungi.legalMoves(s); return ms[Math.floor(rnd() * ms.length)]; })();
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
test('paint: 消しゴムはどちらの描き方でも使える・普通のお題の追加', () => {
  let s = paint.init({ turns: 1, seconds: 60 }, 2);
  s = paint.applyMove(s, { pick: 0 }, 0);
  s = paint.applyMove(s, { shape: { type: 'line', x1: 10, y1: 10, x2: 300, y2: 200 } }, 0);
  s = paint.applyMove(s, { shape: { type: 'erase', pts: [[10, 10], [100, 70]] } }, 0);
  assert.equal(s.shapes[1].type, 'erase');
  assert.throws(() => paint.applyMove(s, { shape: { type: 'path', pts: [[1, 1], [5, 5]] } }, 0), /直線と円/);
  s = paint.applyMove(s, { undo: true }, 0);
  assert.equal(s.shapes.length, 1, '消しゴムも1つ戻せる');
  const idx = (w) => paint.THEME_LIST.findIndex((t) => t[0] === w);
  assert.equal(paint.THEME_TAGS[idx('カマキリ')], '');
  assert.equal(paint.THEME_TAGS[idx('リコーダー')], '');
});
const tbCtx = { physics: towerPhysics };
test('towerbattle: 真ん中に積めば残り、島の外に落とした人は脱落', () => {
  let s = towerbattle.init({ seconds: 30 }, 3);
  assert.equal(s.turn, 0);
  assert.equal(s.phase, 'aim');
  assert.throws(() => towerbattle.applyMove(s, { aim: { x: 10, angle: 0 } }, 1, undefined, tbCtx), /番ではありません/);
  s = towerbattle.applyMove(s, { aim: { x: 7, angle: 20 } }, 0, undefined, tbCtx);
  assert.deepEqual(s.aim, { x: 7, angle: 20 }, '角度は好きな値（1度単位）');
  assert.equal(towerbattle.applyMove(s, { aim: { x: 0, angle: -30.4 } }, 0, undefined, tbCtx).aim.angle, 330);
  assert.equal(towerbattle.ANIMAL_KEYS.length, 20, '動物は20種類');
  s = { ...s, current: 'elephant' };
  s = towerbattle.applyMove(s, { drop: { x: 0, angle: 0 } }, 0, undefined, tbCtx);
  assert.equal(s.phase, 'falling');
  assert.equal(s.pieces.length, 1);
  assert.ok(s.drop.frames.length > 5, '落ちる様子のコマがある');
  assert.ok(s.top < -40, '塔の高さが上がる');
  assert.equal(s.out[0], false);
  assert.throws(() => towerbattle.applyMove(s, { drop: { x: 0, angle: 0 } }, 0, undefined, tbCtx), /置けません/, 'ゆれている間は置けない');
  s = towerbattle.tick(s, undefined, tbCtx);
  assert.equal(s.turn, 1);
  assert.equal(s.drop, null);
  // P2 は島の外（右端）に落とす → 落ちて脱落
  s = towerbattle.applyMove(s, { drop: { x: 300, angle: 0 } }, 1, undefined, tbCtx);
  assert.equal(s.out[1], false, '揺れている間はまだ知らせない');
  assert.equal(s.fellBy, null);
  assert.ok(!s.history.at(-1).includes('脱落'));
  assert.equal(s.pieces.length, 1, '落ちた動物は消える');
  s = towerbattle.tick(s, undefined, tbCtx); // 揺れ終わった
  assert.equal(s.phase, 'fell');
  assert.equal(s.out[1], true);
  assert.equal(s.fellBy, 1);
  assert.ok(s.history.at(-1).includes('脱落'));
  s = towerbattle.tick(s, undefined, tbCtx);
  assert.equal(s.turn, 2, '脱落した人は飛ばす');
  // 時間切れは今のねらいで落とす
  s = towerbattle.applyMove(s, { aim: { x: -300, angle: 0 } }, 2, undefined, tbCtx);
  s = towerbattle.tick(s, undefined, tbCtx);
  s = towerbattle.tick(s, undefined, tbCtx);
  assert.equal(s.out[2], true);
  s = towerbattle.tick(s, undefined, tbCtx);
  assert.equal(s.result.winner, 0, '最後に残った人の勝ち');
});
test('towerbattle: 番の人が抜けたら次の人へ', () => {
  let s = towerbattle.init({}, 3);
  assert.equal(s.options.seconds, 30);
  s = towerbattle.applyMove(s, { resign: true }, 0);
  assert.equal(s.turn, 1);
  s = towerbattle.applyMove(s, { resign: true }, 2);
  assert.equal(s.result.winner, 1);
});
const dfRules = (o) => ({ options: df.normalizeOptions(o) });
test('daifugo: ルール設定（ふつうの初期値・ジョーカーの枚数・名前）', () => {
  const o = df.normalizeOptions({});
  assert.deepEqual([o.eightCut, o.revolution, o.spade3, o.sequence, o.exchange, o.shibari, o.elevenBack, o.fiveSkip, o.miyakoOchi, o.foulFinish, o.jokers],
    [true, true, true, true, true, false, false, false, false, false, 1]);
  assert.equal(df.init({ jokers: 2 }, 4).hands.flat().length, 54);
  assert.equal(df.init({ jokers: 0 }, 4).hands.flat().length, 52);
  assert.equal(df.init({ jokers: 5 }, 4).options.jokers, 1, '0〜2枚以外はふつう');
  assert.match(df.variantName({ shibari: true, eightCut: false }), /しばり/);
  assert.doesNotMatch(df.variantName({ eightCut: false }), /8切り/);
  // ジョーカー2枚はペアで出せる
  assert.ok(df.combos(dc('JK JK')).some((c) => c.type === 'set' && c.n === 2));
});
test('daifugo: ルールを切ると効かない（8切り・革命・スペ3・階段）', () => {
  let s = dfState(['s8 sK', 'h4 h9', 'c3 c6'], dfRules({ eightCut: false }));
  s = df.applyMove(s, { play: ids(s, 0, 's8') }, 0);
  assert.ok(s.field, '8切りなし');
  assert.equal(s.turn, 1);
  let r = dfState(['s5 h5 d5 c5 s3', 'h4 h9', 'c3 c6'], dfRules({ revolution: false }));
  r = df.applyMove(r, { play: ids(r, 0, 's5 h5 d5 c5') }, 0);
  assert.equal(r.revolution, false, '革命なし');
  let j = dfState(['JK s9', 's3 h9', 'c4 c6'], dfRules({ spade3: false }));
  j = df.applyMove(j, { play: ids(j, 0, 'JK') }, 0);
  assert.throws(() => df.applyMove(j, { play: ids(j, 1, 's3') }, 1), /強い/);
  const q = dfState(['s5 s6 s7 h9', 'h4 h9', 'c3 c6'], dfRules({ sequence: false }));
  assert.throws(() => df.applyMove(q, { play: ids(q, 0, 's5 s6 s7') }, 0), /同じ数字だけ/);
});
test('daifugo: しばり・11バック・5飛ばし', () => {
  let s = dfState(['s4 s9 h6 s2', 's5 hK sJ', 'sQ c7 cK'], dfRules({ shibari: true }));
  s = df.applyMove(s, { play: ids(s, 0, 's4') }, 0);
  s = df.applyMove(s, { play: ids(s, 1, 's5') }, 1);
  assert.deepEqual(s.lock, ['s'], '♠が続いたのでしばり');
  assert.throws(() => df.applyMove(s, { play: ids(s, 2, 'c7') }, 2), /しばり/);
  s = df.applyMove(s, { play: ids(s, 2, 'sQ') }, 2);
  s = df.applyMove(s, { pass: true }, 0);
  s = df.applyMove(s, { pass: true }, 1);
  assert.equal(s.lock, null, '流れたらしばりは解ける');

  let b = dfState(['sJ s9 s3', 'h4 hK', 'c5 c6'], dfRules({ elevenBack: true }));
  b = df.applyMove(b, { play: ids(b, 0, 'sJ') }, 0);
  assert.equal(b.jback, true);
  assert.throws(() => df.applyMove(b, { play: ids(b, 1, 'hK') }, 1), /弱い/);
  b = df.applyMove(b, { play: ids(b, 1, 'h4') }, 1);
  b = df.applyMove(b, { pass: true }, 2);
  b = df.applyMove(b, { pass: true }, 0);
  assert.equal(b.jback, false, '流れたら元どおり');

  let f = dfState(['s5 h5 s9', 'h7 h8', 'c9 cK', 'd9 dK'], dfRules({ fiveSkip: true }));
  f = df.applyMove(f, { play: ids(f, 0, 's5 h5') }, 0);
  assert.equal(f.turn, 3, '5を2枚で2人飛ばし');
});
test('daifugo: 都落ち・反則上がり・カード交換なし', () => {
  // 都落ち: 前の大富豪（P1）より先に P2 が上がる
  let s = dfState(['s4 s6', 'h9', 'c5 c7'], { ...dfRules({ miyakoOchi: true }), lastRanks: [0, 1, 2] });
  s = df.applyMove(s, { play: ids(s, 0, 's4') }, 0);
  s = df.applyMove(s, { play: ids(s, 1, 'h9') }, 1);
  assert.deepEqual(s.penalty, [0], '前の大富豪はその場で大貧民');
  assert.equal(s.phase, 'result', '残りが1人なのでラウンド終了');
  assert.deepEqual(s.lastRanks, [1, 2, 0]);

  // 反則上がり: 2で上がると大貧民
  let r = dfState(['s2', 'h9 h3', 'c5 c7'], dfRules({ foulFinish: true }));
  r = df.applyMove(r, { play: ids(r, 0, 's2') }, 0);
  assert.deepEqual(r.penalty, [0]);
  assert.deepEqual(r.finished, []);
  r = df.applyMove(r, { pass: true }, 1);
  r = df.applyMove(r, { pass: true }, 2);
  assert.equal(r.turn, 1, '上がった人の次から');
  r = df.applyMove(r, { play: ids(r, 1, 'h3') }, 1);
  r = df.applyMove(r, { play: ids(r, 2, 'c5') }, 2);
  r = df.applyMove(r, { play: ids(r, 1, 'h9') }, 1);
  assert.deepEqual(r.lastRanks, [1, 2, 0]);

  // カード交換なし: 次のラウンドはすぐ大貧民から
  let x = df.applyMove(r, { next: true }, 0, null, { hostSeat: 0 });
  assert.equal(x.phase, 'exchange', 'ふつうは交換あり');
  let y = df.applyMove({ ...r, options: df.normalizeOptions({ exchange: false }) }, { next: true }, 0, null, { hostSeat: 0 });
  assert.equal(y.phase, 'play');
  assert.equal(y.turn, 0, '大貧民から');
});
test('daifugo: 7渡し・10捨て・12ボンバー', () => {
  // 7渡し: 7を2枚出したら、好きなカードを2枚次の人へ
  let s = dfState(['s7 h7 s3 s4 sK', 'h9 hA', 'c9 cK'], dfRules({ sevenPass: true }));
  s = df.applyMove(s, { play: ids(s, 0, 's7 h7') }, 0);
  assert.equal(s.turn, 0, '選び終わるまで同じ人');
  assert.equal(s.pending.effects[0].type, 'seven');
  assert.throws(() => df.applyMove(s, { play: ids(s, 0, 's3') }, 0), /選んでください|出せません|7渡し/);
  assert.throws(() => df.applyMove(s, { give7: ids(s, 0, 's3') }, 0), /2枚/);
  s = df.applyMove(s, { give7: ids(s, 0, 's3 s4') }, 0);
  assert.equal(s.pending, null);
  assert.equal(s.hands[1].length, 4, '次の人が2枚もらう');
  assert.equal(s.turn, 1);
  assert.ok(!s.history.at(-1).includes('♠3'), '渡したカードは履歴に出さない');

  // 10捨て: 最後の1枚を捨てたら上がり
  let t = dfState(['s10 s4', 'h9 hA', 'c9 cK'], dfRules({ tenDiscard: true }));
  t = df.applyMove(t, { play: ids(t, 0, 's10') }, 0);
  t = df.applyMove(t, { discard10: ids(t, 0, 's4') }, 0);
  assert.deepEqual(t.finished, [0], '捨てて手札がなくなったら上がり');
  assert.equal(t.turn, 1);

  // 12ボンバー: 選んだ数字を全員捨てる
  let b = dfState(['sQ s9 sA', 'h9 hA d9', 'c9 cK'], dfRules({ queenBomber: true }));
  b = df.applyMove(b, { play: ids(b, 0, 'sQ') }, 0);
  assert.throws(() => df.applyMove(b, { bomb: [9, 14] }, 0), /1つ/);
  b = df.applyMove(b, { bomb: [9] }, 0);
  assert.deepEqual(b.hands.map((h) => h.length), [1, 1, 1], '9を全員捨てた');
  assert.equal(b.turn, 1);

  // ルールが OFF なら何も起きない
  let n = dfState(['s7 s3', 'h9 hA', 'c9 cK']);
  n = df.applyMove(n, { play: ids(n, 0, 's7') }, 0);
  assert.equal(n.pending, null);
  assert.equal(n.turn, 1);

  // 選んでいる途中で投了したら、その効果はなし
  let q = dfState(['s7 s3 s4', 'h9 hA', 'c9 cK'], dfRules({ sevenPass: true }));
  q = df.applyMove(q, { play: ids(q, 0, 's7') }, 0);
  q = df.applyMove(q, { resign: true }, 0);
  assert.equal(q.pending, null);
  assert.equal(q.turn, 1);
});
test('hitblow: 秘密の数・ヒットとブロー・後攻にも最後のチャンス', () => {
  assert.deepEqual(hitblow.judge('123', '135'), { hit: 1, blow: 1 });
  assert.deepEqual(hitblow.judge('4567', '7654'), { hit: 0, blow: 4 });
  let s = hitblow.init({ digits: 3 });
  assert.equal(s.phase, 'setup');
  assert.throws(() => hitblow.applyMove(s, { secret: '112' }, 0), /同じ数字/);
  assert.throws(() => hitblow.applyMove(s, { secret: '12' }, 0), /3けた/);
  s = hitblow.applyMove(s, { secret: '123' }, 1); // 後攻が先に決めてもよい
  assert.equal(hitblow.viewFor(s, 0).secrets[1], 'set', '相手の数は見えない');
  s = hitblow.applyMove(s, { secret: '456' }, 0);
  assert.equal(s.phase, 'play');
  assert.throws(() => hitblow.applyMove(s, { guess: '456' }, 1), /相手の番/);
  s = hitblow.applyMove(s, { guess: '123' }, 0); // 先攻が当てた
  assert.equal(s.result, null, '後攻にも同じ回数のチャンス');
  assert.equal(s.turn, 1);
  s = hitblow.applyMove(s, { guess: '789' }, 1);
  assert.equal(s.result.winner, 0);
  assert.equal(hitblow.viewFor(s, 1).secrets[0], '456', '終わったら見える');
  // 両方当てたら引き分け
  let d = hitblow.applyMove(hitblow.applyMove(hitblow.init({}), { secret: '123' }, 0), { secret: '456' }, 1);
  d = hitblow.applyMove(d, { guess: '456' }, 0);
  d = hitblow.applyMove(d, { guess: '123' }, 1);
  assert.equal(d.result.winner, null);
});
test('hitblow: CPU は数を決めて、答えと食い違わない予想をする', () => {
  let s = hitblow.init({ digits: 3, cpu: true });
  s = hitblow.applyMove(s, hitblow.aiMove(s, 1), 1);
  assert.ok(s.secrets[1]);
  assert.equal(hitblow.aiMove(s, 1), null, 'もう決めたら何もしない');
  s = hitblow.applyMove(s, { secret: '987' }, 0);
  let turns = 0;
  while (!s.result && turns < 40) {
    const mv = s.turn === 1 ? hitblow.aiMove(s, 1) : { guess: '012' };
    s = hitblow.applyMove(s, mv, s.turn);
    turns++;
  }
  assert.equal(s.result.winner, 1, 'CPU はいずれ当てる');
  assert.ok(s.guesses[1].length <= 15); // 3けたなら、ふつうは7回くらいまでに当たる
});
test('dotsboxes: 四角を閉じたら取ってもう1本・全部埋まったら多い人の勝ち', () => {
  let s = dotsboxes.init({ size: 3 }, 2);
  assert.equal(s.h.length, 4);
  assert.equal(s.v[0].length, 4);
  s = dotsboxes.applyMove(s, { line: ['h', 0, 0] }, 0);
  assert.equal(s.turn, 1);
  assert.throws(() => dotsboxes.applyMove(s, { line: ['h', 0, 0] }, 1), /もう引かれて/);
  s = dotsboxes.applyMove(s, { line: ['v', 0, 0] }, 1);
  s = dotsboxes.applyMove(s, { line: ['v', 0, 1] }, 0);
  s = dotsboxes.applyMove(s, { line: ['h', 1, 0] }, 1); // 4辺目
  assert.equal(s.boxes[0][0], 1);
  assert.equal(s.scores[1], 1);
  assert.equal(s.turn, 1, '取ったらもう1本');
  // 残りを全部引くと終わる
  let guard = 0;
  while (!s.result && guard++ < 100) {
    const free = [];
    s.h.forEach((row, r) => row.forEach((x, c) => { if (x == null) free.push(['h', r, c]); }));
    s.v.forEach((row, r) => row.forEach((x, c) => { if (x == null) free.push(['v', r, c]); }));
    s = dotsboxes.applyMove(s, { line: free[0] }, s.turn);
  }
  assert.ok(s.result);
  assert.equal(s.scores[0] + s.scores[1], 9);
  // 抜けた人は飛ばす
  let m = dotsboxes.init({ size: 3 }, 3);
  m = dotsboxes.applyMove(m, { resign: true }, 1);
  m = dotsboxes.applyMove(m, { line: ['h', 0, 0] }, 0);
  assert.equal(m.turn, 2);
});
test('asasore: 頭文字＋テーマのお題・一斉公開・投票で今日の正解', () => {
  let s = asasore.init({ rounds: 3, seconds: 60 }, 3);
  assert.ok(asasore.KANA.includes(s.kana));
  assert.match(asasore.viewFor(s, 0).themeText, /^「.」で始まる、.+？$/);
  assert.equal(asasore.init({ kana: false }, 3).kana, '', '頭文字なしにもできる');
  s = asasore.applyMove(s, { answer: 'からあげ' }, 0);
  assert.equal(asasore.viewFor(s, 1).answers[0], '✓', '書いている間はほかの人の答えは見えない');
  s = asasore.applyMove(s, { answer: 'カラアゲ' }, 1);
  s = asasore.applyMove(s, { answer: 'かまぼこ' }, 2);
  assert.equal(s.phase, 'judge');
  assert.equal(s.groups.length, 2, '同じ答えはまとめる');
  assert.deepEqual(s.groups[0].by, [0, 1]);
  assert.throws(() => asasore.applyMove(s, { vote: 1 }, 2), /自分だけ/, '自分だけの答えには投票できない');
  assert.equal(asasore.applyMove(s, { vote: 0 }, 0).votes[0], 0, '被った答えなら自分の答えにも投票できる');
  s = asasore.applyMove(s, { vote: 1 }, 0);
  s = asasore.applyMove(s, { vote: 1 }, 1);
  s = asasore.applyMove(s, { vote: 0 }, 2);
  assert.equal(asasore.viewFor(s, 2).votes[0], -1, '投票先は結果まで見えない');
  for (const p of [0, 1, 2]) s = asasore.applyMove(s, { voteDone: true }, p);
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.winners, [1]);
  assert.deepEqual(s.scores, [0, 0, 1], '「かまぼこ」が今日の正解');
  s = asasore.tick(s);
  assert.equal(s.round, 2, '次のお題へ');
  assert.equal(s.phase, 'write');
  // 同数なら両方正解・時間切れでも進む
  let t = asasore.init({ rounds: 3 }, 4);
  t = asasore.applyMove(t, { answer: 'a' }, 0);
  t = asasore.applyMove(t, { answer: 'b' }, 1);
  t = asasore.tick(t); // 考える時間の終わり（2人は書かなかった）
  assert.equal(t.groups.length, 2);
  t = asasore.applyMove(t, { vote: 1 }, 0);
  t = asasore.applyMove(t, { vote: 0 }, 1);
  t = asasore.tick(t); // 投票の時間切れ
  assert.deepEqual(t.winners, [0, 1]);
  assert.deepEqual(t.scores, [1, 1, 0, 0]);
  t = asasore.tick(t);
  assert.equal(t.round, 2);
  assert.ok(asasore.THEMES.length >= 150);
});
test('geister: 並べる・相手の色は見えない・取る・脱出・赤を4つ取らせたら勝ち', () => {
  let s = geister.init({});
  assert.throws(() => geister.applyMove(s, { layout: [true, true, true, true, true, false, false, false] }, 0), /青4つ/);
  s = geister.applyMove(s, { layout: [true, false, true, false, true, false, true, false] }, 1);
  s = geister.applyMove(s, { layout: [true, true, true, true, false, false, false, false] }, 0);
  assert.equal(s.phase, 'play');
  assert.equal(s.board[4][1].good, true);
  assert.equal(geister.viewFor(s, 0).board[1][4].good, null, '相手の色は見えない');
  assert.equal(geister.viewFor(s, 0).board[4][1].good, true);
  assert.throws(() => geister.applyMove(s, { from: [4, 1], to: [4, 2] }, 0), /動かせません/, '自分のおばけには入れない');
  // 取る
  let t = { ...s, board: s.board.map((r) => r.slice()) };
  t.board[3][1] = { o: 1, good: false };
  t = geister.applyMove(t, { from: [4, 1], to: [3, 1] }, 0);
  assert.deepEqual(t.captured[0], ['bad']);
  // 脱出: 青が出口にいれば逃がせる
  let e = { ...s, board: s.board.map((r) => r.map(() => null)) };
  e.board[0][0] = { o: 0, good: true };
  e.board[5][5] = { o: 1, good: false };
  assert.ok(geister.legalMoves(e).some((m) => m.escape));
  e = geister.applyMove(e, { from: [0, 0], escape: true }, 0);
  assert.equal(e.result.winner, 0);
  // 赤を4つ取ったら、取った方の負け
  let b = { ...s, board: s.board.map((r) => r.map(() => null)), captured: [['bad', 'bad', 'bad'], []] };
  b.board[2][2] = { o: 0, good: true };
  b.board[1][2] = { o: 1, good: false };
  b.board[5][5] = { o: 1, good: true };
  b = geister.applyMove(b, { from: [2, 2], to: [1, 2] }, 0);
  assert.equal(b.result.winner, 1);
});
test('mancala: 1人5つの穴・まく・ゴールでもう1回・横取り・終わりに集める', () => {
  let s = mancala.init({ seeds: 4 });
  assert.equal(mancala.PITS, 5);
  assert.equal(s.pits.length, 12);
  assert.equal(s.pits.reduce((a, b) => a + b), 40);
  assert.equal(mancala.storeOf(0), 5);
  assert.equal(mancala.storeOf(1), 11);
  s = mancala.applyMove(s, { pit: 1 }, 0); // 2番目から4個 → 2,3,4,ゴール
  assert.equal(s.pits[5], 1);
  assert.equal(s.turn, 0, 'ゴールに入ったらもう1回');
  assert.throws(() => mancala.applyMove(s, { pit: 5 }, 0), /石のある/, '6つ目の穴はない');
  s = mancala.applyMove(s, { pit: 0 }, 0); // 4個 → 1,2,3,4
  assert.equal(s.turn, 1);
  // 横取り: 空の穴に最後の石が入って、向かいに石がある（穴1の向かいは穴9）
  let d = { ...mancala.init({}), pits: [1, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0] };
  d = mancala.applyMove(d, { pit: 0 }, 0); // 0 → 1（空）。向かいは 9（5個）
  assert.equal(d.pits[5], 6, '5個+自分の1個を横取り');
  assert.ok(d.result, '先手の側が空になったので終わり');
  assert.equal(d.result.winner, 0);
  // 後手は相手のゴールを飛ばす
  let e = { ...mancala.init({}), turn: 1, pits: [1, 1, 1, 1, 1, 0, 3, 0, 0, 0, 7, 0] };
  e = mancala.applyMove(e, { pit: 4 }, 1); // 10 から7個: 11(ゴール),0,1,2,3,4,(5は飛ばす),6
  assert.equal(e.pits[5], 0, '相手のゴールには入れない');
  assert.equal(e.pits[11], 1);
  assert.equal(e.pits[6], 4);
  assert.throws(() => mancala.applyMove(mancala.init({}), { pit: 0 }, 1), /相手の番/);
});
test('connect4: 下に落ちる・4つ並んだら勝ち・いっぱいの列には入れない', () => {
  let s = connect4.init({});
  s = connect4.applyMove(s, { col: 3 }, 0);
  assert.equal(s.board[5][3], 0, 'いちばん下に入る');
  for (const [c, p] of [[4, 1], [3, 0], [4, 1], [3, 0], [4, 1]]) s = connect4.applyMove(s, { col: c }, p);
  assert.equal(s.result, null);
  s = connect4.applyMove(s, { col: 3 }, 0);
  assert.equal(s.result.winner, 0);
  assert.equal(s.winLine.length, 4);
  let f = connect4.init({});
  for (let i = 0; i < 6; i++) f = connect4.applyMove(f, { col: 0 }, f.turn);
  assert.throws(() => connect4.applyMove(f, { col: 0 }, f.turn), /いっぱい/);
  // CPU は、すぐ勝てる手を見のがさない・負けを防ぐ
  let w = connect4.init({});
  for (const [c, p] of [[0, 0], [6, 1], [1, 0], [6, 1], [2, 0]]) w = connect4.applyMove(w, { col: c }, p);
  assert.deepEqual(connect4.aiMove(w, 1), { col: 3 }, '相手の4つ目を防ぐ');
});
test('hagetaka: 同じ数は打ち消し・プラスは大きい数・マイナスは小さい数・持ち越し', () => {
  assert.equal(hagetaka.resolve(5, [15, 15, 3], [0, 1, 2]), 2, '15どうしは打ち消し、次に大きい3が取る');
  assert.equal(hagetaka.resolve(-3, [1, 2, 9], [0, 1, 2]), 0, 'マイナスは一番小さい数');
  assert.equal(hagetaka.resolve(4, [7, 7], [0, 1]), null);
  let s = hagetaka.init({}, 2);
  assert.equal(s.hands[0].length, 15);
  s = { ...s, current: 6 };
  s = hagetaka.applyMove(s, { play: 10 }, 0);
  assert.equal(hagetaka.viewFor(s, 1).played[0], 0, '出したカードは見えない（出したことだけ）');
  s = hagetaka.applyMove(s, { play: 12 }, 0); // 出し直し
  s = hagetaka.applyMove(s, { play: 12 }, 1);
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.pot, [6], '打ち消し合って持ち越し');
  assert.ok(!s.hands[0].includes(12), '出したカードはなくなる');
  s = hagetaka.tick(s);
  s = { ...s, current: 3 };
  s = hagetaka.applyMove(s, { play: 1 }, 0);
  s = hagetaka.applyMove(s, { play: 2 }, 1);
  assert.equal(s.scores[1], 9, '持ち越しの6と今回の3');
  assert.throws(() => hagetaka.applyMove(hagetaka.tick(s), { play: 12 }, 0), /持っていません/);
  // 15回で終わる
  let g = hagetaka.init({}, 3);
  while (!g.result) {
    for (const p of [0, 1, 2]) if (g.phase === 'choose') g = hagetaka.applyMove(g, { play: g.hands[p][0] }, p);
    g = hagetaka.tick(g);
  }
  assert.equal(g.round, 15);
  assert.ok(hagetaka.viewFor(g, 0).history.length > 0, '終わったらログが見える');
  assert.deepEqual(hagetaka.viewFor(hagetaka.tick(hagetaka.applyMove(hagetaka.applyMove(hagetaka.init({}, 2), { play: 3 }, 0), { play: 5 }, 1)), 0).history, [], '途中はログを見せない');
});
test('asasore: 3人が被って1人だけ別の答えでも、被った答えが勝てる', () => {
  let s = asasore.init({ rounds: 3 }, 4);
  for (const p of [0, 1, 2]) s = asasore.applyMove(s, { answer: 'からあげ' }, p);
  s = asasore.applyMove(s, { answer: 'かまぼこ' }, 3);
  assert.equal(s.groups.length, 2);
  for (const p of [0, 1, 2]) s = asasore.applyMove(s, { vote: 0 }, p); // 自分たちの答えに投票
  s = asasore.applyMove(s, { vote: 0 }, 3);
  for (const p of [0, 1, 2, 3]) s = asasore.applyMove(s, { voteDone: true }, p);
  assert.deepEqual(s.winners, [0]);
  assert.deepEqual(s.scores, [1, 1, 1, 0]);
});
test('itchi: 全員そろえばクリア・そろわなければもう一度・一致でいいね・目標でおわり', () => {
  let s = itchi.init({ goal: 3, seconds: 60 }, 3);
  const theme = s.theme;
  s = itchi.applyMove(s, { answer: 'りんご' }, 0);
  assert.equal(itchi.viewFor(s, 1).answers[0], '✓', '書いている間はほかの人の答えは見えない');
  s = itchi.applyMove(s, { answer: 'リンゴ' }, 1);
  s = itchi.applyMove(s, { answer: 'いちご' }, 2);
  assert.equal(s.phase, 'reveal', 'そろわなかった');
  s = itchi.applyMove(s, { agree: true }, 0);
  s = itchi.applyMove(s, { retry: true }, 1);
  s = itchi.applyMove(s, { agree: true }, 2);
  assert.equal(s.phase, 'write', 'だれか「もう一度」なら同じお題でもう一度');
  assert.equal(s.theme, theme);
  assert.equal(s.tries, 2);
  for (const p of [0, 1, 2]) s = itchi.applyMove(s, { answer: p === 1 ? 'リンゴ ' : 'りんご' }, p);
  assert.equal(s.phase, 'clear', 'かな・カナ・空白のちがいは同じ');
  assert.equal(s.cleared, 1);
  s = itchi.tick(s);
  assert.notEqual(s.theme, theme, '次のお題へ');
  // 林檎とりんご → 全員「一致でいいね」で一致
  s = itchi.applyMove(s, { answer: '林檎' }, 0);
  s = itchi.applyMove(s, { answer: 'りんご' }, 1);
  s = itchi.applyMove(s, { answer: 'りんご' }, 2);
  for (const p of [0, 1, 2]) s = itchi.applyMove(s, { agree: true }, p);
  assert.equal(s.phase, 'clear');
  s = itchi.tick(s);
  // ホストはお題を変えられる
  assert.throws(() => itchi.applyMove(s, { skip: true }, 1, undefined, { hostSeat: 0 }), /ホスト/);
  const t2 = s.theme;
  s = itchi.applyMove(s, { skip: true }, 0, undefined, { hostSeat: 0 });
  assert.notEqual(s.theme, t2);
  for (const p of [0, 1, 2]) s = itchi.applyMove(s, { answer: 'x' }, p);
  s = itchi.tick(s);
  assert.ok(s.result, '3問クリアで終わり');
  assert.deepEqual(s.result.winners, [0, 1, 2]);
  assert.match(itchi.resultText(s), /クリア/);
  // 時間切れで書かなかった人がいたらそろわない
  let t = itchi.init({}, 2);
  t = itchi.applyMove(t, { answer: 'a' }, 0);
  t = itchi.tick(t);
  assert.equal(t.phase, 'reveal');
});
test('geister: 観戦者には全部の色を送り、遊んでいる人には相手の色を隠す', () => {
  let s = geister.init({});
  s = geister.applyMove(s, { layout: [true, true, true, true, false, false, false, false] }, 0);
  s = geister.applyMove(s, { layout: [false, false, false, false, true, true, true, true] }, 1);
  const all = (v) => v.board.flat().filter(Boolean);
  assert.ok(all(geister.viewFor(s, -1)).every((x) => x.good != null), '観戦者');
  assert.ok(all(geister.viewFor(s, 0)).filter((x) => x.o === 1).every((x) => x.good == null), '相手の色は隠す');
});
test('手札の公開: 終わったあと・観戦者・上がった人・抜けた人は全員分が見える', () => {
  // 大富豪: 遊んでいる人には見えない、上がった人・観戦者・投了した人には見える
  let s = dfState(['s9', 'h4 h5', 'c3 c6 c7']);
  assert.equal(df.viewFor(s, 1).hands[2], null);
  assert.ok(df.viewFor(s, -1).hands[2], '観戦者');
  s = df.applyMove(s, { play: ids(s, 0, 's9') }, 0); // P1 が上がった
  assert.ok(df.viewFor(s, 0).hands[2], '上がった人');
  assert.equal(df.viewFor(s, 1).hands[2], null, 'まだ遊んでいる人には見えない');
  // ハゲタカ・ワードバスケット・キャット＆チョコレート: 観戦者
  assert.ok(hagetaka.viewFor(hagetaka.init({}, 3), -1).hands[1]);
  assert.ok(wbk.viewFor(wbk.init({}, 3), -1).hands[1]);
  assert.ok(cc.viewFor(cc.init({}, 3), -1).hands[1]);
  // スカル: 観戦者には伏せたコースターの中身も見える
  const sk = skull.init({}, 3);
  assert.equal(skull.viewFor(sk, -1).seesAll, true);
  // ito: 観戦者には数字が見える
  const it = ito.init({}, 3);
  assert.ok(ito.viewFor(it, -1).cards.every((x) => x.value != null));
  assert.ok(ito.viewFor(it, 0).cards.some((x) => x.value == null));
});
test('ログ: 次のラウンド（試合）になったら最初から', () => {
  let s = dfState(['s9', 'h4 h5', 'c3 c6 c7']);
  s = df.applyMove(s, { play: ids(s, 0, 's9') }, 0);
  s = df.applyMove(s, { pass: true }, 1);
  s = df.applyMove(s, { pass: true }, 2);
  s = df.applyMove(s, { play: ids(s, 1, 'h4') }, 1);
  s = df.applyMove(s, { play: ids(s, 2, 'c6') }, 2);
  s = df.applyMove(s, { pass: true }, 1);
  s = df.applyMove(s, { play: ids(s, 2, 'c3') }, 2);
  s = df.applyMove(s, { play: ids(s, 1, 'h5') }, 1);
  assert.equal(s.phase, 'result');
  assert.ok(s.history.length > 5);
  s = df.applyMove(s, { next: true }, 0, null, { hostSeat: 0 });
  assert.equal(s.history[0], '第2ラウンド', '前のラウンドのログは消える');
});
console.log(`\n${n} tests passed`);
