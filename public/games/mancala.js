// マンカラ（カラハ）（サーバーとブラウザで共通）
// 2人。自分の側に穴が6つ、右はしに自分の「ゴール」。最初は各穴に石が4つ（3〜6個にできる）。
// 自分の穴を1つ選んで石を全部取り、反時計回りに1つずつまく（相手のゴールは飛ばす）。
// 最後の石が自分のゴールに入ったら、もう1回。最後の石が自分の空の穴に入り、向かいの相手の穴に石があれば、両方とも自分のゴールへ（横取り）。
// どちらかの側の穴が全部空になったら終わり。残りの石はそれぞれの側のゴールへ。ゴールの石が多い人の勝ち。
// 穴: pits[0〜5] 先手の穴、pits[6] 先手のゴール、pits[7〜12] 後手の穴、pits[13] 後手のゴール。
// 手: { pit: 0〜5 }（自分から見て左から） / { resign: true }
export const id = 'mancala';
export const title = 'マンカラ';
export const sideNames = ['先手', '後手'];
export const SEED_OPTIONS = [3, 4, 5, 6];
export const logTitle = 'ログ';

export function normalizeOptions(o) {
  return { seeds: SEED_OPTIONS.includes(Number(o && o.seeds)) ? Number(o.seeds) : 4, cpu: !!(o && o.cpu) };
}
export const variantName = (o) => {
  const x = normalizeOptions(o);
  return `石${x.seeds}個${x.cpu ? '・CPU対戦' : ''}`;
};

export const storeOf = (p) => (p === 0 ? 6 : 13);
export const pitIndex = (p, k) => p * 7 + k;

export function init(options) {
  const opts = normalizeOptions(options);
  const pits = Array(14).fill(opts.seeds);
  pits[6] = pits[13] = 0;
  return { options: opts, pits, turn: 0, last: null, result: null, history: [] };
}

export const legalMoves = (s) => (s.result ? [] : [0, 1, 2, 3, 4, 5].filter((k) => s.pits[pitIndex(s.turn, k)] > 0));

// まく（pits を書きかえる）。{ last: 最後に入れた穴, path: まいた穴, extra: もう1回, captured: 横取りした数 } を返す
function sow(pits, p, k) {
  let i = pitIndex(p, k);
  let seeds = pits[i];
  pits[i] = 0;
  const path = [];
  while (seeds > 0) {
    i = (i + 1) % 14;
    if (i === storeOf(1 - p)) continue;
    pits[i] += 1;
    path.push(i);
    seeds -= 1;
  }
  let captured = 0;
  const mine = p === 0 ? i <= 5 : i >= 7 && i <= 12;
  if (mine && pits[i] === 1 && pits[12 - i] > 0) {
    captured = pits[12 - i] + 1;
    pits[storeOf(p)] += captured;
    pits[i] = 0;
    pits[12 - i] = 0;
  }
  return { last: i, path, extra: i === storeOf(p), captured };
}

const sideEmpty = (pits, p) => [0, 1, 2, 3, 4, 5].every((k) => pits[pitIndex(p, k)] === 0);

// どちらかの側が空なら、残りをゴールへ集めて true
function sweepIfOver(pits) {
  if (!sideEmpty(pits, 0) && !sideEmpty(pits, 1)) return false;
  for (const p of [0, 1]) for (let k = 0; k < 6; k++) {
    const i = pitIndex(p, k);
    pits[storeOf(p)] += pits[i];
    pits[i] = 0;
  }
  return true;
}

export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => `ゴール ${s.pits[storeOf(seat)]}`;

export function phaseText(s, you) {
  if (s.result || you !== s.turn) return null;
  return s.last && s.last.extra && s.last.by === you ? 'ゴールにぴったり！ もう1回' : '石をまく穴を選んでください';
}

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  if (s.turn !== seat) throw new Error('相手の番です');
  const k = Number(mv && mv.pit);
  if (!legalMoves(s).includes(k)) throw new Error('石のある自分の穴を選んでください');
  const pits = s.pits.slice();
  const r = sow(pits, seat, k);
  const ns = { ...s, pits, history: s.history.slice(), last: { by: seat, from: pitIndex(seat, k), ...r } };
  let note = `${sideNames[seat]} ${k + 1}番の穴（${s.pits[pitIndex(seat, k)]}個）`;
  if (r.extra) note += ' ゴールでもう1回';
  if (r.captured) note += ` 横取り${r.captured}個`;
  ns.history.push(note);
  if (sweepIfOver(pits)) {
    const a = pits[6], b = pits[13];
    ns.result = a === b ? { winner: null, reason: `${a}対${b}` } : { winner: a > b ? 0 : 1, reason: `${Math.max(a, b)}対${Math.min(a, b)}` };
    return ns;
  }
  ns.turn = r.extra ? seat : 1 - seat;
  return ns;
}

// ---------- CPU ----------
// 何手か先まで読む（ゴールの差が大きくなる手）
function search(pits, p, me, depth, alpha, beta) {
  if (depth === 0 || sideEmpty(pits, 0) || sideEmpty(pits, 1)) {
    const t = pits.slice();
    sweepIfOver(t);
    return t[storeOf(me)] - t[storeOf(1 - me)];
  }
  const moves = [0, 1, 2, 3, 4, 5].filter((k) => pits[pitIndex(p, k)] > 0);
  let best = p === me ? -Infinity : Infinity;
  for (const k of moves) {
    const t = pits.slice();
    const r = sow(t, p, k);
    const v = search(t, r.extra ? p : 1 - p, me, depth - 1, alpha, beta);
    if (p === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

export function aiMove(s, seat, rng) {
  if (s.result || s.turn !== seat) return null;
  const rand = rng ? () => (rng(1000) - 1) / 1000 : Math.random;
  let best = null, bestV = -Infinity;
  for (const k of legalMoves(s)) {
    const t = s.pits.slice();
    const r = sow(t, seat, k);
    const v = search(t, r.extra ? seat : 1 - seat, seat, 7, -Infinity, Infinity) + rand() * 0.1;
    if (v > bestV) { bestV = v; best = k; }
  }
  return best == null ? null : { pit: best };
}
