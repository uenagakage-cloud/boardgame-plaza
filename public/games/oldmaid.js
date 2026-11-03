// ババ抜き・ジジ抜き（サーバーとブラウザで共通）。babanuki.js / jijinuki.js から使う
// 2〜6人。ババ抜きは52枚＋ジョーカー（ババ）1枚、ジジ抜きは52枚から1枚を誰にも見せずに抜いておく（相手がいなくなったカードが「ジジ」）。
// 全部配って、同じ数字が2枚そろったら捨てる（はじめに配ったときも、引いたときも自動で捨てる）。
// 順番に、次の人（手札がある人）の手札から裏向きのまま1枚引く。引かれた人が次に引く番になる。
// 手札がなくなった人から抜けていく（1位・2位…）。最後までカードが残った人の負け。
// 手: { draw: 相手の手札の何枚目か } / { shuffle: true } 自分の手札を混ぜる（いつでも）/ { resign: true }
import { shuffle, makeDeck52, label, cardLabel, randInt } from './util.js';

export const minPlayers = 2;
export const maxPlayers = 6;
export const sideNames = Array.from({ length: 6 }, (_, i) => `プレイヤー${i + 1}`);
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const JOKER = { id: 52, s: 'j', r: 0 };
export const isJoker = (c) => !!c && c.s === 'j';
export const name = (c) => (isJoker(c) ? 'ジョーカー' : cardLabel(c));

// 同じ数字が2枚あるものを捨てる（3枚なら1枚残る）。捨てたペアを返す
function dropPairs(hand) {
  const pairs = [];
  const byRank = new Map();
  for (const c of hand) {
    if (isJoker(c)) continue;
    const other = byRank.get(c.r);
    if (other) { pairs.push([other, c]); byRank.delete(c.r); } else byRank.set(c.r, c);
  }
  const gone = new Set(pairs.flat().map((c) => c.id));
  return { hand: hand.filter((c) => !gone.has(c.id)), pairs };
}

// 手札の枚数（画面に送った状態では、ほかの人の手札は handCounts だけ）
const count = (s, p) => (s.handCounts ? s.handCounts[p] : s.hands[p].length);
const active = (s) => [...Array(s.players).keys()].filter((p) => !s.out[p] && count(s, p));
function nextActive(s, p) {
  for (let k = 1; k <= s.players; k++) {
    const q = (p + k) % s.players;
    if (!s.out[q] && count(s, q)) return q;
  }
  return -1;
}

export function init(options, players = 2, rng, mode = 'baba') {
  let deck = makeDeck52();
  let removed = null;
  if (mode === 'baba') deck.push({ ...JOKER });
  else removed = deck.splice(randInt(rng, deck.length), 1)[0];
  deck = shuffle(deck, rng);
  const s = {
    players, mode, hands: Array.from({ length: players }, () => []), out: Array(players).fill(false),
    rank: [], discards: [], removed, turn: 0, last: null, result: null, history: [],
  };
  deck.forEach((c, i) => s.hands[i % players].push(c));
  for (let p = 0; p < players; p++) {
    const r = dropPairs(s.hands[p]);
    s.hands[p] = shuffle(r.hand, rng);
    s.discards.push(...r.pairs);
    if (r.pairs.length) s.history.push(`${label(p)} はじめに ${r.pairs.length}組 捨てた`);
  }
  for (let p = 0; p < players; p++) if (!s.hands[p].length) finishSeat(s, p);
  const alive = active(s);
  s.turn = alive.length ? alive[randInt(rng, alive.length)] : 0;
  checkEnd(s);
  return s;
}

function finishSeat(s, p) {
  if (s.rank.includes(p) || s.out[p]) return;
  s.rank.push(p);
  s.history.push(`${label(p)} あがり！（${s.rank.length}位）`);
}

function checkEnd(s) {
  const alive = active(s);
  if (alive.length > 1) return false;
  const loser = alive[0] ?? -1;
  s.loser = loser;
  const what = s.mode === 'baba' ? 'ババ' : `ジジ（${s.removed ? cardLabel(s.removed) + 'の相方' : ''}）`;
  if (loser >= 0) s.history.push(`${label(loser)} の負け（最後に${s.mode === 'baba' ? 'ババ' : 'ジジ'}が残った）`);
  s.result = { winner: s.rank[0] ?? null, reason: loser >= 0 ? `${label(loser)} が最後まで${what}を持っていた` : 'みんな抜けた' };
  return true;
}

export const canActOutOfTurn = () => true; // 手札を混ぜるのはいつでも
export const target = (s) => nextActive(s, s.turn);

export function viewFor(s, seat) {
  const all = seat < 0 || !!s.result || s.out[seat] || (seat >= 0 && !s.hands[seat].length);
  const last = s.last && { ...s.last, card: all || seat === s.last.from || seat === s.last.to ? s.last.card : null };
  return {
    ...s,
    seesAll: all,
    hands: s.hands.map((h, i) => (i === seat || all ? h : null)),
    handCounts: s.hands.map((h) => h.length),
    removed: s.result ? s.removed : null,
    last,
  };
}

export function phaseText(s, you) {
  if (s.result || you < 0) return null;
  if (you === s.turn) return `${'P' + (target(s) + 1)} の手札から1枚引いてください`;
  if (you === target(s)) return `${'P' + (s.turn + 1)} があなたの手札から引きます（「混ぜる」で並びを変えられます）`;
  return null;
}
export const scoreOf = (s, seat) => {
  const n = s.handCounts ? s.handCounts[seat] : s.hands[seat].length;
  const r = s.rank.indexOf(seat);
  return r >= 0 ? `${r + 1}位` : `${n}枚`;
};

const clone = (s) => ({ ...s, hands: s.hands.map((h) => h.slice()), out: s.out.slice(), rank: s.rank.slice(), discards: s.discards.slice(), history: s.history.slice() });

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    if (s.out[seat]) throw new Error('抜けています');
    // 手札は次の人へ渡す（ペアは捨てる）
    const give = ns.hands[seat];
    ns.hands[seat] = [];
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    const q = nextActive(ns, seat);
    if (give.length && q >= 0) {
      const r = dropPairs([...ns.hands[q], ...give]);
      ns.hands[q] = shuffle(r.hand, rng);
      ns.discards.push(...r.pairs);
      if (!ns.hands[q].length) finishSeat(ns, q);
    }
    if (!checkEnd(ns) && (ns.turn === seat || !ns.hands[ns.turn].length)) ns.turn = nextActive(ns, seat);
    return ns;
  }
  if (s.out[seat]) throw new Error('抜けています');
  if (mv.shuffle) {
    ns.hands[seat] = shuffle(ns.hands[seat].slice(), rng);
    return ns;
  }
  if (mv.draw == null) throw new Error('不明な操作です');
  if (seat !== s.turn) throw new Error('あなたの番ではありません');
  const from = target(s);
  const i = Number(mv.draw);
  if (!Number.isInteger(i) || i < 0 || i >= s.hands[from].length) throw new Error('そのカードは引けません');
  const [card] = ns.hands[from].splice(i, 1);
  const r = dropPairs([...ns.hands[seat], card]);
  // 引いたカードは手札のどこかに入れる（並びで分からないように）
  ns.hands[seat] = r.pairs.length ? r.hand : (() => { const h = ns.hands[seat].slice(); h.splice(randInt(rng, h.length + 1), 0, card); return h; })();
  ns.discards.push(...r.pairs);
  ns.last = { from, to: seat, card, pair: r.pairs[0] || null };
  ns.history.push(r.pairs.length ? `${label(seat)} が ${label(from)} から引いて、ペアで捨てた（${r.pairs[0].map(cardLabel).join('・')}）` : `${label(seat)} が ${label(from)} から1枚引いた`);
  if (!ns.hands[from].length) finishSeat(ns, from);
  if (!ns.hands[seat].length) finishSeat(ns, seat);
  if (checkEnd(ns)) return ns;
  // 引かれた人が次に引く（その人が抜けたら、その次の人）
  ns.turn = ns.hands[from].length ? from : nextActive(ns, from);
  if (ns.turn === -1) ns.turn = seat;
  return ns;
}

// CPU: ランダムに1枚引く
export function aiMove(s, seat, rng) {
  if (s.result || seat !== s.turn) return null;
  const n = (s.handCounts ? s.handCounts : s.hands.map((h) => h.length))[target(s)];
  return n ? { draw: randInt(rng, n) } : null;
}
