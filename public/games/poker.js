// ポーカー（テキサスホールデム、ノーリミット）のルール（サーバーとブラウザで共通）
// 2〜6人。全員 1000 チップから、ブラインド 10/20。手札2枚＋場の5枚のうち、よい5枚の役で勝負する。
// 手番: プリフロップ → フロップ（3枚）→ ターン → リバー → ショーダウン。
// オールインで足りない分はサイドポットに分ける。チップがなくなった人は脱落、最後の1人が勝ち。
// ハンドが終わると数秒後にサーバーが tick() で次のハンドを配る。
// 手: { fold: true } / { check: true } / { call: true } / { raise: 合計の賭け額 } / { resign: true }
export const id = 'poker';
export const title = 'ポーカー';
export const sideNames = Array.from({ length: 6 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 2;
export const maxPlayers = 6;
export const lobbyReturn = true;
export const START_CHIPS = 1000;
export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;
export const NEXT_HAND_MS = 6000;

export const SUITS = ['s', 'h', 'd', 'c'];
export const SUIT_MARK = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_LABEL = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankLabel = (r) => RANK_LABEL[r] || String(r);
export const cardLabel = (c) => SUIT_MARK[c.s] + rankLabel(c.r);
export const HAND_NAMES = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ'];

function shuffle(arr, rng) {
  const rand = rng ? (n) => rng(n) - 1 : (n) => Math.floor(Math.random() * n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- 役の判定 ----------
// 5枚の強さ [役, 比べる数字...]。配列を前から比べて大きい方が強い
function score5(cards) {
  const rs = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);
  const uniq = [...new Set(rs)];
  let straightTop = 0;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straightTop = rs[0];
    else if (rs[0] === 14 && rs[1] === 5) straightTop = 5; // A-2-3-4-5
  }
  const counts = {};
  for (const r of rs) counts[r] = (counts[r] || 0) + 1;
  // 枚数の多い順、同じ枚数なら数字の大きい順
  const groups = Object.entries(counts).map(([r, n]) => [n, Number(r)]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const byGroup = groups.map((g) => g[1]);
  if (straightTop && flush) return [8, straightTop];
  if (groups[0][0] === 4) return [7, ...byGroup];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...byGroup];
  if (flush) return [5, ...rs];
  if (straightTop) return [4, straightTop];
  if (groups[0][0] === 3) return [3, ...byGroup];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...byGroup];
  if (groups[0][0] === 2) return [1, ...byGroup];
  return [0, ...rs];
}

export function compareScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

// 7枚（以下）から一番強い5枚
export function bestHand(cards) {
  let best = null, bestCards = null;
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
    const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
    const sc = score5(five);
    if (!best || compareScore(sc, best) > 0) { best = sc; bestCards = five; }
  }
  return { score: best, cards: bestCards, name: best[0] === 8 && best[1] === 14 ? 'ロイヤルフラッシュ' : HAND_NAMES[best[0]] };
}

// ---------- 状態 ----------
export function init(options, players = 2, rng) {
  const s = {
    players, out: Array(players).fill(false), stacks: Array(players).fill(START_CHIPS),
    button: players - 1, handNo: 0, phase: 'preflop', deck: [], board: [], holes: [],
    bets: [], contributed: [], folded: [], allIn: [], needs: [], currentBet: 0, minRaise: BIG_BLIND,
    pot: 0, showdown: null, lastAction: null, turn: 0, tickAfter: null, result: null, history: [],
  };
  startHand(s, rng);
  return s;
}

const label = (seat) => `P${seat + 1}`;
const inHand = (s) => [...Array(s.players).keys()].filter((p) => s.holes[p] && !s.folded[p]);
const canBet = (s, p) => s.holes[p] && !s.folded[p] && !s.allIn[p];

function nextSeat(s, from, pred) {
  for (let k = 1; k <= s.players; k++) {
    const p = (from + k) % s.players;
    if (pred(p)) return p;
  }
  return -1;
}

function putChips(s, p, amount) {
  const a = Math.min(amount, s.stacks[p]);
  s.stacks[p] -= a;
  s.bets[p] += a;
  s.contributed[p] += a;
  s.pot += a;
  if (s.stacks[p] === 0) s.allIn[p] = true;
  return a;
}

function startHand(s, rng) {
  const n = s.players;
  const seats = [...Array(n).keys()].filter((p) => !s.out[p] && s.stacks[p] > 0);
  s.handNo += 1;
  s.deck = shuffle([...SUITS.flatMap((su) => Array.from({ length: 13 }, (_, i) => ({ s: su, r: i + 2 })))], rng);
  s.board = [];
  s.holes = Array(n).fill(null);
  s.bets = Array(n).fill(0);
  s.contributed = Array(n).fill(0);
  s.folded = Array(n).fill(false);
  s.allIn = Array(n).fill(false);
  s.pot = 0;
  s.showdown = null;
  s.tickAfter = null;
  s.phase = 'preflop';
  for (const p of seats) s.holes[p] = [s.deck.pop(), s.deck.pop()];
  const inGame = (p) => seats.includes(p);
  s.button = nextSeat(s, s.button, inGame);
  // 2人のときはボタンがスモールブラインド
  const sb = seats.length === 2 ? s.button : nextSeat(s, s.button, inGame);
  const bb = nextSeat(s, sb, inGame);
  putChips(s, sb, SMALL_BLIND);
  putChips(s, bb, BIG_BLIND);
  s.sb = sb;
  s.bb = bb;
  s.currentBet = BIG_BLIND;
  s.minRaise = BIG_BLIND;
  s.needs = seats.filter((p) => canBet(s, p));
  s.turn = nextSeat(s, bb, (p) => s.needs.includes(p));
  s.lastAction = null;
  s.history.push(`ハンド${s.handNo}（ディーラー ${label(s.button)}）`);
  if (s.turn < 0 || s.needs.length <= 1 && s.needs.every((p) => s.bets[p] >= s.currentBet)) advanceStreet(s);
}

function advanceStreet(s) {
  // ベットを集めて次の場へ。賭けられる人が1人以下なら残りを全部めくる
  s.bets = s.bets.map(() => 0);
  s.currentBet = 0;
  s.minRaise = BIG_BLIND;
  const deal = (k) => { for (let i = 0; i < k; i++) s.board.push(s.deck.pop()); };
  const order = ['preflop', 'flop', 'turn', 'river'];
  while (true) {
    const i = order.indexOf(s.phase);
    if (i === 3) return showdown(s);
    s.phase = order[i + 1];
    deal(s.phase === 'flop' ? 3 : 1);
    s.history.push(`${{ flop: 'フロップ', turn: 'ターン', river: 'リバー' }[s.phase]}: ${s.board.map(cardLabel).join(' ')}`);
    const bettors = inHand(s).filter((p) => canBet(s, p));
    if (bettors.length >= 2) {
      s.needs = bettors;
      s.turn = nextSeat(s, s.button, (p) => bettors.includes(p));
      return;
    }
  }
}

// ポット（サイドポット）を分けて配る
function payout(s, winnersOf) {
  const contrib = s.contributed.slice();
  const live = inHand(s);
  const levels = [...new Set(live.map((p) => contrib[p]))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const L of levels) {
    let amount = 0;
    for (let p = 0; p < s.players; p++) amount += Math.max(0, Math.min(contrib[p], L) - prev);
    const eligible = live.filter((p) => contrib[p] >= L);
    if (amount > 0) pots.push({ amount, eligible });
    prev = L;
  }
  // 誰にもコールされなかった分は返す
  for (let p = 0; p < s.players; p++) if (contrib[p] > prev) s.stacks[p] += contrib[p] - prev;
  const won = Array(s.players).fill(0);
  for (const pot of pots) {
    const winners = winnersOf(pot.eligible);
    const share = Math.floor(pot.amount / winners.length);
    let rest = pot.amount - share * winners.length;
    // 端数はボタンの左から
    const ordered = [...Array(s.players).keys()].map((k) => (s.button + 1 + k) % s.players).filter((p) => winners.includes(p));
    for (const p of ordered) { won[p] += share + (rest > 0 ? 1 : 0); rest--; }
    pot.winners = winners;
  }
  won.forEach((w, p) => { s.stacks[p] += w; });
  return { pots, won };
}

function endHand(s) {
  s.pot = 0;
  s.bets = s.bets.map(() => 0);
  s.turn = -1;
  s.needs = [];
  // チップがなくなった人は脱落
  for (let p = 0; p < s.players; p++) if (s.stacks[p] === 0 && !s.out[p]) { s.out[p] = 'bust'; s.history.push(`${label(p)} はチップがなくなりました`); }
  const left = [...Array(s.players).keys()].filter((p) => !s.out[p]);
  if (left.length <= 1) {
    s.result = left.length ? { winner: left[0], reason: 'チップを全部獲得' } : { winner: null, reason: '全員がいなくなりました' };
    s.tickAfter = null;
  } else {
    s.tickAfter = NEXT_HAND_MS;
  }
}

function showdown(s) {
  s.phase = 'showdown';
  const live = inHand(s);
  const hands = {};
  for (const p of live) hands[p] = bestHand([...s.holes[p], ...s.board]);
  const { pots, won } = payout(s, (eligible) => {
    let best = null;
    for (const p of eligible) if (!best || compareScore(hands[p].score, best) > 0) best = hands[p].score;
    return eligible.filter((p) => compareScore(hands[p].score, best) === 0);
  });
  s.showdown = { hands: Object.fromEntries(live.map((p) => [p, { name: hands[p].name, cards: hands[p].cards }])), won, pots: pots.map((x) => ({ amount: x.amount, winners: x.winners })) };
  for (const p of live) if (won[p]) s.history.push(`${label(p)} が ${won[p]} 獲得（${hands[p].name}）`);
  endHand(s);
}

function winByFold(s) {
  const [p] = inHand(s);
  s.phase = 'showdown';
  const { won } = payout(s, (eligible) => eligible);
  s.showdown = { hands: {}, won, pots: [], byFold: p };
  s.history.push(`${label(p)} が ${won[p]} 獲得（ほかが全員フォールド）`);
  endHand(s);
}

export function tick(s, rng) {
  if (s.phase !== 'showdown' || s.result) return { ...s, tickAfter: null };
  const ns = clone(s);
  startHand(ns, rng);
  return ns;
}

export const canActOutOfTurn = () => false;

// 自分の手札とショーダウンで見せた手札だけ見せる。山札は送らない
export function viewFor(s, seat) {
  return {
    ...s, deck: null,
    // 観戦者・降りた人・抜けた人・終わったあとは、全員の手札が見える
    seesAll: seat < 0 || !!s.result || !!s.out[seat] || !!s.folded[seat],
    holes: s.holes.map((h, i) => (h && (i === seat || (s.showdown && s.showdown.hands[i]) || seat < 0 || s.result || s.out[seat] || s.folded[seat]) ? h : h ? 'hidden' : null)),
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'showdown') return s.showdown && s.showdown.byFold != null ? '全員フォールドでハンド終了。まもなく次のハンド' : 'ショーダウン！ まもなく次のハンド';
  if (you !== s.turn) return null;
  const toCall = s.currentBet - s.bets[you];
  return toCall > 0 ? `あなたの番：コール ${Math.min(toCall, s.stacks[you])} か、レイズ・フォールド` : 'あなたの番：チェックかベット';
}

export const scoreOf = (s, seat) => `${s.stacks[seat]}`;

const clone = (s) => ({
  ...s, out: s.out.slice(), stacks: s.stacks.slice(), deck: s.deck.slice(), board: s.board.slice(),
  holes: s.holes.slice(), bets: s.bets.slice(), contributed: s.contributed.slice(), folded: s.folded.slice(),
  allIn: s.allIn.slice(), needs: s.needs.slice(), history: s.history.slice(),
});

// 今の手番の人が選べる操作
export function options(s, seat) {
  if (s.result || s.turn !== seat || !['preflop', 'flop', 'turn', 'river'].includes(s.phase)) return null;
  const toCall = Math.max(0, s.currentBet - s.bets[seat]);
  const max = s.bets[seat] + s.stacks[seat];
  const minTo = Math.min(max, s.currentBet + s.minRaise);
  return { toCall: Math.min(toCall, s.stacks[seat]), canCheck: toCall === 0, minRaiseTo: minTo, maxRaiseTo: max, canRaise: max > s.currentBet };
}

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);

  if (mv.resign) {
    if (s.out[seat]) return s;
    ns.out[seat] = 'left';
    ns.history.push(`${label(seat)} が退席`);
    if (ns.holes[seat] && !ns.folded[seat] && ['preflop', 'flop', 'turn', 'river'].includes(ns.phase)) {
      ns.folded[seat] = true;
      ns.needs = ns.needs.filter((p) => p !== seat);
      if (seat === ns.turn) afterAction(ns, seat);
      else if (inHand(ns).length === 1) winByFold(ns);
    }
    const left = [...Array(ns.players).keys()].filter((p) => !ns.out[p]);
    if (left.length === 1 && !ns.result) { ns.result = { winner: left[0], reason: '他の全員が退席' }; ns.tickAfter = null; }
    return ns;
  }

  const opt = options(s, seat);
  if (!opt) throw new Error('あなたの番ではありません');
  const toCall = s.currentBet - s.bets[seat];
  if (mv.fold) {
    ns.folded[seat] = true;
    ns.lastAction = { seat, text: 'フォールド' };
  } else if (mv.check) {
    if (toCall > 0) throw new Error('チェックできません（コールかフォールド）');
    ns.lastAction = { seat, text: 'チェック' };
  } else if (mv.call) {
    if (toCall <= 0) throw new Error('コールする額がありません');
    const a = putChips(ns, seat, toCall);
    ns.lastAction = { seat, text: ns.allIn[seat] ? `オールイン ${a}` : `コール ${a}` };
  } else if (mv.raise != null) {
    const to = Math.floor(Number(mv.raise));
    if (!opt.canRaise) throw new Error('レイズできません');
    if (!(to >= opt.minRaiseTo && to <= opt.maxRaiseTo)) throw new Error(`${opt.minRaiseTo}〜${opt.maxRaiseTo} の額にしてください`);
    const raiseBy = to - s.currentBet;
    putChips(ns, seat, to - s.bets[seat]);
    if (raiseBy >= s.minRaise) ns.minRaise = raiseBy;
    ns.currentBet = Math.max(ns.currentBet, to);
    // レイズされたら、ほかの賭けられる人はもう一度行動する
    ns.needs = [...Array(ns.players).keys()].filter((p) => p !== seat && canBet(ns, p));
    ns.lastAction = { seat, text: ns.allIn[seat] ? `オールイン ${to}` : s.currentBet === 0 ? `ベット ${to}` : `レイズ ${to}` };
  } else {
    throw new Error('不明な操作です');
  }
  ns.history.push(`${label(seat)} ${ns.lastAction.text}`);
  ns.needs = ns.needs.filter((p) => p !== seat);
  afterAction(ns, seat);
  return ns;
}

function afterAction(ns, seat) {
  if (inHand(ns).length === 1) return winByFold(ns);
  ns.needs = ns.needs.filter((p) => canBet(ns, p));
  if (ns.needs.length) {
    ns.turn = nextSeat(ns, seat, (p) => ns.needs.includes(p));
    return;
  }
  advanceStreet(ns);
}
