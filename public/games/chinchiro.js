// チンチロ（チンチロリン）（サーバーとブラウザで共通）
// 2〜6人。全員 1000 チップから（点数だけで、お金は使わない）。親を順番に回して、子は親と勝負する。
// 1回の流れ: 子がチップを賭ける → 親がサイコロ3個をふる（役が出るまで3回まで）→ 親の役によっては、子もふって親と比べる。
// 役（強い順）: ピンゾロ（1・1・1、5倍）> ゾロ目（同じ目3つ、3倍）> シゴロ（4・5・6、2倍）> 目（2つそろった残りの1つ。6が一番強い）
//   ヒフミ（1・2・3）は2倍払い、3回ふって役が出なければ「目なし」（1倍払い）。
// 親がピンゾロ・ゾロ目・シゴロ・6の目なら子全員から取る。ヒフミ・1の目・目なしなら子全員に払う。2〜5の目なら子が1人ずつふって勝負。
// 目どうしは大きいほうが勝ち、同じなら引き分け。決めた周（全員が親を何回するか）が終わったら、チップが一番多い人の勝ち。
// 手: { bet: 数 } / { roll: true } / { resign: true }
import { pickOptions, seatNames, label, randInt } from './util.js';

export const id = 'chinchiro';
export const title = 'チンチロ';
export const minPlayers = 2;
export const maxPlayers = 6;
export const sideNames = seatNames(6);
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const START_CHIPS = 1000;
export const BETS = [50, 100, 200, 500];
export const OPTIONS = [{ key: 'laps', label: '親の回数', values: [1, 2, 3], names: ['1人1回', '1人2回', '1人3回'] }];
const RESULT_MS = 4000;
export const normalizeOptions = (o) => pickOptions(o, OPTIONS);
export const variantName = (o) => `親${normalizeOptions(o).laps}周`;

// 役。rank が大きいほど強い。mult は勝ち負けの倍率。final: これ以上ふらない
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
  s.history = [`第${s.hand}/${totalHands(s)}回・親は${label(p)}`];
  return s;
}

const children = (s) => [...Array(s.players).keys()].filter((p) => p !== s.parent && canPlay(s, p));

export const canActOutOfTurn = (s) => s.phase === 'bet';
export const scoreOf = (s, seat) => `${s.chips[seat]}枚`;
export function phaseText(s, you) {
  if (s.result || you < 0) return null;
  if (s.phase === 'bet') return you === s.parent ? 'あなたが親です。子が賭けるのを待っています…' : s.bets[you] == null && canPlay(s, you) ? '賭けるチップを選んでください' : 'ほかの人を待っています…';
  if (s.phase === 'roll') return you === s.turn ? 'サイコロをふってください' : `${label(s.turn)} がふっています`;
  if (s.phase === 'result') return 'この回の結果';
  return null;
}

function pay(ns, from, to, n) {
  ns.chips[from] -= n;
  ns.chips[to] += n;
}

// 親の役が決まったとき
function afterParent(ns) {
  const r = ns.rolls[ns.parent].role;
  const kids = children(ns).filter((p) => ns.bets[p]);
  ns.outcome = Array(ns.players).fill(null);
  const settleAll = (parentWins, mult, why) => {
    for (const p of kids) {
      const n = ns.bets[p] * mult;
      if (parentWins) pay(ns, p, ns.parent, n); else pay(ns, ns.parent, p, n);
      ns.outcome[p] = { gain: parentWins ? -n : n, text: why };
    }
    finishHand(ns);
  };
  if (r.kind === 'pinzoro' || r.kind === 'zoro' || r.kind === 'shigoro') return settleAll(true, r.mult, `親の${r.name}`);
  if (r.kind === 'me' && r.rank === 6) return settleAll(true, 1, '親の6の目');
  if (r.kind === 'hifumi') return settleAll(false, 2, '親のヒフミ');
  if (r.kind === 'none') return settleAll(false, 1, '親の目なし');
  if (r.kind === 'me' && r.rank === 1) return settleAll(false, 1, '親の1の目');
  // 2〜5の目: 子が1人ずつふる
  if (!kids.length) return finishHand(ns);
  ns.order = kids;
  ns.turn = kids[0];
}

// 子の役が決まったとき、親と比べる
function settleChild(ns, p) {
  const c = ns.rolls[p].role, par = ns.rolls[ns.parent].role;
  const bet = ns.bets[p];
  let gain, text;
  if (c.kind === 'pinzoro' || c.kind === 'zoro' || c.kind === 'shigoro') { gain = bet * c.mult; text = c.name; }
  else if (c.kind === 'hifumi') { gain = -bet * 2; text = 'ヒフミ'; }
  else if (c.kind === 'none') { gain = -bet; text = '目なし'; }
  else if (c.rank > par.rank) { gain = bet; text = `${c.name}で勝ち`; }
  else if (c.rank < par.rank) { gain = -bet; text = `${c.name}で負け`; }
  else { gain = 0; text = `${c.name}で引き分け`; }
  if (gain > 0) pay(ns, ns.parent, p, gain); else if (gain < 0) pay(ns, p, ns.parent, -gain);
  ns.outcome[p] = { gain, text };
  const i = ns.order.indexOf(p);
  if (i + 1 < ns.order.length) ns.turn = ns.order[i + 1];
  else finishHand(ns);
}

function finishHand(ns) {
  ns.phase = 'result';
  ns.tickAt = Date.now() + RESULT_MS;
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

function maybeStartRolling(ns) {
  if (ns.phase !== 'bet') return;
  const kids = children(ns);
  if (!kids.length) { finishGame(ns); return; }
  if (kids.every((p) => ns.bets[p] != null)) { ns.phase = 'roll'; ns.turn = ns.parent; ns.tickAt = null; }
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
    if (seat === s.parent && s.phase !== 'result') { ns.outcome = null; finishHand(ns); return ns; } // 親が抜けたら、この回はなし
    if (s.phase === 'bet') maybeStartRolling(ns);
    else if (s.phase === 'roll' && s.turn === seat) {
      ns.outcome = ns.outcome || Array(ns.players).fill(null);
      const i = ns.order.indexOf(seat);
      if (i >= 0 && i + 1 < ns.order.length) ns.turn = ns.order[i + 1]; else finishHand(ns);
    }
    return ns;
  }
  if (s.out[seat]) throw new Error('抜けています');
  if (mv.bet != null) {
    if (s.phase !== 'bet' || seat === s.parent || s.bets[seat] != null) throw new Error('今は賭けられません');
    const bet = Math.floor(Number(mv.bet));
    if (!(bet >= 1) || bet > s.chips[seat]) throw new Error('持っているチップより多くは賭けられません');
    ns.bets[seat] = bet;
    ns.history.push(`${label(seat)} ${bet}枚賭けた`);
    maybeStartRolling(ns);
    return ns;
  }
  if (mv.roll) {
    if (s.phase !== 'roll' || s.turn !== seat) throw new Error('あなたの番ではありません');
    const prev = s.rolls[seat];
    const tries = (prev ? prev.tries : 0) + 1;
    const dice = [0, 0, 0].map(() => randInt(rng, 6) + 1);
    const r = role(dice, tries);
    ns.rolls[seat] = { dice, tries, role: r };
    ns.last = { by: seat, dice, tries, at: Date.now() };
    ns.history.push(`${label(seat)} ${dice.join('・')} → ${r.name}${r.final ? '' : `（${tries}回目）`}`);
    if (!r.final) return ns;
    if (seat === s.parent) afterParent(ns);
    else settleChild(ns, seat);
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
// 賭けは持っているチップの1割くらい。ふる番ならふる
export function aiMove(s, seat) {
  if (s.result || s.out[seat]) return null;
  if (s.phase === 'bet') {
    if (seat === s.parent || s.bets[seat] != null || !canPlay(s, seat)) return null;
    const want = BETS.filter((b) => b <= Math.max(50, s.chips[seat] * 0.12));
    return { bet: Math.min(s.chips[seat], want.length ? want[want.length - 1] : s.chips[seat]) };
  }
  if (s.phase === 'roll' && s.turn === seat) return { roll: true };
  return null;
}
export const botDelay = 900;
