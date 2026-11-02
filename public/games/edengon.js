// 絵の伝言ゲーム（サーバーとブラウザで共通）
// 3〜8人。全員同時に進める。人数分の「伝言」があり、1つずつ全員の手をまわっていく。
// 流れ（「自分でお題を書く」のとき）: 1. 全員がお題を書く → 2. となりの人のお題を絵にする
//   → 3. その絵だけを見て、何の絵か言葉で書く → 4. その言葉を絵にする → …（全員を1回ずつまわったら終わり）
// 「お題を配る」のときは、最初のお題が配られて 1. から絵を描く。
// 見られるのは、自分に回ってきた1つ前の言葉か絵だけ。最後に伝言を1つずつ順番に見せていく（ホストが進める）。
// 時間切れのときは、描いたところまでの絵か「？」を出す。抜けた人の番は飛ばす（空の絵か「（抜けました）」）。
// 手: 描く手（drawing.js の { stroke } / { undo } / { clear }。みんなには送らない）/ { submit: true } 絵を出す
//     { text: '言葉' } お題・答えを出す / { unsubmit: true } 出したものを直す / { next: true } { showAll: true } 発表を進める（ホスト）/ { resign: true }
import { applyDraw, isDrawMove } from './drawing.js';
import { pickOptions, optionText, label, shuffle } from './util.js';
import { THEME_LIST, THEME_TAGS } from './paint.js';

export const id = 'edengon';
export const title = '絵の伝言ゲーム';
export const sideNames = Array.from({ length: 8 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 3;
export const maxPlayers = 8;
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const OPTIONS = [
  { key: 'start', label: '最初のお題', values: ['write', 'random'], names: ['自分で書く', '配る'] },
  { key: 'seconds', label: '描く時間', values: [90, 60, 120, 180], names: ['90秒', '60秒', '120秒', '180秒'] },
  { key: 'textSeconds', label: '書く時間', values: [40, 30, 60], names: ['40秒', '30秒', '60秒'] },
];
export const normalizeOptions = (o) => pickOptions(o, OPTIONS);
export const variantName = (o) => optionText(OPTIONS, normalizeOptions(o)).join('・');
export const MAX_TEXT = 40;
const TIMEOUT_TEXT = '？（時間切れ）';
const OUT_TEXT = '（抜けました）';

const active = (s) => [...Array(s.players).keys()].filter((p) => !s.out[p]);
// 伝言 c の k 番目の手番の人 / その人が今受け持つ伝言
const handler = (s, c, k) => (c + k) % s.players;
const chainOf = (s, seat, k = s.step) => (seat - k + s.players * 8) % s.players;
// k 番目の手番が絵か言葉か
export const kindAt = (s, k) => (s.options.start === 'random' ? (k % 2 ? 'text' : 'draw') : (k % 2 ? 'draw' : 'text'));
const base = (s) => (s.options.start === 'random' ? 1 : 0); // 配ったお題は items[0]

export function init(options, players = 3, rng) {
  const opts = normalizeOptions(options);
  const s = {
    players, options: opts, out: Array(players).fill(false), step: 0, steps: players, phase: 'play',
    chains: Array.from({ length: players }, () => ({ items: [] })),
    done: Array(players).fill(false), drafts: Array.from({ length: players }, () => []),
    reveal: null, endsAt: null, tickAt: null, result: null, history: [],
  };
  if (opts.start === 'random') {
    const pool = shuffle(THEME_LIST.map((_, i) => i).filter((i) => THEME_TAGS[i] !== 'hard'), rng);
    s.chains.forEach((ch, i) => ch.items.push({ seat: -1, kind: 'text', text: THEME_LIST[pool[i]][0] }));
  }
  startStep(s);
  return s;
}

function startStep(s) {
  s.done = s.out.slice(); // 抜けた人ははじめから済み
  s.drafts = Array.from({ length: s.players }, () => []);
  const ms = (kindAt(s, s.step) === 'draw' ? s.options.seconds : s.options.textSeconds) * 1000;
  s.endsAt = Date.now() + ms;
  s.tickAt = s.endsAt;
  s.history.push(`${s.step + 1}/${s.steps}：${kindAt(s, s.step) === 'draw' ? 'お絵かき' : s.step === 0 ? 'お題を書く' : '何の絵か書く'}`);
}

// 全員済んだら次の手番へ。足りない人の分（抜けた人・時間切れ）はここで埋める
function endStep(s) {
  const kind = kindAt(s, s.step);
  const now = s.step;
  for (let p = 0; p < s.players; p++) {
    const ch = s.chains[chainOf(s, p)];
    if (ch.items.length > base(s) + now) continue; // もう出した
    ch.items.push(kind === 'draw' ? { seat: p, kind, shapes: s.out[p] ? [] : s.drafts[p], late: !s.out[p] } : { seat: p, kind, text: s.out[p] ? OUT_TEXT : TIMEOUT_TEXT });
  }
  s.step += 1;
  if (s.step >= s.steps) startReveal(s);
  else startStep(s);
}

function startReveal(s) {
  s.phase = 'reveal';
  s.endsAt = null;
  s.tickAt = null;
  s.drafts = [];
  s.reveal = { chain: 0, shown: 1 };
  s.history.push('みんなの伝言を発表！');
}

function finish(s) {
  s.phase = 'end';
  s.reveal = null;
  s.result = { winners: active(s), team: 0, reason: 'おしまい' };
}
export const resultText = () => '伝言の発表おしまい！';

function maybeEnd(s) {
  if (s.phase === 'play' && active(s).every((p) => s.done[p])) endStep(s);
}

export function tick(s) {
  if (s.phase !== 'play') return { ...s, tickAt: null };
  const ns = clone(s);
  endStep(ns);
  return ns;
}

export const canActOutOfTurn = () => true;
export const quietMove = isDrawMove;

// 今の自分の番: 受け持つ伝言の1つ前のもの（はじめに書くときはなし）
function taskFor(s, seat) {
  if (s.phase !== 'play' || seat < 0 || s.out[seat]) return null;
  const c = chainOf(s, seat);
  const items = s.chains[c].items;
  const prev = items[base(s) + s.step - 1] || null;
  const mine = items[base(s) + s.step] || null;
  return { kind: kindAt(s, s.step), prev, mine, done: s.done[seat] };
}

export function viewFor(s, seat) {
  if (s.phase === 'end') return s;
  if (s.phase === 'reveal') {
    const { chain, shown } = s.reveal;
    return {
      ...s,
      chains: s.chains.map((ch, i) => ({ items: i < chain ? ch.items : i === chain ? ch.items.slice(0, shown) : [] })),
    };
  }
  return {
    ...s,
    chains: s.chains.map(() => ({ items: [] })),
    drafts: [],
    task: taskFor(s, seat),
    draft: seat >= 0 && s.drafts[seat] ? s.drafts[seat] : [],
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'reveal') return '伝言の発表中！';
  const t = taskFor(s, you);
  if (!t) return null;
  if (t.done) return '出しました。ほかの人を待っています';
  if (t.kind === 'draw') return t.prev ? `「${t.prev.text}」を絵にしよう` : 'お題を絵にしよう';
  return t.prev ? 'この絵が何か、言葉で書こう' : '最初のお題を書こう（ほかの人が絵にします）';
}

export const scoreOf = (s, seat) => (s.phase === 'play' ? (s.done[seat] ? '済み' : '考え中') : '');

const clone = (s) => ({
  ...s, out: s.out.slice(), done: s.done.slice(), drafts: s.drafts.slice(), history: s.history.slice(),
  chains: s.chains.map((ch) => ({ items: ch.items.slice() })), reveal: s.reveal && { ...s.reveal },
});

export function applyMove(s, mv, seat, rng, ctx) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (s.out[seat]) throw new Error('抜けています');
  const ns = clone(s);

  if (mv.resign) {
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (active(ns).length < 2) { finish(ns); return ns; }
    if (ns.phase === 'play') { ns.done[seat] = true; maybeEnd(ns); }
    return ns;
  }

  if (mv.next || mv.showAll) {
    if (s.phase !== 'reveal') throw new Error('今は発表中ではありません');
    if (ctx && ctx.hostSeat >= 0 && seat !== ctx.hostSeat) throw new Error('発表を進められるのはホストだけです');
    if (mv.showAll) { finish(ns); return ns; }
    const r = ns.reveal;
    if (r.shown < ns.chains[r.chain].items.length) r.shown += 1;
    else if (r.chain + 1 < ns.players) { r.chain += 1; r.shown = 1; }
    else finish(ns);
    return ns;
  }

  if (s.phase !== 'play') throw new Error('今はできません');
  const kind = kindAt(s, s.step);
  const items = ns.chains[chainOf(s, seat)].items;
  const at = base(s) + s.step;

  if (mv.unsubmit) {
    if (!s.done[seat]) return s;
    items.splice(at, 1);
    ns.done[seat] = false;
    return ns;
  }
  if (s.done[seat]) throw new Error('もう出しました（「直す」で出し直せます）');

  if (isDrawMove(mv)) {
    if (kind !== 'draw') throw new Error('今は描く番ではありません');
    ns.drafts[seat] = applyDraw(s.drafts[seat], mv);
    return ns;
  }
  if (mv.submit) {
    if (kind !== 'draw') throw new Error('今は描く番ではありません');
    if (!s.drafts[seat].some((x) => x.type !== 'erase')) throw new Error('絵を描いてください');
    items[at] = { seat, kind, shapes: s.drafts[seat] };
    ns.done[seat] = true;
    maybeEnd(ns);
    return ns;
  }
  if (mv.text != null) {
    if (kind !== 'text') throw new Error('今は書く番ではありません');
    const text = String(mv.text).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    if (!text) throw new Error('言葉を入れてください');
    items[at] = { seat, kind, text };
    ns.done[seat] = true;
    maybeEnd(ns);
    return ns;
  }
  throw new Error('不明な操作です');
}
