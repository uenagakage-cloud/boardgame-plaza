// ブラックジャック（サーバーとブラウザで共通）
// 1〜6人。みんなディーラー（親）と勝負する。全員 1000 チップから。決めた回数のゲームをして、チップが一番多い人の勝ち。
// 1回の流れ: 全員がチップを賭ける → 2枚ずつ配る（ディーラーは1枚伏せる）→ それぞれ「ヒット（もう1枚）」か「スタンド（止める）」。
// 21 を超えたらバースト（負け）。最初の2枚なら「ダブル（賭けを2倍にして1枚だけ引く）」もできる。
// 全員が終わったら、ディーラーは 17 以上になるまで引く。21 に近いほうの勝ち。A は 1 か 11、絵札は 10。
// 最初の2枚で 21（ブラックジャック）は 1.5 倍もらえる。引き分けは賭けたチップが戻る。
// 手: { bet: 数 } / { hit: true } / { stand: true } / { double: true } / { resign: true }
import { shuffle, makeDeck52, pickOptions, seatNames, label, cardLabel } from './util.js';

export const id = 'blackjack';
export const title = 'ブラックジャック';
export const minPlayers = 1;
export const maxPlayers = 6;
export const sideNames = seatNames(6);
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const START_CHIPS = 1000;
export const BET_STEP = 100; // 賭けは100枚ずつ（持っているのが100枚より少なければ全部）
export const OPTIONS = [{ key: 'rounds', label: 'ゲーム数', values: [5, 3, 10], names: ['5回', '3回', '10回'] }];
const DEALER_MS = 700, RESULT_MS = 4500;
export const normalizeOptions = (o) => pickOptions(o, OPTIONS);
export const variantName = (o) => `${normalizeOptions(o).rounds}回勝負`;

export function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { if (c.r === 1) { aces++; t += 11; } else t += Math.min(10, c.r); }
  while (t > 21 && aces) { t -= 10; aces--; }
  return t;
}
export const isBlackjack = (cards) => cards.length === 2 && total(cards) === 21;

export function init(options, players = 1, rng) {
  const opts = normalizeOptions(options);
  const s = {
    players, options: opts, shoe: shuffle(makeDeck52(4), rng), chips: Array(players).fill(START_CHIPS),
    round: 0, phase: 'bet', bets: Array(players).fill(null), hands: Array.from({ length: players }, () => []), done: Array(players).fill(false),
    dealer: [], outcome: null, turn: 0, tickAt: null, out: Array(players).fill(false), result: null, history: [],
  };
  return startRound(s, rng);
}

function startRound(s, rng) {
  s.round += 1;
  s.phase = 'bet';
  s.bets = s.bets.map(() => null);
  s.hands = s.hands.map(() => []);
  s.done = s.done.map(() => false);
  s.dealer = [];
  s.outcome = null;
  s.tickAt = null;
  if (s.shoe.length < 60) s.shoe = shuffle(makeDeck52(4), rng);
  s.history = [`第${s.round}/${s.options.rounds}ゲーム`];
  return s;
}

const playing = (s, p) => !s.out[p] && s.chips[p] + (s.bets[p] || 0) > 0;
const draw = (s) => s.shoe.pop();

export function viewFor(s) {
  // ディーラーの2枚目は、ディーラーの番まで伏せる
  const hide = s.phase === 'play' && s.dealer.length === 2;
  return { ...s, shoe: null, shoeCount: s.shoe.length, dealer: hide ? [s.dealer[0], null] : s.dealer };
}

export const canActOutOfTurn = () => true;
export const scoreOf = (s, seat) => `${s.chips[seat]}枚`;
export function phaseText(s, you) {
  if (s.result || you < 0 || s.out[you]) return null;
  if (s.phase === 'bet') return s.bets[you] == null ? (playing(s, you) ? '賭けるチップを選んでください' : 'チップがありません（見学）') : 'ほかの人を待っています…';
  if (s.phase === 'play') return s.done[you] || !s.hands[you].length ? 'ほかの人を待っています…' : `合計 ${total(s.hands[you])}：ヒットかスタンドか`;
  if (s.phase === 'dealer') return 'ディーラーの番です';
  return null;
}

function deal(ns) {
  ns.phase = 'play';
  for (let p = 0; p < ns.players; p++) if (ns.bets[p]) { ns.hands[p] = [draw(ns), draw(ns)]; ns.done[p] = isBlackjack(ns.hands[p]); } else ns.done[p] = true;
  ns.dealer = [draw(ns), draw(ns)];
  // ディーラーがブラックジャックなら、すぐ勝負
  if (isBlackjack(ns.dealer)) ns.done = ns.done.map(() => true);
  maybeDealer(ns);
}

function maybeDealer(ns) {
  if (ns.phase === 'play' && ns.done.every(Boolean)) { ns.phase = 'dealer'; ns.tickAt = Date.now() + DEALER_MS; }
}

function settle(ns) {
  const d = total(ns.dealer), dbj = isBlackjack(ns.dealer);
  ns.outcome = Array(ns.players).fill(null);
  for (let p = 0; p < ns.players; p++) {
    const bet = ns.bets[p];
    if (!bet) continue;
    const t = total(ns.hands[p]), bj = isBlackjack(ns.hands[p]);
    let gain, text;
    if (t > 21) { gain = -bet; text = 'バースト'; }
    else if (bj && !dbj) { gain = Math.floor(bet * 1.5); text = 'ブラックジャック！'; }
    else if (dbj && !bj) { gain = -bet; text = 'ディーラーのブラックジャック'; }
    else if (d > 21 || t > d) { gain = bet; text = d > 21 ? 'ディーラーがバースト' : '勝ち'; }
    else if (t === d) { gain = 0; text = '引き分け'; }
    else { gain = -bet; text = '負け'; }
    ns.chips[p] += bet + gain; // 賭けた分は先に引いてある
    ns.outcome[p] = { gain, text };
    ns.history.push(`${label(p)} ${text}（${gain >= 0 ? '+' : ''}${gain}）`);
  }
  ns.phase = 'result';
  ns.tickAt = Date.now() + RESULT_MS;
}

function finishGame(ns) {
  const alive = [...Array(ns.players).keys()].filter((p) => !ns.out[p]);
  const best = Math.max(...alive.map((p) => ns.chips[p]));
  const top = alive.filter((p) => ns.chips[p] === best);
  ns.phase = 'end';
  ns.tickAt = null;
  ns.result = ns.players === 1 ? { winner: 0, reason: `チップ ${ns.chips[0]}枚` } : top.length === 1 ? { winner: top[0], reason: `チップ ${best}枚` } : { winner: null, reason: `チップ ${best}枚で同点` };
}

const clone = (s) => ({ ...s, shoe: s.shoe.slice(), chips: s.chips.slice(), bets: s.bets.slice(), hands: s.hands.map((h) => h.slice()), done: s.done.slice(), dealer: s.dealer.slice(), out: s.out.slice(), history: s.history.slice() });

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    ns.out[seat] = true;
    ns.done[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (ns.out.every(Boolean)) { finishGame(ns); return ns; }
    if (ns.phase === 'bet' && ns.bets.every((b, p) => b != null || !playing(ns, p))) deal(ns);
    else maybeDealer(ns);
    return ns;
  }
  if (s.out[seat]) throw new Error('抜けています');
  if (mv.bet != null) {
    if (s.phase !== 'bet' || s.bets[seat] != null) throw new Error('今は賭けられません');
    const bet = Math.floor(Number(mv.bet));
    if (!(bet >= 1) || bet > s.chips[seat]) throw new Error('持っているチップより多くは賭けられません');
    if (bet % BET_STEP !== 0 && bet !== s.chips[seat]) throw new Error(`賭けは${BET_STEP}枚ずつです`);
    ns.bets[seat] = bet;
    ns.chips[seat] -= bet;
    if (ns.bets.every((b, p) => b != null || !playing(ns, p))) deal(ns);
    return ns;
  }
  if (s.phase !== 'play' || s.done[seat] || !s.hands[seat].length) throw new Error('今は操作できません');
  const hand = ns.hands[seat];
  if (mv.hit) {
    hand.push(draw(ns));
    if (total(hand) >= 21) ns.done[seat] = true;
  } else if (mv.stand) {
    ns.done[seat] = true;
  } else if (mv.double) {
    if (hand.length !== 2) throw new Error('ダブルは最初の2枚のときだけです');
    if (ns.chips[seat] < ns.bets[seat]) throw new Error('チップが足りません');
    ns.chips[seat] -= ns.bets[seat];
    ns.bets[seat] *= 2;
    hand.push(draw(ns));
    ns.done[seat] = true;
    ns.history.push(`${label(seat)} ダブル！`);
  } else throw new Error('不明な操作です');
  maybeDealer(ns);
  return ns;
}

export function tick(s, rng) {
  if (s.result) return s;
  const ns = clone(s);
  if (s.phase === 'dealer') {
    // バーストしていない人がいるときだけ引く
    const needed = ns.hands.some((h, p) => ns.bets[p] && total(h) <= 21 && !isBlackjack(h));
    if (needed && total(ns.dealer) < 17) { ns.dealer.push(draw(ns)); ns.tickAt = Date.now() + DEALER_MS; return ns; }
    settle(ns);
    return ns;
  }
  if (s.phase === 'result') {
    if (ns.round >= ns.options.rounds || ![...Array(ns.players).keys()].some((p) => playing(ns, p))) { finishGame(ns); return ns; }
    return startRound(ns, rng);
  }
  return { ...s, tickAt: null };
}

// ---------- CPU ----------
// 賭けは持っているチップの1割くらい（100枚ずつ）。基本の作戦（ざっくり）で引く
export function aiMove(s, seat) {
  if (s.result || s.out[seat]) return null;
  if (s.phase === 'bet') {
    if (s.bets[seat] != null || !playing(s, seat)) return null;
    const chips = s.chips[seat];
    if (chips < BET_STEP) return { bet: chips };
    return { bet: Math.max(BET_STEP, Math.min(Math.floor(chips / BET_STEP) * BET_STEP, Math.round(chips * 0.12 / BET_STEP) * BET_STEP)) };
  }
  if (s.phase !== 'play' || s.done[seat] || !s.hands[seat].length) return null;
  const hand = s.hands[seat], t = total(hand);
  const up = s.dealer[0] ? Math.min(10, s.dealer[0].r === 1 ? 11 : s.dealer[0].r) : 10;
  const soft = hand.some((c) => c.r === 1) && hand.reduce((a, c) => a + Math.min(10, c.r), 0) + 10 === t;
  if (hand.length === 2 && (t === 11 || (t === 10 && up <= 9)) && s.chips[seat] >= s.bets[seat]) return { double: true };
  if (soft) return t <= 17 ? { hit: true } : { stand: true };
  if (t <= 11) return { hit: true };
  if (t >= 17) return { stand: true };
  if (t === 12) return up >= 4 && up <= 6 ? { stand: true } : { hit: true };
  return up >= 7 ? { hit: true } : { stand: true };
}

export const describeHand = (cards) => cards.filter(Boolean).map(cardLabel).join(' ');
