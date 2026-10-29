// チンチロ（チンチロリン）（サーバーとブラウザで共通）
// 2〜6人。全員 1000 チップから（点数だけで、お金は使わない）。親を順番に回して、子は親と勝負する。
// 1回の流れ: 子がチップを賭ける（100枚ずつ好きな額）→ 子が1人ずつサイコロ3個をふる → 最後に親がふる → 子1人ずつ親と比べる。
// ふるのは1人3回まで。役が出ても、3回目まではふり直してよい（「この役で決める」か「ふり直す」）。役が出なければふり直す。
// 役（強い順）: ピンゾロ（1・1・1、5倍）> ゾロ目（同じ目3つ、3倍）> シゴロ（4・5・6、2倍）> 目（2つそろった残りの1つ。6が一番強い）
//   > 目なし（3回ふっても役が出ない）> ヒフミ（1・2・3）。
// 比べ方: 強い役のほうが勝ち。勝った役がピンゾロ・ゾロ目・シゴロならその倍率、負けた側がヒフミなら2倍（大きいほう）。
//   同じ強さなら引き分け。決めた周（全員が親を何回するか）が終わったら、チップが一番多い人の勝ち。
// 手: { bet: 数 } / { roll: true } / { stand: true } 今の役で決める / { resign: true }
import { pickOptions, seatNames, label, randInt } from './util.js';

export const id = 'chinchiro';
export const title = 'チンチロ';
export const minPlayers = 2;
export const maxPlayers = 6;
export const sideNames = seatNames(6);
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const START_CHIPS = 1000;
export const BET_STEP = 100; // 賭けは100枚ずつ（持っているのが100枚より少なければ全部）
export const MAX_TRIES = 3;
export const OPTIONS = [{ key: 'laps', label: '親の回数', values: [1, 2, 3], names: ['1人1回', '1人2回', '1人3回'] }];
const RESULT_MS = 6000;
export const normalizeOptions = (o) => pickOptions(o, OPTIONS);
export const variantName = (o) => `親${normalizeOptions(o).laps}周`;

// 役。rank が大きいほど強い。mult は勝ったときの倍率。final: これ以上ふらない
export function role(dice, tries = 3) {
  const d = dice.slice().sort((a, b) => a - b);
  const [a, b, c] = d;
  if (a === 1 && b === 1 && c === 1) return { kind: 'pinzoro', rank: 100, mult: 5, name: 'ピンゾロ', final: true };
  if (a === b && b === c) return { kind: 'zoro', rank: 90 + a, mult: 3, name: `${a}のゾロ目`, final: true };
  if (a === 4 && b === 5 && c === 6) return { kind: 'shigoro', rank: 80, mult: 2, name: 'シゴロ', final: true };
  if (a === 1 && b === 2 && c === 3) return { kind: 'hifumi', rank: -2, mult: 2, name: 'ヒフミ', final: true };
  if (a === b || b === c) { const me = a === b ? c : a; return { kind: 'me', rank: me, mult: 1, name: `${me}の目`, final: true }; }
  return tries >= 3 ? { kind: 'none', rank: -1, mult: 1, name: '目なし', final: true } : { kind: 'none', rank: -1, mult: 1, name: '役なし', final: false };
}

// 子の役 c と親の役 p を比べる。子から見たチップの増減の倍率（勝ち +、負け −、引き分け 0）
export function compare(c, p) {
  if (c.rank === p.rank) return 0;
  const childWins = c.rank > p.rank;
  const win = childWins ? c : p, lose = childWins ? p : c;
  const mult = Math.max(['pinzoro', 'zoro', 'shigoro'].includes(win.kind) ? win.mult : 1, lose.kind === 'hifumi' ? 2 : 1);
  return childWins ? mult : -mult;
}

export function init(options, players = 2) {
  const s = {
    players, options: normalizeOptions(options), chips: Array(players).fill(START_CHIPS), out: Array(players).fill(false),
    hand: 0, parent: -1, phase: 'bet', bets: Array(players).fill(null), rolls: Array(players).fill(null), order: [], turn: 0,
    outcome: null, tickAt: null, last: null, result: null, history: [],
  };
  return startHand(s);
}

const canPlay = (s, p) => !s.out[p] && s.chips[p] > 0;
const totalHands = (s) => s.players * s.options.laps;

function startHand(s) {
  s.hand += 1;
  // 次の親（チップがある人）
  let p = s.parent;
  for (let k = 0; k < s.players; k++) { p = (p + 1) % s.players; if (canPlay(s, p)) break; }
  s.parent = p;
  s.phase = 'bet';
  s.bets = Array(s.players).fill(null);
  s.rolls = Array(s.players).fill(null);
  s.order = [];
  s.turn = p;
  s.outcome = null;
  s.tickAt = null;
  s.last = null;
  s.history = [`第${s.hand}/${totalHands(s)}回・親は${label(p)}`];
  return s;
}

// 子（親の次の人から順に）
const children = (s) => {
  const out = [];
  for (let k = 1; k < s.players; k++) { const p = (s.parent + k) % s.players; if (canPlay(s, p)) out.push(p); }
  return out;
};

export const canActOutOfTurn = (s) => s.phase === 'bet';
export const scoreOf = (s, seat) => `${s.chips[seat]}枚`;
export function phaseText(s, you) {
  if (s.result || you < 0) return null;
  if (s.phase === 'bet') return you === s.parent ? 'あなたが親です。子が賭けるのを待っています…' : s.bets[you] == null && canPlay(s, you) ? '賭けるチップを選んでください' : 'ほかの人を待っています…';
  if (s.phase === 'roll') {
    if (you !== s.turn) return `${label(s.turn)}（${s.turn === s.parent ? '親' : '子'}）がふっています`;
    const r = s.rolls[you];
    if (r && r.role.final) return `${r.role.name}！ この役で決めるか、ふり直すか（あと${MAX_TRIES - r.tries}回）`;
    return you === s.parent ? '最後に親のあなたがふります。サイコロをふってください' : 'サイコロをふってください（あとで親と比べます）';
  }
  if (s.phase === 'result') return 'この回の結果';
  return null;
}

function pay(ns, from, to, n) {
  ns.chips[from] -= n;
  ns.chips[to] += n;
}

// 親がふり終わったら、子1人ずつ比べてチップをやりとりする
function settle(ns) {
  const par = ns.rolls[ns.parent] ? ns.rolls[ns.parent].role : null;
  ns.outcome = Array(ns.players).fill(null);
  for (const p of ns.order) {
    if (ns.out[p] || !ns.rolls[p] || !par) continue;
    const c = ns.rolls[p].role;
    const k = compare(c, par);
    const n = ns.bets[p] * Math.abs(k);
    if (k > 0) pay(ns, ns.parent, p, n); else if (k < 0) pay(ns, p, ns.parent, n);
    const text = k > 0 ? `${c.name}で勝ち` : k < 0 ? `${c.name}で負け` : `${c.name}で引き分け`;
    ns.outcome[p] = { gain: k > 0 ? n : -n, text, mult: Math.abs(k) };
  }
  finishHand(ns);
}

function finishHand(ns) {
  ns.phase = 'result';
  ns.tickAt = Date.now() + RESULT_MS;
  const par = ns.rolls[ns.parent];
  if (par) ns.history.push(`親 ${label(ns.parent)} は ${par.role.name}`);
  for (const [p, o] of (ns.outcome || []).entries()) if (o) ns.history.push(`${label(p)} ${o.text}（${o.gain >= 0 ? '+' : ''}${o.gain}）`);
}

function finishGame(ns) {
  const alive = [...Array(ns.players).keys()].filter((p) => !ns.out[p]);
  const best = Math.max(...alive.map((p) => ns.chips[p]));
  const top = alive.filter((p) => ns.chips[p] === best);
  ns.phase = 'end';
  ns.tickAt = null;
  ns.result = top.length === 1 ? { winner: top[0], reason: `チップ ${best}枚` } : { winner: null, reason: `チップ ${best}枚で同点` };
}

const clone = (s) => ({ ...s, chips: s.chips.slice(), out: s.out.slice(), bets: s.bets.slice(), rolls: s.rolls.map((r) => r && { ...r, dice: r.dice.slice() }), order: s.order.slice(), history: s.history.slice() });

// 全員が賭けたら、子から順にふる（最後に親）
function maybeStartRolling(ns) {
  if (ns.phase !== 'bet') return;
  const kids = children(ns);
  if (!kids.length) { finishGame(ns); return; }
  if (kids.every((p) => ns.bets[p] != null)) {
    ns.order = kids;
    ns.phase = 'roll';
    ns.turn = kids[0];
    ns.tickAt = null;
  }
}

// 次にふる人（子が全員終わったら親、親も終わったら比べる）
function advance(ns, from) {
  const i = ns.order.indexOf(from);
  const rest = ns.order.slice(i + 1).filter((p) => !ns.out[p]);
  if (from !== ns.parent && rest.length) { ns.turn = rest[0]; return; }
  if (from !== ns.parent) { ns.turn = ns.parent; return; }
  settle(ns);
}

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    if (s.out[seat]) throw new Error('抜けています');
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    const alive = [...Array(ns.players).keys()].filter((p) => canPlay(ns, p));
    if (alive.length <= 1) { finishGame(ns); return ns; }
    if (seat === s.parent && s.phase !== 'result') { ns.outcome = null; ns.rolls = ns.rolls.map(() => null); finishHand(ns); ns.history.push('親が抜けたので、この回はなし'); return ns; }
    if (s.phase === 'bet') maybeStartRolling(ns);
    else if (s.phase === 'roll' && s.turn === seat) advance(ns, seat);
    return ns;
  }
  if (s.out[seat]) throw new Error('抜けています');
  if (mv.bet != null) {
    if (s.phase !== 'bet' || seat === s.parent || s.bets[seat] != null) throw new Error('今は賭けられません');
    const bet = Math.floor(Number(mv.bet));
    if (!(bet >= 1) || bet > s.chips[seat]) throw new Error('持っているチップより多くは賭けられません');
    if (bet % BET_STEP !== 0 && bet !== s.chips[seat]) throw new Error(`賭けは${BET_STEP}枚ずつです`);
    ns.bets[seat] = bet;
    ns.history.push(`${label(seat)} ${bet}枚賭けた`);
    maybeStartRolling(ns);
    return ns;
  }
  if (mv.stand) {
    if (s.phase !== 'roll' || s.turn !== seat) throw new Error('あなたの番ではありません');
    const cur = s.rolls[seat];
    if (!cur || !cur.role.final) throw new Error('まだ役が出ていません');
    ns.history.push(`${label(seat)} は ${cur.role.name} で決めた`);
    advance(ns, seat);
    return ns;
  }
  if (mv.roll) {
    if (s.phase !== 'roll' || s.turn !== seat) throw new Error('あなたの番ではありません');
    const prev = s.rolls[seat];
    if (prev && prev.tries >= MAX_TRIES) throw new Error(`ふれるのは${MAX_TRIES}回までです`);
    const tries = (prev ? prev.tries : 0) + 1;
    const dice = [0, 0, 0].map(() => randInt(rng, 6) + 1);
    const r = role(dice, tries);
    ns.rolls[seat] = { dice, tries, role: r };
    ns.last = { by: seat, dice, tries, at: Date.now(), role: r };
    ns.history.push(`${label(seat)}（${seat === s.parent ? '親' : '子'}） ${dice.join('・')} → ${r.name}${tries < MAX_TRIES ? `（${tries}回目）` : ''}`);
    // 3回目なら、そこで決まり。それより前に役が出たら、決めるかふり直すかを選ぶ
    if (tries >= MAX_TRIES) advance(ns, seat);
    return ns;
  }
  throw new Error('不明な操作です');
}

export function tick(s) {
  if (s.phase !== 'result' || s.result) return { ...s, tickAt: null };
  const ns = clone(s);
  const alive = [...Array(ns.players).keys()].filter((p) => canPlay(ns, p));
  if (ns.hand >= totalHands(ns) || alive.length <= 1) { finishGame(ns); return ns; }
  return startHand(ns);
}

// ---------- CPU ----------
// 賭けは持っているチップの1割くらい（100枚ずつ）。4の目より強い役が出たら決め、弱ければふり直す
export function aiMove(s, seat) {
  if (s.result || s.out[seat]) return null;
  if (s.phase === 'bet') {
    if (seat === s.parent || s.bets[seat] != null || !canPlay(s, seat)) return null;
    const chips = s.chips[seat];
    if (chips < BET_STEP) return { bet: chips };
    return { bet: Math.max(BET_STEP, Math.min(Math.floor(chips / BET_STEP) * BET_STEP, Math.round(chips * 0.12 / BET_STEP) * BET_STEP)) };
  }
  if (s.phase === 'roll' && s.turn === seat) {
    const r = s.rolls[seat];
    if (r && r.role.final && (r.role.rank >= 4 || r.tries >= MAX_TRIES)) return { stand: true };
    return { roll: true };
  }
  return null;
}
// CPU は、前の人の出目が見えるよう、ゆっくりふる
export const botDelay = (s) => (s.phase === 'roll' ? 2200 : 700);
