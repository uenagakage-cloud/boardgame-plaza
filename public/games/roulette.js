// ルーレット（カジノ）（サーバーとブラウザで共通）
// 1〜6人。全員 1000 チップから（点数だけで、お金は使わない）。ヨーロッパ式（0〜36）。
// 1回の流れ: みんながテーブルにチップを置く（100枚ずつ・何か所でも）→ 全員「OK」か時間切れでホイールが回る →
//   ボールが止まった数で、当たった賭けに配当。決めた回数を遊んで、チップが一番多い人の勝ち。
// 賭け方と配当（賭けた分も戻る）: 数字1つ 36倍（35倍＋元）、赤／黒・奇数／偶数・1〜18／19〜36 2倍、ダズン（1〜12など）・列 3倍。0 のときは数字の0以外は外れ。
// 手: { place: { spot, amount } } / { clear: true } 置いたチップを全部戻す / { ready: true|false } / { resign: true }
// 回っている間（約5秒）は配当しない（結果が先に分からないように、止まってから）。CPU は tick の中で置く。
import { pickOptions, seatNames, label, randInt } from './util.js';

export const id = 'roulette';
export const title = 'ルーレット';
export const minPlayers = 1;
export const maxPlayers = 6;
export const sideNames = seatNames(6);
export const lobbyReturn = true;
export const botInTick = true;
export const logTitle = 'ログ';
export const START_CHIPS = 1000;
export const BET_STEP = 100;
export const OPTIONS = [{ key: 'rounds', label: '回数', values: [8, 5, 12], names: ['8回', '5回', '12回'] }];
export const BET_MS = 40000;   // チップを置ける時間
export const SPIN_MS = 5200;   // ホイールが回って止まるまで
const RESULT_MS = 4500;
export const normalizeOptions = (o) => pickOptions(o, OPTIONS);
export const variantName = (o) => `${normalizeOptions(o).rounds}回`;

// ホイールの並び（ヨーロッパ式）
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

// 賭ける場所: n0〜n36 / red black odd even low high / d1 d2 d3（ダズン） / c1 c2 c3（列）
export const OUTSIDE = {
  red: { name: '赤', pay: 1 }, black: { name: '黒', pay: 1 }, odd: { name: '奇数', pay: 1 }, even: { name: '偶数', pay: 1 },
  low: { name: '1〜18', pay: 1 }, high: { name: '19〜36', pay: 1 },
  d1: { name: '1〜12', pay: 2 }, d2: { name: '13〜24', pay: 2 }, d3: { name: '25〜36', pay: 2 },
  c1: { name: '1列目', pay: 2 }, c2: { name: '2列目', pay: 2 }, c3: { name: '3列目', pay: 2 },
};
export const spotName = (spot) => (spot[0] === 'n' && /^n\d+$/.test(spot) ? spot.slice(1) : OUTSIDE[spot]?.name || spot);
export const validSpot = (spot) => (typeof spot === 'string' && ((/^n\d+$/.test(spot) && Number(spot.slice(1)) <= 36) || !!OUTSIDE[spot]));

// spot に賭けて n が出たとき、何倍の配当か（外れは 0。賭けた分は別に戻る）
export function payout(spot, n) {
  if (spot[0] === 'n' && /^n\d+$/.test(spot)) return Number(spot.slice(1)) === n ? 35 : 0;
  if (n === 0) return 0;
  const hit = {
    red: REDS.has(n), black: !REDS.has(n), odd: n % 2 === 1, even: n % 2 === 0, low: n <= 18, high: n >= 19,
    d1: n <= 12, d2: n >= 13 && n <= 24, d3: n >= 25, c1: n % 3 === 1, c2: n % 3 === 2, c3: n % 3 === 0,
  }[spot];
  return hit ? OUTSIDE[spot].pay : 0;
}

export function init(options, players = 1) {
  const s = {
    players, options: normalizeOptions(options), chips: Array(players).fill(START_CHIPS), out: Array(players).fill(false),
    round: 0, phase: 'bet', bets: [], ready: Array(players).fill(false), number: null, spinAt: null, outcome: null,
    deadline: null, tickAt: null, botAt: {}, botDone: {}, history: [], spins: [], turn: 0, result: null,
  };
  return startRound(s);
}

const canPlay = (s, p) => !s.out[p] && s.chips[p] + staked(s, p) > 0;
export const staked = (s, p) => s.bets.filter((b) => b.by === p).reduce((a, b) => a + b.amount, 0);

function startRound(s) {
  s.round += 1;
  s.phase = 'bet';
  s.bets = [];
  s.ready = s.ready.map(() => false);
  s.number = null;
  s.spinAt = null;
  s.outcome = null;
  s.deadline = Date.now() + BET_MS;
  s.tickAt = Date.now() + 800; // すぐに一度 tick して、CPU の置く時刻を決める
  s.botAt = {};
  s.botDone = {};
  s.history = [`第${s.round}/${s.options.rounds}回：チップを置いてください`];
  return s;
}

export const canActOutOfTurn = () => true;
export const scoreOf = (s, seat) => `${s.chips[seat]}枚`;
export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'bet') return you >= 0 && !s.out[you] ? (s.ready[you] ? 'ほかの人を待っています…（置き直すときは「待って」）' : 'チップを置いて「OK」を押してください') : 'みんながチップを置いています…';
  if (s.phase === 'spin') return 'ルーレットが回っています…';
  if (s.phase === 'result') return `${s.number}（${{ red: '赤', black: '黒', green: '緑' }[colorOf(s.number)]}）！`;
  return null;
}

const clone = (s) => ({ ...s, chips: s.chips.slice(), out: s.out.slice(), bets: s.bets.map((b) => ({ ...b })), ready: s.ready.slice(), botAt: { ...s.botAt }, botDone: { ...s.botDone }, history: s.history.slice(), spins: s.spins.slice() });
const live = (s) => [...Array(s.players).keys()].filter((p) => canPlay(s, p));

function place(ns, p, spot, amount) {
  if (!validSpot(spot)) throw new Error('そこには置けません');
  const n = Math.floor(Number(amount));
  if (!(n >= 1) || n > ns.chips[p]) throw new Error('持っているチップより多くは置けません');
  if (n % BET_STEP !== 0 && n !== ns.chips[p]) throw new Error(`チップは${BET_STEP}枚ずつ置けます`);
  ns.chips[p] -= n;
  const b = ns.bets.find((x) => x.by === p && x.spot === spot);
  if (b) b.amount += n; else ns.bets.push({ by: p, spot, amount: n });
  ns.ready[p] = false;
}

// みんなOK（か時間切れ）: ホイールを回す。出る数はここで決めるが、配当は止まってから
function spin(ns, rng) {
  ns.phase = 'spin';
  ns.number = WHEEL[randInt(rng, WHEEL.length)];
  ns.spinAt = Date.now();
  ns.tickAt = ns.spinAt + SPIN_MS;
  ns.deadline = null;
  const total = ns.bets.reduce((a, b) => a + b.amount, 0);
  ns.history.push(total ? 'ルーレットを回します！' : 'だれも置かなかったけど回します');
}

// 1回の増減の言い方（当たりがあっても、ほかの外れで差し引きマイナスのこともある）
export function netText(o) {
  const net = o.win - o.bet;
  if (!o.win) return `外れ −${o.bet}`;
  return net > 0 ? `当たり！ +${net}` : net === 0 ? '当たり（差し引き ±0）' : `当たりもあったけど −${-net}`;
}

function settle(ns) {
  const n = ns.number;
  ns.outcome = Array(ns.players).fill(null).map(() => ({ bet: 0, win: 0 }));
  for (const b of ns.bets) {
    const k = payout(b.spot, n);
    const o = ns.outcome[b.by];
    o.bet += b.amount;
    if (k) { o.win += b.amount * (k + 1); ns.chips[b.by] += b.amount * (k + 1); }
  }
  ns.spins = [...ns.spins, n].slice(-12);
  ns.history.push(`${n}（${{ red: '赤', black: '黒', green: '緑' }[colorOf(n)]}）が出ました`);
  ns.outcome.forEach((o, p) => { if (o.bet) ns.history.push(`${label(p)} ${netText(o)}`); });
  ns.phase = 'result';
  ns.tickAt = Date.now() + RESULT_MS;
}

function finishGame(ns) {
  ns.phase = 'end';
  ns.tickAt = null;
  const alive = [...Array(ns.players).keys()].filter((p) => !ns.out[p]);
  const best = Math.max(...alive.map((p) => ns.chips[p]));
  const top = alive.filter((p) => ns.chips[p] === best);
  ns.result = ns.players === 1 ? { winner: 0, reason: `チップ ${best}枚` } : top.length === 1 ? { winner: top[0], reason: `チップ ${best}枚` } : { winner: null, reason: `チップ ${best}枚で同点` };
}

function maybeSpin(ns, rng) {
  const ps = live(ns);
  if (ns.phase === 'bet' && ps.length && ps.every((p) => ns.ready[p])) spin(ns, rng);
}

// CPU: 1〜3か所に、持っているチップの1〜2割くらいを置いて OK
function botPlay(ns, p, rng) {
  const spots = ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3'];
  const k = 1 + randInt(rng, 3);
  for (let i = 0; i < k && ns.chips[p] >= BET_STEP; i++) {
    const spot = randInt(rng, 4) === 0 ? `n${randInt(rng, 37)}` : spots[randInt(rng, spots.length)];
    place(ns, p, spot, BET_STEP * Math.max(1, Math.round((ns.chips[p] * 0.08) / BET_STEP)));
  }
  if (ns.chips[p] > 0 && ns.chips[p] < BET_STEP && !staked(ns, p)) place(ns, p, 'red', ns.chips[p]);
  ns.ready[p] = true;
}

function scheduleBots(ns, bots, rng) {
  if (ns.phase !== 'bet' || !bots) return;
  for (const p of live(ns)) if (bots[p] && !ns.botDone[p] && !ns.botAt[p]) ns.botAt[p] = Date.now() + 1500 + randInt(rng, 3000);
  const times = Object.entries(ns.botAt).filter(([p]) => !ns.botDone[p]).map(([, t]) => t);
  ns.tickAt = Math.min(ns.deadline, ...times);
}

export function applyMove(s, mv, seat, rng, ctx) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    if (s.out[seat]) throw new Error('抜けています');
    // 置いていたチップは戻してから抜ける
    for (const b of ns.bets.filter((x) => x.by === seat)) ns.chips[seat] += b.amount;
    ns.bets = ns.bets.filter((x) => x.by !== seat);
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (!live(ns).length) { finishGame(ns); return ns; }
    maybeSpin(ns, rng);
    return ns;
  }
  if (s.out[seat]) throw new Error('抜けています');
  if (s.phase !== 'bet') throw new Error('今はチップを置けません（回っています）');
  if (mv.place) {
    place(ns, seat, mv.place.spot, mv.place.amount);
    scheduleBots(ns, ctx && ctx.bots, rng);
    return ns;
  }
  if (mv.clear) {
    for (const b of ns.bets.filter((x) => x.by === seat)) ns.chips[seat] += b.amount;
    ns.bets = ns.bets.filter((x) => x.by !== seat);
    ns.ready[seat] = false;
    return ns;
  }
  if (mv.ready != null) {
    ns.ready[seat] = !!mv.ready;
    maybeSpin(ns, rng);
    if (ns.phase === 'bet') scheduleBots(ns, ctx && ctx.bots, rng);
    return ns;
  }
  throw new Error('不明な操作です');
}

export function tick(s, rng, ctx) {
  if (s.result) return { ...s, tickAt: null };
  const ns = clone(s);
  const now = Date.now();
  if (s.phase === 'bet') {
    for (const p of live(ns)) if (ctx && ctx.bots && ctx.bots[p] && !ns.botDone[p] && ns.botAt[p] && ns.botAt[p] <= now + 20) { botPlay(ns, p, rng); ns.botDone[p] = true; }
    if (now >= ns.deadline - 20) { for (const p of live(ns)) ns.ready[p] = true; ns.history.push('時間切れ！'); }
    maybeSpin(ns, rng);
    if (ns.phase === 'bet') scheduleBots(ns, ctx && ctx.bots, rng);
    return ns;
  }
  if (s.phase === 'spin') { settle(ns); return ns; }
  if (s.phase === 'result') {
    if (ns.round >= ns.options.rounds || !live(ns).length) { finishGame(ns); return ns; }
    startRound(ns);
    scheduleBots(ns, ctx && ctx.bots, rng);
    return ns;
  }
  return { ...s, tickAt: null };
}

// ホイールを止める場所のために出る数も送るが、画面では止まるまで出さない（配当も止まってから）
export const viewFor = (s) => ({ ...s, botAt: null });
