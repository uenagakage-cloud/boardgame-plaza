// ヨット（サーバーとブラウザで共通）
// 1〜4人。サイコロ5個を1回の番に3回までふれる（2回目からは、残したいサイコロを選んでふり直す）。
// ふり終わったら、点数表の空いている役を1つ選んで点を書く。12回で全部の役を埋めたら終わり。合計点が一番多い人の勝ち。
// 役: 1〜6（その目の合計）、ボーナス（1〜6の合計が63以上で+35）、チョイス（全部の合計）、フォーダイス（同じ目4つ以上で全部の合計）、
//     フルハウス（3つと2つで全部の合計）、S.ストレート（4つ続きで15）、B.ストレート（5つ続きで30）、ヨット（5つ同じで50）
// 手: { roll: true, hold: [5つの true/false] } / { score: 役 } / { resign: true }
import { seatNames, label, randInt } from './util.js';

export const id = 'yacht';
export const title = 'ヨット';
export const minPlayers = 1;
export const maxPlayers = 4;
export const sideNames = seatNames(4);
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'four', 'full', 'sstr', 'bstr', 'yacht'];
export const CAT_NAMES = { ones: 'エース（1）', twos: 'デュース（2）', threes: 'トレイ（3）', fours: 'フォー（4）', fives: 'ファイブ（5）', sixes: 'シックス（6）', choice: 'チョイス', four: 'フォーダイス', full: 'フルハウス', sstr: 'S.ストレート', bstr: 'B.ストレート', yacht: 'ヨット' };
export const UPPER = CATS.slice(0, 6);

export function scoreFor(cat, dice) {
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) cnt[d]++;
  const sum = dice.reduce((a, b) => a + b, 0);
  const has = (seq) => seq.every((v) => cnt[v]);
  switch (cat) {
    case 'ones': case 'twos': case 'threes': case 'fours': case 'fives': case 'sixes': { const v = UPPER.indexOf(cat) + 1; return cnt[v] * v; }
    case 'choice': return sum;
    case 'four': return cnt.some((c) => c >= 4) ? sum : 0;
    case 'full': return (cnt.includes(3) && cnt.includes(2)) || cnt.includes(5) ? sum : 0;
    case 'sstr': return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 15 : 0;
    case 'bstr': return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 30 : 0;
    case 'yacht': return cnt.includes(5) ? 50 : 0;
    default: return 0;
  }
}
export const upperSum = (sheet) => UPPER.reduce((a, c) => a + (sheet[c] || 0), 0);
export const bonusOf = (sheet) => (upperSum(sheet) >= 63 ? 35 : 0);
export const totalOf = (sheet) => CATS.reduce((a, c) => a + (sheet[c] || 0), 0) + bonusOf(sheet);

export function init(options, players = 1) {
  return { players, sheets: Array.from({ length: players }, () => ({})), dice: [1, 2, 3, 4, 5], held: Array(5).fill(false), rolls: 0, round: 1, turn: 0, out: Array(players).fill(false), last: null, result: null, history: [] };
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `${totalOf(s.sheets[seat])}点`;
export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  if (!s.rolls) return 'サイコロをふってください';
  return s.rolls < 3 ? `残すサイコロを選んでふり直すか、役を選んで点を書く（あと${3 - s.rolls}回ふれる）` : '役を選んで点を書いてください';
}

const nextSeat = (s, p) => { let q = p; do q = (q + 1) % s.players; while (s.out[q]); return q; };
const live = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);

function finish(ns) {
  const alive = live(ns);
  const best = Math.max(...alive.map((p) => totalOf(ns.sheets[p])));
  const top = alive.filter((p) => totalOf(ns.sheets[p]) === best);
  ns.result = ns.players === 1 ? { winner: 0, reason: `${best}点` } : top.length === 1 ? { winner: top[0], reason: `${best}点` } : { winner: null, reason: `${best}点で同点` };
}

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = { ...s, sheets: s.sheets.map((x) => ({ ...x })), dice: s.dice.slice(), held: s.held.slice(), out: s.out.slice(), history: s.history.slice() };
  if (mv.resign) {
    if (s.out[seat]) throw new Error('抜けています');
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    const alive = live(ns);
    if (!alive.length) ns.result = { winner: null, reason: 'やめました' };
    else if (s.players > 1 && alive.length === 1) ns.result = { winner: alive[0], reason: 'ほかの全員が抜けた' };
    else if (s.turn === seat) { ns.rolls = 0; ns.held = Array(5).fill(false); ns.turn = nextSeat(ns, seat); }
    return ns;
  }
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  if (mv.roll) {
    if (s.rolls >= 3) throw new Error('もう3回ふりました');
    const hold = s.rolls && Array.isArray(mv.hold) ? mv.hold.map(Boolean).slice(0, 5) : Array(5).fill(false);
    ns.dice = ns.dice.map((d, i) => (hold[i] ? d : randInt(rng, 6) + 1));
    ns.held = hold;
    ns.rolls = s.rolls + 1;
    ns.last = { type: 'roll', by: seat, rolled: hold.map((x) => !x) };
    return ns;
  }
  const cat = mv.score;
  if (!CATS.includes(cat)) throw new Error('役を選んでください');
  if (!s.rolls) throw new Error('先にサイコロをふってください');
  if (s.sheets[seat][cat] != null) throw new Error('その役はもう使いました');
  const pts = scoreFor(cat, s.dice);
  const hadBonus = bonusOf(s.sheets[seat]);
  ns.sheets[seat][cat] = pts;
  ns.last = { type: 'score', by: seat, cat, pts, dice: s.dice.slice(), bonus: !hadBonus && bonusOf(ns.sheets[seat]) > 0 };
  ns.history.push(`${label(seat)} ${CAT_NAMES[cat]} ${pts}点${ns.last.bonus ? '（ボーナス+35！）' : ''}`);
  ns.rolls = 0;
  ns.held = Array(5).fill(false);
  const next = nextSeat(ns, seat);
  if (next <= seat) ns.round = s.round + 1;
  if (live(ns).every((p) => CATS.every((c) => ns.sheets[p][c] != null))) { finish(ns); return ns; }
  ns.turn = next;
  return ns;
}

// ---------- CPU ----------
// 役ごとに「今書いたら何点か」を見て、良い役を狙ってサイコロを残す
const catValue = (cat, dice, sheet) => {
  const v = scoreFor(cat, dice);
  if (UPPER.includes(cat)) {
    const face = UPPER.indexOf(cat) + 1;
    return v + (v >= face * 3 ? 6 : 0) - (bonusOf(sheet) ? 0 : 0);
  }
  if (cat === 'choice') return v * 0.6;
  return v;
};
export function aiMove(s, seat) {
  if (s.result || s.turn !== seat || s.out[seat]) return null;
  const sheet = s.sheets[seat];
  const open = CATS.filter((c) => sheet[c] == null);
  if (!s.rolls) return { roll: true };
  const best = open.map((c) => [c, catValue(c, s.dice, sheet)]).sort((a, b) => b[1] - a[1])[0];
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  for (const d of s.dice) cnt[d]++;
  const done = best[1] >= 25 || (best[0] === 'yacht' && best[1]) || (['bstr', 'full'].includes(best[0]) && best[1]);
  if (s.rolls < 3 && !done) {
    // 残すもの: ストレートが空いていて4つ続きなら続き、それ以外は一番多い目（同数なら大きい目）
    const uniq = [...new Set(s.dice)].sort((a, b) => a - b);
    let keepVals = null;
    if ((sheet.bstr == null || sheet.sstr == null) && uniq.length >= 4) {
      for (const seq of [[2, 3, 4, 5], [1, 2, 3, 4], [3, 4, 5, 6]]) if (seq.every((v) => cnt[v])) { keepVals = seq; break; }
    }
    let hold;
    if (keepVals) {
      const used = new Set();
      hold = s.dice.map((d) => (keepVals.includes(d) && !used.has(d) ? (used.add(d), true) : false));
    } else {
      let face = 6;
      for (let v = 6; v >= 1; v--) if (cnt[v] > cnt[face]) face = v;
      hold = s.dice.map((d) => d === face);
    }
    return { roll: true, hold };
  }
  // 点が0になるなら、捨ててもいい役（ヨット・1）を使う
  if (best[1] <= 0) {
    const dump = ['ones', 'yacht', 'twos', 'bstr', 'four', 'sstr', 'full', 'threes'].find((c) => open.includes(c)) || open[0];
    return { score: dump };
  }
  return { score: best[0] };
}
