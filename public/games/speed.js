// スピード（サーバーとブラウザで共通）
// 2人。赤（♥♦）と黒（♠♣）の26枚ずつ。自分の前に4枚並べ（場札）、残りは自分の山。
// 「スタート」で、それぞれ山から1枚ずつ真ん中の2つの台に出す。あとは順番なしで、台のカードと1つちがい
// （K と A はつながる）の場札をどんどん出す。場札が減ったら山から自動で補充。
// どちらも出せなくなったら、それぞれ山から1枚ずつ台に出しなおす（自動）。先にカードが全部なくなった人の勝ち。
// 出せないカードを出そうとすると、1秒間カードを出せない（ペナルティ）。
// 手: { ready: true } / { play: 場札の位置0〜3, pile: 0|1 } / { resign: true }
// CPU は tick の中で動く（ctx.bots）。
import { shuffle, pickOptions, randInt, RANK_LABEL, SUIT_MARK } from './util.js';

export const id = 'speed';
export const title = 'スピード';
export const sideNames = ['赤', '黒'];
export const CPU = true;
export const botInTick = true;
export const noResign = false;
export const OPTIONS = [{ key: 'level', label: 'CPU の強さ', values: ['normal', 'easy', 'hard'], names: ['ふつう', 'よわい', 'つよい'] }];
const BOT_MS = { easy: 1500, normal: 950, hard: 600 };
const STUCK_MS = 1300;  // どちらも出せないとき、台に出しなおすまで
export const PENALTY_MS = 1000; // まちがえたとき、カードを出せない時間
const START_MS = 3000;  // カウントダウン

export const normalizeOptions = (o) => pickOptions(o, OPTIONS, true);
export const variantName = (o) => { const x = normalizeOptions(o); return x.cpu ? `CPU対戦（${OPTIONS[0].names[OPTIONS[0].values.indexOf(x.level)]}）` : ''; };
export const cardText = (c) => SUIT_MARK[c.s] + RANK_LABEL[c.r];

export function init(options, _players, rng) {
  const opts = normalizeOptions(options);
  const mk = (suits) => shuffle(suits.flatMap((s) => Array.from({ length: 13 }, (_, i) => ({ id: `${s}${i + 1}`, s, r: i + 1 }))), rng);
  const decks = [mk(['h', 'd']), mk(['s', 'c'])];
  const field = decks.map((d) => d.splice(0, 4));
  return { options: opts, phase: 'ready', ready: [false, false], decks, field, piles: [[], []], turn: 0, tickAt: null, botAt: [0, 0], penalty: [0, 0], last: null, result: null, history: [] };
}

export const adjacent = (a, b) => { const d = Math.abs(a - b); return d === 1 || d === 12; };
const top = (pile) => pile[pile.length - 1];
export const canPlay = (s, card, pile) => !!card && !!top(s.piles[pile]) && adjacent(card.r, top(s.piles[pile]).r);
const anyPlay = (s, p) => s.field[p].some((c) => c && (canPlay(s, c, 0) || canPlay(s, c, 1)));
const remaining = (s, p) => s.decks[p].length + s.field[p].filter(Boolean).length;

export function viewFor(s) {
  return { ...s, decks: null, deckCounts: s.decks.map((d) => d.length), piles: s.piles.map((p) => p.slice(-3)), pileCounts: s.piles.map((p) => p.length) };
}

export const canActOutOfTurn = () => true;
export const scoreOf = (s, seat) => `残り${(s.deckCounts ? s.deckCounts[seat] : s.decks[seat].length) + s.field[seat].filter(Boolean).length}枚`;
export function phaseText(s, you) {
  if (s.result || you < 0) return null;
  if (s.phase === 'ready') return s.ready[you] ? '相手の準備を待っています…' : '「スタート」を押してください';
  if (s.phase === 'count') return 'もうすぐスタート！';
  return '台のカードと1つちがいの場札をどんどん出そう！';
}

const clone = (s) => ({ ...s, ready: s.ready.slice(), decks: s.decks.map((d) => d.slice()), field: s.field.map((f) => f.slice()), piles: s.piles.map((p) => p.slice()), botAt: s.botAt.slice(), penalty: (s.penalty || [0, 0]).slice(), history: s.history });

// 山から台に1枚ずつ出す（山がなければ場札から）
function flipToPiles(ns) {
  for (const p of [0, 1]) {
    let c = ns.decks[p].pop();
    if (!c) { const k = ns.field[p].findIndex(Boolean); if (k >= 0) { c = ns.field[p][k]; ns.field[p][k] = null; } }
    if (c) ns.piles[p].push(c);
  }
}

function checkWin(ns) {
  for (const p of [0, 1]) if (!remaining(ns, p)) { ns.result = { winner: p, reason: 'カードが全部なくなった' }; ns.phase = 'end'; ns.tickAt = null; return true; }
  return false;
}

// 次に tick を呼ぶ時刻（行き詰まりの出しなおし・CPU）
function schedule(ns, now, bots) {
  if (ns.result || ns.phase !== 'play') return;
  const t = [];
  if (!anyPlay(ns, 0) && !anyPlay(ns, 1)) { ns.stuckAt = ns.stuckAt || now + STUCK_MS; t.push(ns.stuckAt); } else ns.stuckAt = null;
  if (bots) for (const p of [0, 1]) if (bots[p]) { if (!ns.botAt[p] || ns.botAt[p] < now) ns.botAt[p] = now + BOT_MS[ns.options.level] * (0.7 + Math.random() * 0.6); t.push(ns.botAt[p]); }
  ns.tickAt = t.length ? Math.min(...t) : null;
}

function play(ns, seat, k, pileIdx) {
  const card = ns.field[seat][k];
  ns.piles[pileIdx].push(card);
  ns.field[seat][k] = ns.decks[seat].pop() || null;
  ns.last = { by: seat, card, pile: pileIdx, at: Date.now() };
  ns.count = (ns.count || 0) + 1;
}

export function applyMove(s, mv, seat, rng, ctx) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) { ns.result = { winner: 1 - seat, reason: '投了' }; ns.phase = 'end'; ns.tickAt = null; return ns; }
  if (mv.ready) {
    if (s.phase !== 'ready') return s;
    ns.ready[seat] = true;
    if (ns.ready.every(Boolean)) { ns.phase = 'count'; ns.tickAt = Date.now() + START_MS; }
    return ns;
  }
  if (mv.play == null) throw new Error('不明な操作です');
  if (s.phase !== 'play') throw new Error('まだスタートしていません');
  const k = Number(mv.play), pile = Number(mv.pile);
  const card = s.field[seat][k];
  if (!card) throw new Error('そこにカードはありません');
  const now = Date.now();
  if (ns.penalty[seat] > now) return s; // ペナルティ中は出せない
  if (!(pile === 0 || pile === 1) || !canPlay(s, card, pile)) {
    // まちがい（遅れて先に出されたときも）: 1秒間出せない
    ns.penalty[seat] = now + PENALTY_MS;
    ns.misses = (ns.misses || 0) + 1;
    ns.last = { miss: seat, card, pile, at: now };
    return ns;
  }
  play(ns, seat, k, pile);
  if (!checkWin(ns)) schedule(ns, Date.now(), ctx && ctx.bots);
  return ns;
}

export function tick(s, rng, ctx) {
  if (s.result) return s;
  const ns = clone(s);
  const now = Date.now();
  if (s.phase === 'count') {
    ns.phase = 'play';
    flipToPiles(ns);
    ns.history = [...s.history, 'スタート！'];
    ns.botAt = [0, 0];
    schedule(ns, now, ctx && ctx.bots);
    return ns;
  }
  if (s.phase !== 'play') return { ...s, tickAt: null };
  if (ns.stuckAt && now >= ns.stuckAt - 20) {
    flipToPiles(ns);
    ns.stuckAt = null;
    ns.last = { flip: true, at: now };
    ns.flips = (ns.flips || 0) + 1;
    if (checkWin(ns)) return ns;
  }
  for (const p of [0, 1]) {
    if (!(ctx && ctx.bots && ctx.bots[p]) || ns.botAt[p] > now + 20) continue;
    const opts = [];
    ns.field[p].forEach((c, k) => { for (const pile of [0, 1]) if (canPlay(ns, c, pile)) opts.push([k, pile]); });
    if (opts.length) { const [k, pile] = opts[randInt(rng, opts.length)]; play(ns, p, k, pile); if (checkWin(ns)) return ns; }
    ns.botAt[p] = 0;
  }
  schedule(ns, now, ctx && ctx.bots);
  return ns;
}

// 準備の「スタート」だけ CPU がすぐ押す（ゲーム中の CPU は tick で動く）
export function aiMove(s, seat) {
  if (s.phase === 'ready' && !s.ready[seat]) return { ready: true };
  return null;
}
