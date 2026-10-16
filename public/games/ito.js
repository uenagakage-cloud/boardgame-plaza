// ito のルール（サーバーとブラウザで共通）。itogame リポジトリの動きをボードゲーム広場の形に移したもの。
// 2〜10人の協力ゲーム。全員に 1〜100 のカードが配られ（数字は自分にしか見えない）、
// お題に沿って数字の大きさを表す言葉をカードに書き込み、みんなで左から小さい順に並べる。
// 全員が「この順番でOK」を押すと左から1枚ずつめくり、全部小さい順なら成功。ラウンドを重ねて成功回数を数える。
// 手: { hint: { cardId, text } } 自分のカードに書く / { move: { cardId, to } } 誰のカードでも動かせる
//     { ready: true|false } / ホストだけ: { reroll: true } { customTheme: text } { forceReveal: true } { next: true }
// 答え合わせはサーバーが tick() を 1.2 秒ごとに呼んで1枚ずつめくる。
import { THEMES } from './ito-themes.js';

export const id = 'ito';
export const title = 'ito';
export const sideNames = Array.from({ length: 10 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 2;
export const maxPlayers = 10;
export const noResign = true;    // 投了ボタンは出さない（退出はロビーへ戻るだけ）
export const lobbyReturn = true; // ホストがロビー（開始前の待合室）に戻せる
export const logTitle = 'ログ';
export const MAX_CARDS = 5;
export const REVEAL_INTERVAL_MS = 1200; // 答え合わせで1枚めくる間隔
export const THEME_COUNT = THEMES.length;

export function normalizeOptions(o) {
  const cards = Math.min(MAX_CARDS, Math.max(1, parseInt(o && o.cardsPerPlayer, 10) || 1));
  return { cardsPerPlayer: cards };
}

export function variantName(options) {
  return `カード${normalizeOptions(options).cardsPerPlayer}枚`;
}

function shuffle(arr, rng) {
  const rand = rng ? (n) => rng(n) - 1 : (n) => Math.floor(Math.random() * n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// お題をシャッフルした山
const buildDeck = (rng) => shuffle(THEMES.slice(), rng);

function pickTheme(s, rng) {
  if (!s.themeDeck.length) s.themeDeck = buildDeck(rng);
  return s.themeDeck.pop();
}

const label = (seat) => `P${seat + 1}`;

function addLog(s, text) {
  s.history.push(text);
  if (s.history.length > 60) s.history.shift();
}

function startRound(s, rng) {
  const deck = shuffle(Array.from({ length: 100 }, (_, i) => i + 1), rng);
  let n = 0;
  s.cards = [];
  for (let p = 0; p < s.players; p++) {
    if (s.out[p]) continue;
    for (let k = 0; k < s.options.cardsPerPlayer; k++) {
      s.cards.push({ id: `${s.round + 1}-${++n}`, value: deck.pop(), owner: p, hint: '' });
    }
  }
  shuffle(s.cards, rng);
  s.round += 1;
  s.theme = pickTheme(s, rng);
  s.revealed = 0;
  s.outcome = null;
  s.phase = 'arrange';
  s.ready = Array(s.players).fill(false);
  s.tickAfter = null;
  addLog(s, `第${s.round}ラウンド！ お題「${s.theme}」`);
}

export function init(options, players = 2, rng) {
  const opts = normalizeOptions(options);
  const s = {
    players, options: opts, out: Array(players).fill(false),
    round: 0, wins: 0, theme: null, themeDeck: buildDeck(rng),
    cards: [], revealed: 0, outcome: null, phase: 'arrange', ready: Array(players).fill(false),
    tickAfter: null, turn: 0, result: null, history: [],
  };
  startRound(s, rng);
  return s;
}

export const canActOutOfTurn = () => true;

// 左側（めくられた中）により大きい数があれば順番ミス
export function isInOrder(cards, i) {
  for (let j = 0; j < i; j++) if (cards[j].value > cards[i].value) return false;
  return true;
}

// 数字は持ち主本人と、めくられたカードだけに見せる。お題の山は送らない
export function viewFor(s, seat) {
  return {
    ...s,
    themeDeck: null,
    cards: s.cards.map((c, i) => ({
      id: c.id, owner: c.owner, hint: c.hint,
      value: c.owner === seat || i < s.revealed ? c.value : null,
      ok: i < s.revealed ? isInOrder(s.cards, i) : null,
    })),
  };
}

export function phaseText(s) {
  if (s.phase === 'arrange') return 'お題に沿ってカードに書き込み、みんなで左から小さい順に並べよう';
  if (s.phase === 'reveal') return '答え合わせ中… 左から1枚ずつめくります';
  return s.outcome === 'success' ? '大成功！ 全部小さい順に並んでいました 🎉' : '残念… 順番が崩れているところがありました';
}

const clone = (s) => ({
  ...s, out: s.out.slice(), cards: s.cards.map((c) => ({ ...c })), ready: s.ready.slice(),
  themeDeck: s.themeDeck.slice(), history: s.history.slice(),
});

function startReveal(ns) {
  ns.phase = 'reveal';
  ns.revealed = 0;
  ns.tickAfter = REVEAL_INTERVAL_MS;
  addLog(ns, '答え合わせ！');
}

// 答え合わせ中にサーバーから呼ばれる。1枚めくり、全部めくれたら結果を出す
export function tick(s) {
  if (s.phase !== 'reveal') return { ...s, tickAfter: null };
  const ns = clone(s);
  ns.revealed += 1;
  if (ns.revealed >= ns.cards.length) {
    const ok = ns.cards.every((_, i) => isInOrder(ns.cards, i));
    ns.outcome = ok ? 'success' : 'fail';
    if (ok) ns.wins += 1;
    ns.phase = 'result';
    ns.tickAfter = null;
    addLog(ns, ok ? '大成功！ 全部小さい順に並んでいた！' : '残念… 順番が崩れているところがあった');
  } else {
    ns.tickAfter = REVEAL_INTERVAL_MS;
  }
  return ns;
}

// 接続中で抜けていない全員がOKなら答え合わせ
function revealIfAllReady(ns, online) {
  const active = [...Array(ns.players).keys()].filter((p) => !ns.out[p] && (!online || online[p]));
  if (active.length && active.every((p) => ns.ready[p])) startReveal(ns);
}

export function applyMove(s, mv, seat, rng, ctx = {}) {
  mv = mv || {};
  const isHost = seat === ctx.hostSeat;
  const ns = clone(s);

  if (mv.resign) {
    // 外されたプレイヤーのカードは場から取り除く
    ns.out[seat] = true;
    ns.cards = ns.cards.filter((c) => c.owner !== seat);
    ns.ready[seat] = false;
    addLog(ns, `${label(seat)} が退出しました`);
    if (ns.phase === 'arrange') revealIfAllReady(ns, ctx.online);
    return ns;
  }
  if (s.out[seat]) throw new Error('このラウンドには参加していません');

  if (mv.hint) {
    if (s.phase !== 'arrange') return s;
    const c = ns.cards.find((x) => x.id === mv.hint.cardId);
    if (!c || c.owner !== seat) throw new Error('自分のカードにだけ書き込めます');
    const text = String(mv.hint.text || '').slice(0, 30);
    if (text === c.hint) return s;
    c.hint = text;
    ns.ready = Array(ns.players).fill(false);
    return ns;
  }

  if (mv.move) {
    if (s.phase !== 'arrange') return s;
    const from = ns.cards.findIndex((x) => x.id === mv.move.cardId);
    if (from < 0) return s;
    const to = Math.min(ns.cards.length - 1, Math.max(0, parseInt(mv.move.to, 10) || 0));
    if (from === to) return s;
    const [c] = ns.cards.splice(from, 1);
    ns.cards.splice(to, 0, c);
    ns.ready = Array(ns.players).fill(false);
    return ns;
  }

  if (mv.ready != null) {
    if (s.phase !== 'arrange') return s;
    ns.ready[seat] = !!mv.ready;
    revealIfAllReady(ns, ctx.online);
    return ns;
  }

  // ---- ホストだけの操作 ----
  if (!isHost) throw new Error('ホストだけが操作できます');
  if (mv.reroll || mv.customTheme != null) {
    if (s.phase !== 'arrange') return s;
    if (mv.reroll) ns.theme = pickTheme(ns, rng);
    else {
      const t = String(mv.customTheme || '').trim().slice(0, 60);
      if (!t) return s;
      ns.theme = t;
    }
    addLog(ns, `お題を変更: 「${ns.theme}」`);
    return ns;
  }
  if (mv.forceReveal) {
    if (s.phase !== 'arrange') return s;
    startReveal(ns);
    return ns;
  }
  if (mv.next) {
    if (s.phase !== 'result') return s;
    startRound(ns, rng);
    return ns;
  }
  throw new Error('不明な操作です');
}
