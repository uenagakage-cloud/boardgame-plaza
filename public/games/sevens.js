// 7ならべ（サーバーとブラウザで共通）
// 2〜6人。52枚を全員に配り、7のカードは最初に場に並べる。
// 順番に、場のカードのとなり（同じマークで1つ大きいか小さい数）を1枚出す。出せないとき・出したくないときはパス（3回まで）。
// 4回目のパスをするとドボン（負け）で、手札は全部場に並べる。先に手札がなくなった人から上がり。
// 手: { play: カードid } / { pass: true } / { resign: true }
import { shuffle, makeDeck52, SUITS, cardLabel, seatNames, label, pickOptions } from './util.js';

export const id = 'sevens';
export const title = '7ならべ';
export const minPlayers = 2;
export const maxPlayers = 6;
export const sideNames = seatNames(6);
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const OPTIONS = [{ key: 'passes', label: 'パスできる回数', values: [3, 5, 1], names: ['3回', '5回', '1回'] }];
export const normalizeOptions = (o) => pickOptions(o, OPTIONS);
export const variantName = (o) => `パス${normalizeOptions(o).passes}回`;

export function init(options, players = 2, rng) {
  const opts = normalizeOptions(options);
  const deck = shuffle(makeDeck52(), rng);
  const hands = Array.from({ length: players }, () => []);
  deck.forEach((c, i) => hands[i % players].push(c));
  // 場: マークごとに、置かれている数（table[マーク][数] = true）
  const table = Object.fromEntries(SUITS.map((s) => [s, Array.from({ length: 15 }, (_, r) => r === 7)]));
  for (const h of hands) for (let i = h.length - 1; i >= 0; i--) if (h[i].r === 7) h.splice(i, 1);
  const s = { players, options: opts, hands, table, passes: Array(players).fill(0), turn: 0, ranks: [], out: Array(players).fill(false), last: null, result: null, history: ['7を全部並べました'] };
  // 手札がない人（人数が多いとき）は最初から上がり
  return s;
}

export const canPlay = (s, c) => { const t = s.table[c.s]; return !t[c.r] && (t[c.r - 1] || t[c.r + 1]); };
export const playable = (s, seat) => (s.hands[seat] || []).filter((c) => canPlay(s, c));

export function viewFor(s, seat) {
  return {
    ...s,
    seesAll: seat < 0 || !!s.result || !!s.out[seat] || s.ranks.includes(seat),
    hands: s.hands.map((h, i) => (i === seat || s.result || seat < 0 || s.out[seat] || s.ranks.includes(seat) ? h : null)),
    handCounts: s.hands.map((h) => h.length),
  };
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => (s.out[seat] ? 'ドボン' : s.ranks.includes(seat) ? `${s.ranks.indexOf(seat) + 1}位` : `${s.handCounts ? s.handCounts[seat] : s.hands[seat].length}枚・パス${s.passes[seat]}`);
export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  const left = s.options.passes - s.passes[you];
  return playable(s, you).length ? `出すカードを選ぶか、パス（あと${left}回）` : left > 0 ? `出せるカードがありません。パスしてください（あと${left}回）` : '出せるカードがありません。パスするとドボンです';
}

const done = (s, p) => s.out[p] || s.ranks.includes(p);
function advance(ns, seat) {
  const alive = [...Array(ns.players).keys()].filter((p) => !done(ns, p));
  if (alive.length <= 1) {
    if (alive.length === 1) ns.ranks.push(alive[0]);
    const order = [...ns.ranks, ...[...Array(ns.players).keys()].filter((p) => ns.out[p])];
    ns.result = { winner: ns.ranks[0] ?? null, order, reason: ns.ranks.length ? '一番に上がった' : '全員ドボン' };
    return;
  }
  let q = seat;
  do q = (q + 1) % ns.players; while (done(ns, q));
  ns.turn = q;
}
// カードを場に置く（ドボンした人の手札も、それぞれの場所に置く。そのとなりにも出せる）
function spill(ns, cards) {
  for (const c of cards) ns.table[c.s][c.r] = true;
}

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (done(s, seat)) throw new Error('もう上がっています');
  const ns = { ...s, hands: s.hands.map((h) => h.slice()), table: Object.fromEntries(SUITS.map((x) => [x, s.table[x].slice()])), passes: s.passes.slice(), ranks: s.ranks.slice(), out: s.out.slice(), history: s.history.slice() };
  if (mv.resign) {
    ns.out[seat] = true;
    spill(ns, ns.hands[seat]);
    ns.hands[seat] = [];
    ns.history.push(`${label(seat)} が抜けました`);
    if (s.turn === seat) advance(ns, seat); else if ([...Array(ns.players).keys()].filter((p) => !done(ns, p)).length <= 1) advance(ns, seat);
    return ns;
  }
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  if (mv.pass) {
    ns.passes[seat]++;
    if (ns.passes[seat] > s.options.passes) {
      ns.out[seat] = true;
      spill(ns, ns.hands[seat]);
      ns.hands[seat] = [];
      ns.last = { type: 'dobon', by: seat };
      ns.history.push(`${label(seat)} ドボン！`);
    } else {
      ns.last = { type: 'pass', by: seat };
      ns.history.push(`${label(seat)} パス（${ns.passes[seat]}回目）`);
    }
    advance(ns, seat);
    return ns;
  }
  const hand = ns.hands[seat];
  const idx = hand.findIndex((c) => c.id === mv.play);
  if (idx < 0) throw new Error('そのカードは持っていません');
  const c = hand[idx];
  if (!canPlay(s, c)) throw new Error('そのカードは出せません（場のとなりの数だけ）');
  hand.splice(idx, 1);
  spill(ns, [c]);
  ns.last = { type: 'play', by: seat, card: c };
  ns.history.push(`${label(seat)} ${cardLabel(c)}`);
  if (!hand.length) { ns.ranks.push(seat); ns.history.push(`${label(seat)} 上がり！（${ns.ranks.length}位）`); }
  advance(ns, seat);
  return ns;
}

// ---------- CPU ----------
// 出せるカードのうち、同じマークでその先に自分のカードが多いもの（自分が続けて出せる）を出す。
// 出せるのに、ほかの人を困らせるためにパスもする（パスが残っていて、先に自分のカードがないとき）
export function aiMove(s, seat) {
  if (s.result || s.turn !== seat || done(s, seat)) return null;
  const list = playable(s, seat);
  if (!list.length) return { pass: true };
  const hand = s.hands[seat];
  const ahead = (c) => hand.filter((x) => x.s === c.s && (c.r < 7 ? x.r < c.r : x.r > c.r)).length;
  list.sort((a, b) => ahead(b) - ahead(a));
  if (ahead(list[0]) === 0 && s.passes[seat] < s.options.passes - 1 && hand.length > 3 && list.length === 1) return { pass: true };
  return { play: list[0].id };
}
