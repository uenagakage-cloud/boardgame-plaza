// 絵しりとり（サーバーとブラウザで共通）
// 2〜8人の協力ゲーム。言葉は書かずに、絵だけでしりとりをつなぐ。
// 流れ: 順番（毎回ランダム）に1人ずつ描く。描く人は「前の人の絵」を見て（最初の人はランダムに決まる「はじめの文字」から）、
//       その言葉の最後の文字から始まる言葉を考えて描き、描いた言葉（ひらがな）をこっそり登録する。
//       全員が決めた回数描いたら答え合わせ。絵と言葉を順に見せて、何回つながったかが記録。
// 「ん」で終わる言葉は登録できない。時間切れのときは、そこまでの絵を言葉なしで出す（つながらない）。
// 濁点・半濁点（が↔か、ぱ↔は）と小さい文字（ゃ↔や）は同じとみなし、のばす音（ー）は1つ前の文字で考える。
// 手: 描く手（drawing.js の { stroke } / { undo } / { clear }。描くたびにみんなに送る＝リアルタイムで見える）/ { submit: true, word: 'ことば' } / { resign: true }
import { applyDraw, isDrawMove, normalizeText } from './drawing.js';
import { pickOptions, optionText, label, shuffle, pick } from './util.js';

export const id = 'eshiritori';
export const title = '絵しりとり';
export const sideNames = Array.from({ length: 8 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 2;
export const maxPlayers = 8;
export const lobbyReturn = true;
export const logTitle = 'ログ';
// はじめの文字（毎回この中からランダム。始めにくい文字は入れない）
export const START_KANA = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ'];
export const OPTIONS = [
  { key: 'laps', label: '描く回数', values: [2, 1, 3], names: ['1人2回', '1人1回', '1人3回'] },
  { key: 'seconds', label: '描く時間', values: [90, 60, 120, 180], names: ['90秒', '60秒', '120秒', '180秒'] },
];
export const normalizeOptions = (o) => pickOptions(o, OPTIONS);
export const variantName = (o) => optionText(OPTIONS, normalizeOptions(o)).join('・');

const SMALL = { ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', っ: 'つ', ゎ: 'わ', ゕ: 'か', ゖ: 'け' };
// 濁点・半濁点をとって、小さい文字を大きくする
const plain = (ch) => {
  const c = ch.normalize('NFD').replace(/[゙゚]/g, '').normalize('NFC');
  return SMALL[c] || c;
};
export const firstKana = (word) => plain([...normalizeText(word)][0] || '');
export function lastKana(word) {
  const chars = [...normalizeText(word)];
  while (chars.length > 1 && chars[chars.length - 1] === 'ー') chars.pop();
  return plain(chars[chars.length - 1] || '');
}
export const links = (prev, word) => !!(prev && word && lastKana(prev) === firstKana(word));

// 登録できる言葉か調べて、ひらがなにそろえて返す
export function checkWord(text) {
  const w = normalizeText(text);
  if (!w) throw new Error('描いた言葉を入れてください');
  if (!/^[ぁ-ゖー]+$/.test(w)) throw new Error('言葉はひらがなかカタカナで入れてください');
  if ([...w].length < 2 || [...w].length > 12) throw new Error('言葉は2〜12文字にしてください');
  if (w.endsWith('ん')) throw new Error('「ん」で終わる言葉はだめです');
  return w;
}

const active = (s) => [...Array(s.players).keys()].filter((p) => !s.out[p]);

export function init(options, players = 2, rng) {
  const opts = normalizeOptions(options);
  const s = {
    players, options: opts, out: Array(players).fill(false),
    start: pick(START_KANA, rng), order: shuffle([...Array(players).keys()], rng), next: 0,
    total: players * opts.laps, chain: [], turn: -1, draft: [], phase: 'draw',
    endsAt: null, tickAt: null, result: null, history: [],
  };
  nextTurn(s);
  return s;
}

function nextTurn(s) {
  if (s.chain.length >= s.total || active(s).length < 2 && s.chain.length) { finish(s); return; }
  // 決めた順番（ランダム）でまわす。抜けた人は飛ばす
  let p;
  do p = s.order[s.next++ % s.players]; while (s.out[p]);
  s.turn = p;
  s.draft = [];
  s.endsAt = Date.now() + s.options.seconds * 1000;
  s.tickAt = s.endsAt;
}

function finish(s) {
  s.phase = 'end';
  s.endsAt = null;
  s.tickAt = null;
  const ok = s.chain.filter((e, i) => links(i ? s.chain[i - 1].word : s.start, e.word)).length;
  s.linked = ok;
  s.history.push(`答え合わせ：${s.chain.length}枚中 ${ok}回つながった`);
  s.result = { winners: active(s), team: 0, reason: `${s.chain.length}枚中 ${ok}回つながった` };
}

export const resultText = (s) => `答え合わせ！ ${s.chain.length}枚中 ${s.linked}回つながりました`;

function submit(s, seat, word) {
  s.chain.push({ seat, word, shapes: s.draft });
  s.history.push(word ? `${label(seat)} が描きました（${s.chain.length}/${s.total}）` : `${label(seat)} は時間切れ（${s.chain.length}/${s.total}）`);
  nextTurn(s);
}

export function tick(s) {
  if (s.phase !== 'draw') return { ...s, tickAt: null };
  const ns = clone(s);
  submit(ns, ns.turn, null);
  return ns;
}

export const canActOutOfTurn = () => true;

// 描いた絵はみんなに見せる（言葉は答え合わせまで見せない）。描いている人には前の人の絵を大きく見せる
export function viewFor(s, seat) {
  if (s.phase === 'end') return s;
  const me = seat === s.turn;
  const prev = s.chain[s.chain.length - 1];
  return {
    ...s,
    chain: s.chain.map((e) => ({ seat: e.seat, shapes: e.shapes })),
    prev: me && prev ? { seat: prev.seat, shapes: prev.shapes } : null,
    draft: s.draft, // 描いている絵はリアルタイムでみんなに見せる
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (you === s.turn) return s.chain.length ? '前の人の絵が何かを考えて、その最後の文字から始まる言葉を描こう' : `「${s.start}」から始まる言葉を描こう`;
  return null;
}

export const scoreOf = (s, seat) => `${s.chain.filter((e) => e.seat === seat).length}枚`;

const clone = (s) => ({ ...s, out: s.out.slice(), chain: s.chain.slice(), history: s.history.slice() });

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (s.out[seat]) throw new Error('抜けています');
  const ns = clone(s);
  if (mv.resign) {
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (active(ns).length < 2) finish(ns);
    else if (seat === s.turn) nextTurn(ns);
    return ns;
  }
  if (seat !== s.turn || s.phase !== 'draw') throw new Error('今はあなたの番ではありません');
  if (isDrawMove(mv)) { ns.draft = applyDraw(s.draft, mv); return ns; }
  if (mv.submit) {
    const word = checkWord(mv.word);
    if (!s.draft.some((x) => x.type !== 'erase')) throw new Error('絵を描いてください');
    submit(ns, seat, word);
    return ns;
  }
  throw new Error('不明な操作です');
}
