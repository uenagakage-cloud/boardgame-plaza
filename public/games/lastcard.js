// ラストカード（サーバーとブラウザで共通）
// 2〜6人。112枚（各色 0×1・1〜9×2・スキップ×2・リバース×2・ドロー2×2・イベント×1、ワイルド×4、ワイルドドロー4×4）、手札7枚。
// 場と同じ色・同じ数字/記号のカードかワイルドを出す。ワイルドドロー4は場の色のカードがないときだけ出せる。
// 出せない（出さない）ときは1枚引き、引いたカードが出せればそのまま出すか、パスする。
// 残り1枚になるとき「ラストカード」と言わないと、次の人が動く前にほかの人に指摘されて2枚引く。先に手札がなくなった人の勝ち。
// 重ね: ドロー2・ワイルドドロー4を出されたら、次の人はドロー2（場がドロー2のとき）かワイルドドロー4を重ねられる。
//   引く枚数は足されていき、重ねられなかった人がまとめて引いて、番は飛ばされる。
// イベント（★）: 出すと、4つのうち1つの効果がランダムで起きる。
//   雷: 次の人に雷が付く。その人の番が来るたびに一定の確率で雷が落ち、4枚引く（落ちたら消える）。
//   早押し: すぐに全員で早押し。押した順に 0枚・1枚・2枚…と引く（押さなかった人は最後）。
//   手札まわし: 全員の手札を、順番の向きに次の人へまわす。
//   もう1回: 出した人の番がもう1回続く。
// 手: { play: カードid, color?, uno? } / { draw: true } / { pass: true } / { uno: true } 言い忘れの宣言
//     { catchUno: 席 } 言い忘れを指摘 / { press: true } 早押し / { resign: true }
// 早押しの CPU は tick の中で押す（ctx.bots）。
import { randInt } from './util.js';

export const id = 'lastcard';
export const title = 'ラストカード';
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const sideNames = ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4', 'プレイヤー5', 'プレイヤー6'];
export const minPlayers = 2;
export const maxPlayers = 6;
export const HAND_SIZE = 7;
export const COLORS = ['r', 'y', 'g', 'b'];
export const COLOR_NAMES = { r: '赤', y: '黄', g: '緑', b: '青' };
export const THUNDER_CHANCE = 35; // 番が来たときに雷が落ちる確率（%）
export const THUNDER_DRAW = 4;
export const RACE_MS = 6000;      // 早押しの時間
export const EVENTS = ['thunder', 'race', 'rotate', 'again'];
export const EVENT_NAMES = { thunder: '雷', race: '早押し', rotate: '手札まわし', again: 'もう1回' };

const VALUE_LABEL = { skip: 'スキップ', rev: 'リバース', '+2': 'ドロー2', wild: 'ワイルド', '+4': 'ワイルドドロー4', event: 'イベント' };
export const cardName = (c) => (c.c ? COLOR_NAMES[c.c] : '') + (VALUE_LABEL[c.v] || c.v);

function makeDeck() {
  const cards = [];
  for (const c of COLORS) {
    cards.push({ c, v: '0' }, { c, v: 'event' });
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', '+2']) cards.push({ c, v }, { c, v });
  }
  for (let i = 0; i < 4; i++) cards.push({ c: null, v: 'wild' }, { c: null, v: '+4' });
  return cards.map((card, i) => ({ id: i, ...card }));
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 山札がなくなったら場の一番上以外を混ぜ直す
function drawCards(s, seat, n, rng) {
  for (let i = 0; i < n; i++) {
    if (!s.deck.length) {
      const top = s.discard.pop();
      s.deck = shuffle(s.discard, rng);
      s.discard = [top];
    }
    if (!s.deck.length) return;
    s.hands[seat].push(s.deck.pop());
  }
}

export function init(options, players = 2, rng) {
  const s = {
    players, deck: shuffle(makeDeck(), rng), discard: [], hands: Array.from({ length: players }, () => []),
    out: Array(players).fill(false), turn: 0, direction: 1, color: null,
    drawn: null, unoPending: null, drawStack: 0, thunder: null, race: null, tickAt: null,
    lastAction: null, result: null, history: [],
  };
  for (let p = 0; p < players; p++) drawCards(s, p, HAND_SIZE, rng);
  // 最初の場札は数字カードにする
  let i = s.deck.length - 1;
  while (!/^\d$/.test(s.deck[i].v)) i--;
  const [first] = s.deck.splice(i, 1);
  s.discard.push(first);
  s.color = first.c;
  return s;
}

export const top = (s) => s.discard[s.discard.length - 1];
export const canActOutOfTurn = () => true;
const activeSeats = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);

function nextSeat(s, from, dir = s.direction) {
  let p = from;
  do p = (p + dir + s.players) % s.players; while (s.out[p]);
  return p;
}

export function isPlayable(s, seat, card) {
  // 重ね中: ドロー2（場がドロー2のとき）かワイルドドロー4だけ
  if (s.drawStack > 0) return card.v === '+4' || (card.v === '+2' && top(s).v === '+2');
  if (card.v === 'wild') return true;
  if (card.v === '+4') return !s.hands[seat].some((c) => c.c === s.color);
  return card.c === s.color || card.v === top(s).v;
}

// 今出せるカードの id（引いたあとは引いたカードだけ）
export function playableIds(s, seat) {
  if (s.result || s.race || s.turn !== seat || s.out[seat]) return [];
  const hand = s.hands[seat] || [];
  const cards = s.drawn != null ? hand.filter((c) => c.id === s.drawn) : hand;
  return cards.filter((c) => isPlayable(s, seat, c)).map((c) => c.id);
}

// 他の人の手札と山札は隠す
export function viewFor(s, seat) {
  return {
    ...s,
    // 観戦者・投了した人・終わったあとは、全員の手札が見える
    seesAll: seat < 0 || !!s.result || !!s.out[seat],
    hands: s.hands.map((h, i) => (i === seat || s.result || seat < 0 || s.out[seat] ? h : null)),
    handCounts: s.hands.map((h) => h.length),
    deck: null, deckCount: s.deck.length,
    discard: s.discard.slice(-1), discardCount: s.discard.length,
    race: s.race && { by: s.race.by, order: s.race.order, deadline: s.race.deadline },
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.race) return you >= 0 && !s.out[you] && !s.race.order.includes(you) ? '⚡ 早押し！ すぐに押そう（遅いほどたくさん引く）' : '早押し中…';
  if (you !== s.turn) return null;
  if (s.drawStack > 0) return `+${s.drawStack} がたまっています！ ドロー2・ワイルドドロー4を重ねるか、まとめて引くか`;
  return s.drawn != null ? '引いたカードを出すか、パスしてください' : 'あなたの番です：カードを出すか、山札から引いてください';
}

export const scoreOf = (s, seat) => `${s.handCounts ? s.handCounts[seat] : s.hands[seat].length}枚`;

const clone = (s) => ({
  ...s, deck: s.deck.slice(), discard: s.discard.slice(), hands: s.hands.map((h) => h.slice()),
  out: s.out.slice(), history: s.history.slice(), race: s.race && { ...s.race, order: s.race.order.slice(), botAt: { ...s.race.botAt } },
});

const label = (seat) => `P${seat + 1}`;

// 番を回す。雷が付いている人なら、一定の確率で雷が落ちる
function setTurn(ns, p, rng) {
  ns.turn = p;
  ns.drawn = null;
  if (ns.thunder === p && randInt(rng, 100) < THUNDER_CHANCE) {
    drawCards(ns, p, THUNDER_DRAW, rng);
    ns.thunder = null;
    ns.lastAction = { type: 'thunder', seat: p };
    ns.history.push(`⚡ ドカーン！ ${label(p)} に雷が落ちて${THUNDER_DRAW}枚`);
  }
}

// 早押しを始める（CPU が押す時刻も決める）
function startRace(ns, seat, next, ctx, rng) {
  const now = Date.now();
  const botAt = {};
  activeSeats(ns).forEach((p) => { if (ctx && ctx.bots && ctx.bots[p]) botAt[p] = now + 700 + randInt(rng, 1900); });
  ns.race = { by: seat, order: [], deadline: now + RACE_MS, botAt, next };
  ns.tickAt = Math.min(ns.race.deadline, ...Object.values(botAt));
}

// 早押しのおわり: 押した順に 0・1・2…枚。押さなかった人は最後
function finishRace(ns, rng) {
  const order = ns.race.order.filter((p) => !ns.out[p]);
  for (const p of activeSeats(ns)) if (!order.includes(p)) order.push(p);
  order.forEach((p, i) => { if (i) drawCards(ns, p, i, rng); });
  ns.history.push(`早押しの結果：${order.map((p, i) => `${label(p)} +${i}`).join('・')}`);
  ns.lastAction = { type: 'race', order };
  const next = ns.out[ns.race.next] ? nextSeat(ns, ns.race.next) : ns.race.next;
  ns.race = null;
  ns.tickAt = null;
  setTurn(ns, next, rng);
}

function racePress(ns, p, rng) {
  if (!ns.race || ns.out[p] || ns.race.order.includes(p)) return;
  ns.race.order.push(p);
  if (activeSeats(ns).every((q) => ns.race.order.includes(q))) finishRace(ns, rng);
}

export function tick(s, rng) {
  if (!s.race || s.result) return { ...s, tickAt: null };
  const ns = clone(s);
  const now = Date.now();
  // 時間が来た CPU から順に押す
  Object.entries(ns.race.botAt).map(([p, t]) => [Number(p), t]).sort((a, b) => a[1] - b[1])
    .forEach(([p, t]) => { if (ns.race && t <= now + 20) racePress(ns, p, rng); });
  if (ns.race && now >= ns.race.deadline - 20) finishRace(ns, rng);
  if (ns.race) {
    const left = Object.entries(ns.race.botAt).filter(([p]) => !ns.race.order.includes(Number(p))).map(([, t]) => t);
    ns.tickAt = Math.min(ns.race.deadline, ...left.filter((t) => t > now), ns.race.deadline);
  }
  return ns;
}

export function applyMove(s, mv, seat, rng, ctx) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (s.out[seat]) throw new Error('投了しています');
  const ns = clone(s);

  if (mv.press) {
    if (!s.race) throw new Error('いまは早押しではありません');
    racePress(ns, seat, rng);
    return ns;
  }
  if (mv.resign) {
    ns.out[seat] = true;
    ns.deck.unshift(...ns.hands[seat]);
    ns.hands[seat] = [];
    if (ns.unoPending === seat) ns.unoPending = null;
    if (ns.thunder === seat) ns.thunder = null;
    ns.history.push(`${label(seat)} 投了`);
    const left = activeSeats(ns);
    if (left.length === 1) { ns.result = { winner: left[0], reason: '他の全員が投了' }; ns.race = null; ns.tickAt = null; return ns; }
    if (ns.race) { if (activeSeats(ns).every((q) => ns.race.order.includes(q))) finishRace(ns, rng); return ns; }
    if (ns.turn === seat) setTurn(ns, nextSeat(ns, seat), rng);
    return ns;
  }
  if (s.race) throw new Error('いまは早押し中です！');

  // ---- 手番に関係なくできること ----
  if (mv.catchUno != null) {
    const target = mv.catchUno;
    if (target === seat) throw new Error('自分は指摘できません');
    if (s.unoPending !== target) throw new Error('今は指摘できません');
    drawCards(ns, target, 2, rng);
    ns.unoPending = null;
    ns.lastAction = { type: 'caught', seat: target, by: seat };
    ns.history.push(`${label(target)} ラストカードの言い忘れ → 2枚`);
    return ns;
  }
  if (mv.uno && mv.play == null) {
    if (s.unoPending !== seat) throw new Error('今はラストカードを宣言できません');
    ns.unoPending = null;
    ns.lastAction = { type: 'uno', seat };
    ns.history.push(`${label(seat)} ラストカード！`);
    return ns;
  }

  // ---- 手番の人だけ ----
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  // 次の人が動いたら言い忘れの指摘はできなくなる
  if (ns.unoPending !== null && ns.unoPending !== seat) ns.unoPending = null;

  if (mv.draw) {
    if (s.drawStack > 0) {
      // 重ねられない（重ねない）: たまった分をまとめて引いて、番は飛ばされる
      const n = s.drawStack;
      drawCards(ns, seat, n, rng);
      ns.drawStack = 0;
      ns.lastAction = { type: 'stackDraw', seat, n };
      ns.history.push(`${label(seat)} たまった ${n}枚を引いた`);
      setTurn(ns, nextSeat(ns, seat), rng);
      return ns;
    }
    if (s.drawn != null) throw new Error('もう引きました');
    drawCards(ns, seat, 1, rng);
    const card = ns.hands[seat][ns.hands[seat].length - 1];
    ns.history.push(`${label(seat)} 1枚引く`);
    ns.lastAction = { type: 'draw', seat };
    if (card && isPlayable(ns, seat, card)) ns.drawn = card.id;
    else setTurn(ns, nextSeat(ns, seat), rng);
    return ns;
  }

  if (mv.pass) {
    if (s.drawn == null) throw new Error('先に山札から引いてください');
    ns.history.push(`${label(seat)} パス`);
    ns.lastAction = { type: 'pass', seat };
    setTurn(ns, nextSeat(ns, seat), rng);
    return ns;
  }

  if (mv.play != null) {
    const hand = ns.hands[seat];
    const idx = hand.findIndex((c) => c.id === mv.play);
    if (idx < 0) throw new Error('そのカードは持っていません');
    if (!playableIds(s, seat).includes(mv.play)) throw new Error(s.drawStack > 0 ? '重ねられるのはドロー2・ワイルドドロー4だけです' : 'そのカードは出せません');
    const card = hand[idx];
    if ((card.v === 'wild' || card.v === '+4') && !COLORS.includes(mv.color)) throw new Error('色を選んでください');
    hand.splice(idx, 1);
    ns.discard.push(card);
    ns.color = card.c || mv.color;
    ns.drawn = null;
    let note = `${label(seat)} ${cardName(card)}${card.c ? '' : `（${COLOR_NAMES[ns.color]}）`}`;
    ns.lastAction = { type: 'play', seat, card };

    if (!hand.length) {
      ns.unoPending = null;
      ns.history.push(note + ' 上がり！');
      ns.result = { winner: seat, reason: '手札がなくなりました' };
      return ns;
    }
    if (hand.length === 1) {
      if (mv.uno) note += ' ラストカード！';
      else ns.unoPending = seat;
    }

    const twoLeft = activeSeats(ns).length === 2;
    if (card.v === 'rev') ns.direction = -ns.direction;
    let next = nextSeat(ns, seat);
    if (card.v === 'skip' || (card.v === 'rev' && twoLeft)) {
      next = nextSeat(ns, next);
    } else if (card.v === '+2' || card.v === '+4') {
      // 引く枚数はためて、次の人へ（重ねられなければ、その人がまとめて引く）
      ns.drawStack = s.drawStack + (card.v === '+2' ? 2 : 4);
      note += s.drawStack > 0 ? ` 重ねた！ +${ns.drawStack} → ${label(next)}` : ` → ${label(next)} +${ns.drawStack}`;
    } else if (card.v === 'event') {
      const ev = EVENTS[randInt(rng, EVENTS.length)];
      ns.lastAction = { type: 'event', seat, card, event: ev };
      if (ev === 'thunder') {
        ns.thunder = next;
        note += ` → イベント「雷」！ ⚡ ${label(next)} に雷が付いた`;
      } else if (ev === 'race') {
        note += ' → イベント「早押し」！';
        ns.history.push(note);
        startRace(ns, seat, next, ctx, rng);
        return ns;
      } else if (ev === 'rotate') {
        const live = activeSeats(ns);
        const old = ns.hands.map((h) => h.slice());
        for (const p of live) ns.hands[nextSeat(ns, p)] = old[p];
        ns.unoPending = null;
        note += ' → イベント「手札まわし」！ 全員の手札が次の人へ';
      } else {
        next = seat;
        note += ' → イベント「もう1回」！';
      }
    }
    ns.history.push(note);
    setTurn(ns, next, rng);
    return ns;
  }
  throw new Error('不明な操作です');
}

// ---------- CPU ----------
// 同じ色の記号カード → 数字 → ワイルドの順に出す。残り2枚から出すときは必ず宣言。ほかの人の言い忘れは指摘する。
// 重ねられるなら重ねる。早押しは tick の中で押す
export function aiMove(s, seat) {
  if (s.result || s.out[seat] || s.race) return null;
  if (s.unoPending != null && s.unoPending !== seat) return { catchUno: s.unoPending };
  if (s.unoPending === seat) return { uno: true };
  if (s.turn !== seat) return null;
  const hand = s.hands[seat];
  const ids = playableIds(s, seat);
  if (!ids.length) return s.drawStack > 0 ? { draw: true } : s.drawn != null ? { pass: true } : { draw: true };
  const rank = (c) => (c.v === '+4' ? 0 : c.v === 'wild' ? 1 : /^\d$/.test(c.v) ? 3 : 4);
  const cards = ids.map((i) => hand.find((c) => c.id === i)).sort((a, b) => rank(b) - rank(a));
  const card = cards[0];
  const mv = { play: card.id, uno: hand.length === 2 || undefined };
  if (!card.c) {
    const counts = {};
    for (const c of hand) if (c.c) counts[c.c] = (counts[c.c] || 0) + 1;
    mv.color = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'r';
  }
  return mv;
}
