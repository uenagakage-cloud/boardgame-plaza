// バックギャモンのルール（サーバーとブラウザで共通）
// pts[1..24] は各ポイントの駒数（正 = プレイヤー0、負 = プレイヤー1）。
// プレイヤー0 は 24 → 1 へ進み 1〜6 がインナーボード。プレイヤー1 は 1 → 24 へ進み 19〜24 がインナーボード。
// 手: { roll: true } ダイスを振る（ダイスはサーバーが振る） / { from: 点 | 'bar', to: 点 | 'off' } 駒を1つ動かす
// ダイスは使える限り使わなければならず、片方しか使えないときは大きい目を優先する。ダブリングキューブはなし。
export const id = 'backgammon';
export const title = 'バックギャモン';
export const sideNames = ['白', '黒'];

const sign = (p) => (p === 0 ? 1 : -1);
const countOf = (v, p) => Math.max(v * sign(p), 0);
const inHome = (i, p) => (p === 0 ? i <= 6 : i >= 19);
// 表記はそれぞれのプレイヤーから見た番号（自分のインナーボードが 1〜6）
const label = (i, p) => (i === 'bar' ? 'バー' : i === 'off' ? '上がり' : String(p === 0 ? i : 25 - i));

export function init() {
  const pts = Array(26).fill(0);
  pts[24] = 2; pts[13] = 5; pts[8] = 3; pts[6] = 5;
  pts[1] = -2; pts[12] = -5; pts[17] = -3; pts[19] = -5;
  return {
    pts, bar: [0, 0], off: [0, 0], turn: 0, phase: 'roll',
    dice: [], rolled: null, lastMove: null, result: null, history: [],
  };
}

function allHome(s, p) {
  if (s.bar[p]) return false;
  for (let i = 1; i <= 24; i++) if (countOf(s.pts[i], p) && !inHome(i, p)) return false;
  return true;
}

const blocked = (s, p, t) => countOf(s.pts[t], 1 - p) >= 2;

// 自分のインナーボードで、i より奥に駒が残っていないか（大きい目でのベアオフ用）
function noFurther(s, p, i) {
  if (p === 0) { for (let j = i + 1; j <= 6; j++) if (countOf(s.pts[j], 0)) return false; }
  else { for (let j = 19; j < i; j++) if (countOf(s.pts[j], 1)) return false; }
  return true;
}

function stepsForDie(s, p, d) {
  const out = [];
  if (s.bar[p]) {
    const t = p === 0 ? 25 - d : d;
    if (!blocked(s, p, t)) out.push({ from: 'bar', to: t, die: d });
    return out;
  }
  const home = allHome(s, p), dir = -sign(p);
  for (let i = 1; i <= 24; i++) {
    if (!countOf(s.pts[i], p)) continue;
    const t = i + dir * d;
    if (t >= 1 && t <= 24) {
      if (!blocked(s, p, t)) out.push({ from: i, to: t, die: d });
    } else if (home && (t === 0 || t === 25 || noFurther(s, p, i))) {
      out.push({ from: i, to: 'off', die: d });
    }
  }
  return out;
}

function applyStep(s, p, st) {
  const pts = s.pts.slice(), bar = s.bar.slice(), off = s.off.slice();
  let hit = false;
  if (st.from === 'bar') bar[p]--; else pts[st.from] -= sign(p);
  if (st.to === 'off') off[p]++;
  else {
    if (pts[st.to] === -sign(p)) { pts[st.to] = 0; bar[1 - p]++; hit = true; }
    pts[st.to] += sign(p);
  }
  return { state: { ...s, pts, bar, off }, hit };
}

const without = (dice, d) => { const i = dice.indexOf(d); return dice.slice(0, i).concat(dice.slice(i + 1)); };
const distinct = (dice) => [...new Set(dice)];

// 残りのダイスで最大いくつ使えるか
function maxUsable(s, p, dice) {
  if (!dice.length) return 0;
  let best = 0;
  for (const d of distinct(dice)) {
    for (const st of stepsForDie(s, p, d)) {
      best = Math.max(best, 1 + maxUsable(applyStep(s, p, st).state, p, without(dice, d)));
      if (best === dice.length) return best;
    }
  }
  return best;
}

export function legalSteps(s) {
  if (s.result || s.phase !== 'move') return [];
  const p = s.turn, max = maxUsable(s, p, s.dice);
  if (!max) return [];
  let res = [];
  for (const d of distinct(s.dice)) {
    for (const st of stepsForDie(s, p, d)) {
      if (1 + maxUsable(applyStep(s, p, st).state, p, without(s.dice, d)) === max) res.push(st);
    }
  }
  // 片方の目しか使えない場合は大きい目を使う
  if (max === 1 && distinct(s.dice).length === 2) {
    const big = Math.max(...s.dice);
    if (res.some((x) => x.die === big)) res = res.filter((x) => x.die === big);
  }
  return res;
}

export function pips(s, p) {
  let n = s.bar[p] * 25;
  for (let i = 1; i <= 24; i++) n += countOf(s.pts[i], p) * (p === 0 ? i : 25 - i);
  return n;
}

export const scoreOf = (s, seat) => `ピップ ${pips(s, seat)}`;

export function phaseText(s, you) {
  if (!s.result && s.phase === 'roll' && you === s.turn) return 'あなたの番です：ダイスを振ってください';
  return null;
}

const mark = (p) => (p === 0 ? '○' : '●');

function endTurn(ns) {
  ns.turn = 1 - ns.turn;
  ns.phase = 'roll';
  ns.dice = [];
  return ns;
}

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('対局は終了しています');
  mv = mv || {};
  const p = s.turn;
  if (mv.roll) {
    if (s.phase !== 'roll') throw new Error('すでにダイスを振っています');
    const die = rng || (() => 1 + Math.floor(Math.random() * 6));
    const a = die(), b = die();
    const dice = a === b ? [a, a, a, a] : [a, b];
    const ns = { ...s, phase: 'move', dice, rolled: { by: p, dice }, history: [...s.history, `${mark(p)}${a}-${b}:`] };
    if (!legalSteps(ns).length) {
      ns.history[ns.history.length - 1] += ' 動かせないのでパス';
      return endTurn(ns);
    }
    return ns;
  }
  if (s.phase !== 'move') throw new Error('先にダイスを振ってください');
  const from = mv.from === 'bar' ? 'bar' : Number(mv.from);
  const to = mv.to === 'off' ? 'off' : Number(mv.to);
  const candidates = legalSteps(s).filter((x) => x.from === from && x.to === to);
  if (!candidates.length) throw new Error('その動かし方はできません');
  const st = candidates.reduce((a, b) => (b.die < a.die ? b : a)); // 同じ動きなら小さい目を使う
  const { state, hit } = applyStep(s, p, st);
  const history = s.history.slice();
  history[history.length - 1] += ` ${label(from, p)}/${label(to, p)}${hit ? '*' : ''}`;
  const ns = { ...state, dice: without(s.dice, st.die), lastMove: { from, to }, history };
  if (ns.off[p] === 15) {
    const q = 1 - p;
    let kind = 'シングル';
    if (ns.off[q] === 0) {
      let inWinnerHome = ns.bar[q] > 0;
      for (let i = 1; i <= 24; i++) if (countOf(ns.pts[i], q) && inHome(i, p)) inWinnerHome = true;
      kind = inWinnerHome ? 'バックギャモン' : 'ギャモン';
    }
    ns.result = { winner: p, reason: `${kind}勝ち` };
    return ns;
  }
  if (!ns.dice.length || !legalSteps(ns).length) return endTurn(ns);
  return ns;
}
