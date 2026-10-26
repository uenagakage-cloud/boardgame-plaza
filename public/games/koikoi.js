// 花札「こいこい」（サーバーとブラウザで共通）
// 2人。48枚（12か月×4枚）。手札8枚・場8枚を配る。親から交互に:
//  1) 手札から1枚出す。場に同じ月の札があれば取る（2枚あれば1枚選ぶ、3枚あれば全部取る）。なければ場に置く。
//  2) 山から1枚めくり、同じように取るか場に置く。
// 取った札で役ができたら「こいこい（続ける）」か「勝負（やめて点をもらう）」を選ぶ。こいこいした後に相手が役を作ると、相手の点が2倍。
// 7点以上は2倍。手札がなくなっても勝負しなければ、その月は点なし。決めた月数を遊んで、合計点が多い人の勝ち。
// 手役: 配られた手札に同じ月4枚（手四）か、同じ月2枚が4組（くっつき）なら、すぐ6点。
// 手: { play: 札id, target?: 場の札id } / { target: 場の札id }（めくった札の取り先） / { koikoi: true } / { stop: true } / { resign: true }
import { shuffle, pickOptions, randInt } from './util.js';

export const id = 'koikoi';
export const title = '花札（こいこい）';
export const sideNames = ['先手', '後手'];
export const CPU = true;
export const logTitle = 'ログ';
export const OPTIONS = [{ key: 'months', label: '月数', values: [6, 3, 12], names: ['6か月', '3か月', '12か月'] }];
const END_MS = 5000;

export const normalizeOptions = (o) => pickOptions(o, OPTIONS, true);
export const variantName = (o) => { const x = normalizeOptions(o); return `${x.months}か月${x.cpu ? '・CPU対戦' : ''}`; };

// 札: id = (月-1)*4 + k
export const MONTHS = ['松', '梅', '桜', '藤', '菖蒲', '牡丹', '萩', '芒', '菊', '紅葉', '柳', '桐'];
const T = (type, name, extra = {}) => ({ type, name, ...extra });
const MONTH_CARDS = [
  [T('hikari', '松に鶴'), T('tan', '松に赤短', { tan: 'aka' }), T('kasu', '松'), T('kasu', '松')],
  [T('tane', '梅に鶯'), T('tan', '梅に赤短', { tan: 'aka' }), T('kasu', '梅'), T('kasu', '梅')],
  [T('hikari', '桜に幕'), T('tan', '桜に赤短', { tan: 'aka' }), T('kasu', '桜'), T('kasu', '桜')],
  [T('tane', '藤に不如帰'), T('tan', '藤に短冊'), T('kasu', '藤'), T('kasu', '藤')],
  [T('tane', '菖蒲に八橋'), T('tan', '菖蒲に短冊'), T('kasu', '菖蒲'), T('kasu', '菖蒲')],
  [T('tane', '牡丹に蝶'), T('tan', '牡丹に青短', { tan: 'ao' }), T('kasu', '牡丹'), T('kasu', '牡丹')],
  [T('tane', '萩に猪'), T('tan', '萩に短冊'), T('kasu', '萩'), T('kasu', '萩')],
  [T('hikari', '芒に月'), T('tane', '芒に雁'), T('kasu', '芒'), T('kasu', '芒')],
  [T('tane', '菊に盃'), T('tan', '菊に青短', { tan: 'ao' }), T('kasu', '菊'), T('kasu', '菊')],
  [T('tane', '紅葉に鹿'), T('tan', '紅葉に青短', { tan: 'ao' }), T('kasu', '紅葉'), T('kasu', '紅葉')],
  [T('hikari', '柳に小野道風'), T('tane', '柳に燕'), T('tan', '柳に短冊'), T('kasu', '柳')],
  [T('hikari', '桐に鳳凰'), T('kasu', '桐'), T('kasu', '桐'), T('kasu', '桐')],
];
export const CARDS = MONTH_CARDS.flatMap((list, m) => list.map((c, k) => ({ id: m * 4 + k, month: m + 1, ...c })));
export const monthOf = (id) => Math.floor(id / 4) + 1;
const ID = { crane: 0, maku: 8, moon: 28, rain: 40, houou: 44, butterfly: 20, boar: 24, sake: 32, deer: 36 };

// 役と点数
export function yaku(ids) {
  const cards = ids.map((i) => CARDS[i]);
  const has = (i) => ids.includes(i);
  const hik = cards.filter((c) => c.type === 'hikari').length;
  const out = [];
  if (hik === 5) out.push(['五光', 10]);
  else if (hik === 4) out.push(has(ID.rain) ? ['雨四光', 7] : ['四光', 8]);
  else if (hik === 3 && !has(ID.rain)) out.push(['三光', 5]);
  if (has(ID.boar) && has(ID.deer) && has(ID.butterfly)) out.push(['猪鹿蝶', 5]);
  if (has(ID.maku) && has(ID.sake)) out.push(['花見で一杯', 5]);
  if (has(ID.moon) && has(ID.sake)) out.push(['月見で一杯', 5]);
  const aka = cards.filter((c) => c.tan === 'aka').length, ao = cards.filter((c) => c.tan === 'ao').length;
  if (aka === 3 && ao === 3) out.push(['赤短・青短', 10]);
  else { if (aka === 3) out.push(['赤短', 5]); if (ao === 3) out.push(['青短', 5]); }
  const tane = cards.filter((c) => c.type === 'tane').length;
  const tan = cards.filter((c) => c.type === 'tan').length;
  const kasu = cards.filter((c) => c.type === 'kasu').length + (has(ID.sake) ? 1 : 0); // 盃はカスにも数える
  if (tane >= 5) out.push(['タネ', tane - 4]);
  if (tan >= 5) out.push(['タン', tan - 4]);
  if (kasu >= 10) out.push(['カス', kasu - 9]);
  return out;
}
export const yakuPoints = (ids) => yaku(ids).reduce((a, [, p]) => a + p, 0);

export function init(options, _players, rng) {
  const opts = normalizeOptions(options);
  const s = { options: opts, month: 0, oya: 0, scores: [0, 0], monthLog: [], result: null, history: [] };
  return deal(s, rng);
}

function deal(s, rng) {
  s.month += 1;
  for (let tries = 0; tries < 50; tries++) {
    const deck = shuffle(CARDS.map((c) => c.id), rng);
    const hands = [deck.splice(0, 8), deck.splice(0, 8)];
    const field = deck.splice(0, 8);
    const fm = {};
    for (const id of field) fm[monthOf(id)] = (fm[monthOf(id)] || 0) + 1;
    if (Object.values(fm).some((n) => n === 4)) continue; // 場に同じ月4枚は配り直し
    Object.assign(s, { hands, field, deck, captured: [[], []], turn: s.oya, phase: 'play', drawn: null, koikoi: [false, false], best: [0, 0], tickAt: null, last: null, monthResult: null });
    break;
  }
  s.history = [`${s.month}月目（${MONTHS[(s.month - 1) % 12]}）・親は${sideNames[s.oya]}`];
  // 手役
  for (const p of [s.oya, 1 - s.oya]) {
    const cnt = {};
    for (const id of s.hands[p]) cnt[monthOf(id)] = (cnt[monthOf(id)] || 0) + 1;
    const v = Object.values(cnt);
    const name = v.includes(4) ? '手四' : v.length === 4 && v.every((n) => n === 2) ? 'くっつき' : null;
    if (name) { endMonth(s, p, 6, [[name, 6]]); break; }
  }
  return s;
}

function endMonth(s, winner, points, list) {
  if (winner != null) s.scores[winner] += points;
  s.monthLog = [...s.monthLog, { month: s.month, winner, points, yaku: list }];
  s.history.push(winner == null ? 'この月は引き分け（点なし）' : `${sideNames[winner]} ${list.map(([n]) => n).join('・')} ${points}点`);
  s.phase = 'monthEnd';
  s.monthResult = { winner, points, yaku: list };
  s.tickAt = Date.now() + END_MS;
  if (winner != null) s.oya = winner;
}

export function viewFor(s, seat) {
  return {
    ...s, deck: null, deckCount: s.deck ? s.deck.length : 0,
    hands: s.hands.map((h, i) => (i === seat || s.result || seat < 0 || s.phase === 'monthEnd' ? h : null)),
    handCounts: s.hands.map((h) => h.length),
  };
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `${s.scores[seat]}点`;
export function phaseText(s, you) {
  if (s.phase === 'monthEnd') return s.month >= s.options.months ? '最後の月が終わりました' : 'この月はおしまい。もうすぐ次の月…';
  if (s.result || you !== s.turn) return null;
  if (s.phase === 'play') return '手札から1枚出してください';
  if (s.phase === 'drawPick') return 'めくった札で取る札を、場から選んでください';
  if (s.phase === 'koikoi') return `役ができた！（${yakuPoints(s.captured[you])}点）こいこいしますか？`;
  return null;
}

const matchesOf = (field, id) => field.filter((f) => monthOf(f) === monthOf(id));
const clone = (s) => ({ ...s, hands: s.hands.map((h) => h.slice()), field: s.field.slice(), deck: s.deck.slice(), captured: s.captured.map((c) => c.slice()), koikoi: s.koikoi.slice(), best: s.best.slice(), scores: s.scores.slice(), history: s.history.slice() });
const nm = (id) => CARDS[id].name;

// 札 id を場に出す・取る。取れた札を返す。2枚候補で target がなければ null（選んでもらう）
function place(ns, seat, id, target) {
  const m = matchesOf(ns.field, id);
  let take = [];
  if (m.length === 1) take = m;
  else if (m.length === 3) take = m;
  else if (m.length === 2) {
    if (!m.includes(target)) return null;
    take = [target];
  }
  if (!take.length) { ns.field.push(id); return []; }
  ns.field = ns.field.filter((f) => !take.includes(f));
  ns.captured[seat].push(id, ...take);
  return [id, ...take];
}

// 山から1枚めくる
function drawStep(ns, seat) {
  const id = ns.deck.shift();
  ns.drawn = id;
  const m = matchesOf(ns.field, id);
  if (m.length === 2) { ns.phase = 'drawPick'; ns.history.push(`${sideNames[seat]} 山から${nm(id)}（取る札を選ぶ）`); return; }
  const got = place(ns, seat, id);
  ns.history.push(`${sideNames[seat]} 山から${nm(id)}${got.length ? ` → ${got.slice(1).map(nm).join('・')}を取った` : ''}`);
  ns.last = { ...ns.last, drawGot: got };
  afterTurn(ns, seat);
}

function afterTurn(ns, seat) {
  ns.drawn = null;
  const pts = yakuPoints(ns.captured[seat]);
  if (pts > ns.best[seat]) {
    // 手札がもうなければ、こいこいはできないので勝負
    if (!ns.hands[seat].length) return stop(ns, seat);
    ns.phase = 'koikoi';
    return;
  }
  nextTurn(ns, seat);
}

function nextTurn(ns, seat) {
  ns.phase = 'play';
  if (!ns.hands[0].length && !ns.hands[1].length) return endMonth(ns, null, 0, []);
  ns.turn = 1 - seat;
  if (!ns.hands[ns.turn].length) ns.turn = seat;
}

function stop(ns, seat) {
  const list = yaku(ns.captured[seat]);
  let pts = list.reduce((a, [, p]) => a + p, 0);
  const notes = [...list];
  if (pts >= 7) { pts *= 2; notes.push(['7点以上で2倍', 0]); }
  if (ns.koikoi[1 - seat]) { pts *= 2; notes.push(['相手のこいこい返しで2倍', 0]); }
  endMonth(ns, seat, pts, notes);
}

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (mv.resign) { const ns = clone(s); ns.result = { winner: 1 - seat, reason: '投了' }; ns.tickAt = null; return ns; }
  if (s.turn !== seat) throw new Error('相手の番です');
  const ns = clone(s);
  if (s.phase === 'play') {
    const id = mv.play;
    if (!ns.hands[seat].includes(id)) throw new Error('手札の札を選んでください');
    const m = matchesOf(ns.field, id);
    if (m.length === 2 && !m.includes(mv.target)) throw new Error('取る札を場から選んでください');
    ns.hands[seat] = ns.hands[seat].filter((x) => x !== id);
    const got = place(ns, seat, id, mv.target);
    ns.last = { by: seat, played: id, got, drawGot: null };
    ns.history.push(`${sideNames[seat]} ${nm(id)}${got.length ? ` → ${got.slice(1).map(nm).join('・')}を取った` : 'を場に置いた'}`);
    drawStep(ns, seat);
    return ns;
  }
  if (s.phase === 'drawPick') {
    const m = matchesOf(ns.field, ns.drawn);
    if (!m.includes(mv.target)) throw new Error('めくった札と同じ月の札を選んでください');
    const got = place(ns, seat, ns.drawn, mv.target);
    ns.last = { ...ns.last, drawGot: got };
    ns.history.push(`${sideNames[seat]} ${nm(got[1])}を取った`);
    afterTurn(ns, seat);
    return ns;
  }
  if (s.phase === 'koikoi') {
    if (mv.stop) { stop(ns, seat); return ns; }
    if (mv.koikoi) {
      ns.koikoi[seat] = true;
      ns.best[seat] = yakuPoints(ns.captured[seat]);
      ns.history.push(`${sideNames[seat]} こいこい！`);
      ns.last = { ...ns.last, koikoi: seat };
      nextTurn(ns, seat);
      return ns;
    }
    throw new Error('こいこいか勝負を選んでください');
  }
  throw new Error('少し待ってください');
}

export function tick(s, rng) {
  if (s.phase !== 'monthEnd' || s.result) return { ...s, tickAt: null };
  const ns = clone(s);
  if (ns.month >= ns.options.months) {
    ns.phase = 'end';
    ns.tickAt = null;
    const [a, b] = ns.scores;
    ns.result = a === b ? { winner: null, reason: `${a}対${b}` } : { winner: a > b ? 0 : 1, reason: `${Math.max(a, b)}点対${Math.min(a, b)}点` };
    return ns;
  }
  return deal(ns, rng);
}

// ---------- CPU ----------
const VALUE = (id) => {
  const c = CARDS[id];
  if (c.type === 'hikari') return 20;
  if ([ID.boar, ID.deer, ID.butterfly, ID.sake].includes(id)) return 12;
  if (c.tan === 'aka' || c.tan === 'ao') return 9;
  return c.type === 'tane' ? 6 : c.type === 'tan' ? 5 : 1;
};
function gainOf(s, seat, ids) {
  return ids.reduce((a, i) => a + VALUE(i), 0) + (yakuPoints([...s.captured[seat], ...ids]) - yakuPoints(s.captured[seat])) * 15;
}
export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat) return null;
  if (s.phase === 'koikoi') {
    const pts = yakuPoints(s.captured[seat]);
    const oppNear = yakuPoints(s.captured[1 - seat]) > 0 || s.captured[1 - seat].length >= 8;
    return pts >= 4 || s.hands[seat].length <= 3 || oppNear || s.koikoi[1 - seat] ? { stop: true } : { koikoi: true };
  }
  if (s.phase === 'drawPick') {
    const m = matchesOf(s.field, s.drawn).sort((a, b) => VALUE(b) - VALUE(a));
    return { target: m[0] };
  }
  if (s.phase !== 'play') return null;
  let best = null, bv = -Infinity;
  for (const id of s.hands[seat]) {
    const m = matchesOf(s.field, id);
    if (m.length) {
      const opts = m.length === 2 ? m.map((t) => [t]) : [m];
      for (const take of opts) {
        const v = gainOf(s, seat, [id, ...take]) + 5;
        if (v > bv) { bv = v; best = { play: id, target: m.length === 2 ? take[0] : undefined }; }
      }
    } else {
      // 捨てる札: 価値が低く、相手に取られても痛くないもの
      const v = -VALUE(id) * 1.5 + (rng ? (rng(100) - 1) / 100 : Math.random());
      if (v > bv) { bv = v; best = { play: id }; }
    }
  }
  return best;
}
