// ヒット&ブロー（ボール）（サーバーとブラウザで共通）
// 1〜4人。コンピューターが、色のついたボール4つの並びをこっそり決める（6色から。同じ色は使わない／使うを選べる）。
// 順番に、並びを予想して出す。色も場所も合っているボールの数が「ヒット」、色は合っているが場所がちがう数が「ブロー」。
// みんなの予想と結果は全員に見える。先に4ヒット（ぴったり当てた）人の勝ち。1人なら10回以内に当てればクリア。
// 手: { guess: [色0〜5 ×4] } / { resign: true }
import { shuffle, pickOptions, seatNames, label, randInt } from './util.js';

export const id = 'hbball';
export const title = 'ヒット&ブロー（ボール）';
export const minPlayers = 1;
export const maxPlayers = 4;
export const sideNames = seatNames(4);
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const LEN = 4;
export const COLORS = ['#e03131', '#f08c00', '#fcc419', '#2f9e44', '#1c7ed6', '#9c36b5'];
export const COLOR_NAMES = ['赤', 'オレンジ', '黄', '緑', '青', '紫'];
export const OPTIONS = [{ key: 'dup', label: '同じ色', values: [false, true], names: ['使わない', '使う'] }];
const SOLO_LIMIT = 10, MULTI_LIMIT = 12;
export const normalizeOptions = (o) => pickOptions(o, OPTIONS);
export const variantName = (o) => (normalizeOptions(o).dup ? '同じ色あり' : '');

export function judge(secret, guess) {
  let hit = 0, blow = 0;
  const a = [0, 0, 0, 0, 0, 0], b = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < LEN; i++) {
    if (secret[i] === guess[i]) hit++;
    else { a[secret[i]]++; b[guess[i]]++; }
  }
  for (let c = 0; c < 6; c++) blow += Math.min(a[c], b[c]);
  return { hit, blow };
}

export function init(options, players = 1, rng) {
  const opts = normalizeOptions(options);
  const secret = opts.dup ? Array.from({ length: LEN }, () => randInt(rng, 6)) : shuffle([0, 1, 2, 3, 4, 5], rng).slice(0, LEN);
  return { players, options: opts, secret, guesses: [], turn: 0, round: 1, out: Array(players).fill(false), last: null, result: null, history: [] };
}

export const viewFor = (s) => ({ ...s, secret: s.result ? s.secret : null });
export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `${s.guesses.filter((g) => g.by === seat).length}回`;
export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  return 'ボールを4つ並べて「予想する」を押してください';
}

const nextSeat = (s, p) => { let q = p; do q = (q + 1) % s.players; while (s.out[q]); return q; };
const live = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
const limit = (s) => (s.players === 1 ? SOLO_LIMIT : MULTI_LIMIT);

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = { ...s, guesses: s.guesses.slice(), out: s.out.slice(), history: s.history.slice() };
  if (mv.resign) {
    if (s.out[seat]) throw new Error('抜けています');
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    const alive = live(ns);
    if (!alive.length) ns.result = { winner: null, reason: 'やめました' };
    else if (s.players > 1 && alive.length === 1) ns.result = { winner: alive[0], reason: 'ほかの全員が抜けた' };
    else if (s.turn === seat) ns.turn = nextSeat(ns, seat);
    return ns;
  }
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  const g = mv.guess;
  if (!Array.isArray(g) || g.length !== LEN || g.some((c) => !Number.isInteger(c) || c < 0 || c > 5)) throw new Error('ボールを4つ選んでください');
  if (!s.options.dup && new Set(g).size !== LEN) throw new Error('同じ色は使えません');
  const r = judge(s.secret, g);
  ns.guesses.push({ by: seat, guess: g.slice(), ...r });
  ns.last = { by: seat, ...r };
  ns.history.push(`${label(seat)} ${g.map((c) => COLOR_NAMES[c]).join('・')} → ${r.hit}ヒット ${r.blow}ブロー`);
  if (r.hit === LEN) { ns.result = { winner: seat, reason: `${ns.guesses.filter((x) => x.by === seat).length}回目で当てた` }; return ns; }
  const next = nextSeat(ns, seat);
  if (next <= seat) ns.round = s.round + 1;
  if (ns.round > limit(s)) { ns.result = { winner: null, reason: s.players === 1 ? `${SOLO_LIMIT}回で当てられなかった` : `${MULTI_LIMIT}回ずつで、だれも当てられなかった` }; return ns; }
  ns.turn = next;
  return ns;
}

// ---------- CPU ----------
// これまでの全員の結果と合う並びの中から選ぶ
let ALL = null;
function allCodes(dup) {
  const out = [];
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) for (let d = 0; d < 6; d++) {
    const x = [a, b, c, d];
    if (dup || new Set(x).size === 4) out.push(x);
  }
  return out;
}
export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat || s.out[seat]) return null;
  ALL = ALL || { true: allCodes(true), false: allCodes(false) };
  const pool = ALL[!!s.options.dup].filter((x) => s.guesses.every((g) => { const r = judge(x, g.guess); return r.hit === g.hit && r.blow === g.blow; }));
  const list = pool.length ? pool : ALL[!!s.options.dup];
  return { guess: list[randInt(rng, list.length)] };
}
