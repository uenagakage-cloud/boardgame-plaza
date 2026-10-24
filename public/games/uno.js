// UNO のルール（サーバーとブラウザで共通）
// 2〜6人。108枚（各色 0×1・1〜9×2・スキップ×2・リバース×2・ドロー2×2、ワイルド×4、ワイルドドロー4×4）、手札7枚。
// 場と同じ色・同じ数字/記号のカードかワイルドを出す。ワイルドドロー4は場の色のカードがないときだけ出せる。
// 出せない（出さない）ときは1枚引き、引いたカードが出せればそのまま出すか、パスする。
// 残り1枚になるとき「UNO」と言わないと、次の人が動く前にほかの人に指摘されて2枚引く。先に手札がなくなった人の勝ち。
// 手: { play: カードid, color?, uno? } / { draw: true } / { pass: true } / { uno: true } 言い忘れの宣言
//     { catchUno: 席 } UNO の言い忘れを指摘 / { resign: true }
export const id = 'uno';
export const title = 'UNO';
export const sideNames = ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4', 'プレイヤー5', 'プレイヤー6'];
export const minPlayers = 2;
export const maxPlayers = 6;
export const HAND_SIZE = 7;
export const COLORS = ['r', 'y', 'g', 'b'];
export const COLOR_NAMES = { r: '赤', y: '黄', g: '緑', b: '青' };

const VALUE_LABEL = { skip: 'スキップ', rev: 'リバース', '+2': 'ドロー2', wild: 'ワイルド', '+4': 'ワイルドドロー4' };
export const cardName = (c) => (c.c ? COLOR_NAMES[c.c] : '') + (VALUE_LABEL[c.v] || c.v);

function makeDeck() {
  const cards = [];
  for (const c of COLORS) {
    cards.push({ c, v: '0' });
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', '+2']) cards.push({ c, v }, { c, v });
  }
  for (let i = 0; i < 4; i++) cards.push({ c: null, v: 'wild' }, { c: null, v: '+4' });
  return cards.map((card, i) => ({ id: i, ...card }));
}

function shuffle(arr, rng) {
  const rand = rng ? (n) => rng(n) - 1 : (n) => Math.floor(Math.random() * n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
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
    drawn: null, unoPending: null, lastAction: null, result: null, history: [],
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
  if (card.v === 'wild') return true;
  if (card.v === '+4') return !s.hands[seat].some((c) => c.c === s.color);
  return card.c === s.color || card.v === top(s).v;
}

// 今出せるカードの id（引いたあとは引いたカードだけ）
export function playableIds(s, seat) {
  if (s.result || s.turn !== seat || s.out[seat]) return [];
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
  };
}

export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  return s.drawn != null ? '引いたカードを出すか、パスしてください' : 'あなたの番です：カードを出すか、山札から引いてください';
}

export const scoreOf = (s, seat) => `${s.handCounts ? s.handCounts[seat] : s.hands[seat].length}枚`;

const clone = (s) => ({
  ...s, deck: s.deck.slice(), discard: s.discard.slice(), hands: s.hands.map((h) => h.slice()),
  out: s.out.slice(), history: s.history.slice(),
});

const label = (seat) => `P${seat + 1}`;

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (s.out[seat]) throw new Error('投了しています');
  const ns = clone(s);

  // ---- 手番に関係なくできること ----
  if (mv.catchUno != null) {
    const target = mv.catchUno;
    if (target === seat) throw new Error('自分は指摘できません');
    if (s.unoPending !== target) throw new Error('今は指摘できません');
    drawCards(ns, target, 2, rng);
    ns.unoPending = null;
    ns.lastAction = { type: 'caught', seat: target, by: seat };
    ns.history.push(`${label(target)} UNO言い忘れ → 2枚`);
    return ns;
  }
  if (mv.uno && mv.play == null) {
    if (s.unoPending !== seat) throw new Error('今は UNO を宣言できません');
    ns.unoPending = null;
    ns.lastAction = { type: 'uno', seat };
    ns.history.push(`${label(seat)} UNO!`);
    return ns;
  }
  if (mv.resign) {
    ns.out[seat] = true;
    ns.deck.unshift(...ns.hands[seat]);
    ns.hands[seat] = [];
    if (ns.unoPending === seat) ns.unoPending = null;
    ns.history.push(`${label(seat)} 投了`);
    const left = activeSeats(ns);
    if (left.length === 1) { ns.result = { winner: left[0], reason: '他の全員が投了' }; return ns; }
    if (ns.turn === seat) { ns.turn = nextSeat(ns, seat); ns.drawn = null; }
    return ns;
  }

  // ---- 手番の人だけ ----
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  // 次の人が動いたら UNO の指摘はできなくなる
  if (ns.unoPending !== null && ns.unoPending !== seat) ns.unoPending = null;

  if (mv.draw) {
    if (s.drawn != null) throw new Error('もう引きました');
    drawCards(ns, seat, 1, rng);
    const card = ns.hands[seat][ns.hands[seat].length - 1];
    ns.history.push(`${label(seat)} 1枚引く`);
    ns.lastAction = { type: 'draw', seat };
    if (card && isPlayable(ns, seat, card)) ns.drawn = card.id;
    else { ns.drawn = null; ns.turn = nextSeat(ns, seat); }
    return ns;
  }

  if (mv.pass) {
    if (s.drawn == null) throw new Error('先に山札から引いてください');
    ns.drawn = null;
    ns.turn = nextSeat(ns, seat);
    ns.history.push(`${label(seat)} パス`);
    ns.lastAction = { type: 'pass', seat };
    return ns;
  }

  if (mv.play != null) {
    const hand = ns.hands[seat];
    const idx = hand.findIndex((c) => c.id === mv.play);
    if (idx < 0) throw new Error('そのカードは持っていません');
    if (!playableIds(s, seat).includes(mv.play)) throw new Error('そのカードは出せません');
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
      if (mv.uno) note += ' UNO!';
      else ns.unoPending = seat;
    }

    const twoLeft = activeSeats(ns).length === 2;
    if (card.v === 'rev') ns.direction = -ns.direction;
    let next = nextSeat(ns, seat);
    if (card.v === 'skip' || (card.v === 'rev' && twoLeft)) {
      next = nextSeat(ns, next);
    } else if (card.v === '+2' || card.v === '+4') {
      const n = card.v === '+2' ? 2 : 4;
      drawCards(ns, next, n, rng);
      note += ` → ${label(next)} ${n}枚引いてスキップ`;
      next = nextSeat(ns, next);
    }
    ns.turn = next;
    ns.history.push(note);
    return ns;
  }
  throw new Error('不明な操作です');
}
