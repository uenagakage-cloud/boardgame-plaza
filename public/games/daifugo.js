// 大富豪のルール（サーバーとブラウザで共通）
// 2〜6人。53枚（ジョーカー1枚）を全員に配り切る。強さは 3<4<…<K<A<2<ジョーカー。
// 出せる組: 同じ数字の1〜4枚（ジョーカーは何にでもなる）、同じマークで3枚以上続く階段。
// 場と同じ組・同じ枚数で、より強いものだけ出せる。出せない・出さないときはパス。
// ほかの全員がパスしたら場が流れ、最後に出した人から始める。
// ルール: 8切り（8を含む組で場が流れて同じ人から）、革命（4枚以上の同じ数字で強さが逆転）、
//         スペ3返し（ジョーカー1枚には♠3で勝てる）。
// 全員の順位が決まったらラウンド終了。次のラウンドは配り直して、
//   大貧民→大富豪に一番強い2枚、貧民→富豪に一番強い1枚を渡し、大富豪・富豪は好きなカードを同じ枚数返す。
// 手: { play: [カードid...] } / { pass: true } / { give: [カードid...] } 交換で返す / { next: true } ホストが次のラウンドへ
//     { resign: true }
export const id = 'daifugo';
export const title = '大富豪';
export const sideNames = Array.from({ length: 6 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 2;
export const maxPlayers = 6;
export const lobbyReturn = true;

export const SUITS = ['s', 'h', 'd', 'c'];
export const SUIT_MARK = { s: '♠', h: '♥', d: '♦', c: '♣', j: '' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'JOKER' };
export const rankLabel = (r) => RANK_LABEL[r] || String(r);
export const cardLabel = (c) => (c.s === 'j' ? 'JOKER' : SUIT_MARK[c.s] + rankLabel(c.r));
const JOKER = 16;

export function titleOf(rank, n) {
  if (rank === 0) return '大富豪';
  if (rank === n - 1) return '大貧民';
  if (n >= 4 && rank === 1) return '富豪';
  if (n >= 4 && rank === n - 2) return '貧民';
  return '平民';
}

function shuffle(arr, rng) {
  const rand = rng ? (n) => rng(n) - 1 : (n) => Math.floor(Math.random() * n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeDeck() {
  const cards = [];
  for (const s of SUITS) for (let r = 3; r <= 15; r++) cards.push({ s, r });
  cards.push({ s: 'j', r: JOKER });
  return cards.map((c, i) => ({ id: i, ...c }));
}

// 手札の並び（弱い順、同じ数字はマーク順）
export const sortHand = (hand) => hand.slice().sort((a, b) => a.r - b.r || SUITS.indexOf(a.s) - SUITS.indexOf(b.s));

// ---------- 組の判定 ----------
// 出したカードがどんな組になりうるかの候補。{ type: 'set'|'seq', n, key }（階段の key は一番下の数字）
export function combos(cards) {
  const n = cards.length;
  if (!n) return [];
  const normal = cards.filter((c) => c.s !== 'j');
  const jokers = n - normal.length;
  const out = [];
  if (!normal.length) {
    if (n === 1) out.push({ type: 'set', n: 1, key: JOKER, joker: true });
    return out;
  }
  if (normal.every((c) => c.r === normal[0].r)) out.push({ type: 'set', n, key: normal[0].r });
  if (n >= 3 && normal.every((c) => c.s === normal[0].s) && new Set(normal.map((c) => c.r)).size === normal.length) {
    const lo = Math.min(...normal.map((c) => c.r)), hi = Math.max(...normal.map((c) => c.r));
    if (hi - lo + 1 <= n) {
      // ジョーカーで穴埋め・端の延長をした窓 [L, L+n-1]（3〜2の範囲）
      for (let L = Math.max(3, hi - n + 1); L <= Math.min(lo, 15 - n + 1); L++) out.push({ type: 'seq', n, key: L, jokers });
    }
  }
  return out;
}

const strength = (key, rev) => (key === JOKER ? Infinity : rev ? -key : key);

// 場に対して出せる候補のうち一番強いもの。出せなければ null
function bestPlay(cands, field, rev, cards) {
  let best = null;
  for (const c of cands) {
    if (field) {
      if (c.type !== field.type || c.n !== field.n) continue;
      const spade3 = field.joker && c.n === 1 && cards[0].s === 's' && cards[0].r === 3; // スペ3返し
      if (!spade3 && !(strength(c.key, rev) > strength(field.key, rev))) continue;
    }
    if (!best || strength(c.key, rev) > strength(best.key, rev)) best = c;
  }
  return best;
}

const isEightCut = (c) => (c.type === 'set' ? c.key === 8 : c.key <= 8 && 8 <= c.key + c.n - 1);

// 手札のカードで出せるか調べる。出せなければ理由つきで例外
export function checkPlay(s, seat, ids) {
  const hand = s.hands[seat] || [];
  const cards = ids.map((id) => hand.find((c) => c.id === id));
  if (!cards.length || cards.some((c) => !c) || new Set(ids).size !== ids.length) throw new Error('カードを選んでください');
  const cands = combos(cards);
  if (!cands.length) throw new Error('その組み合わせは出せません（同じ数字か、同じマークの3枚以上の階段）');
  const field = s.field;
  const best = bestPlay(cands, field, s.revolution, cards);
  if (!best) {
    if (field && !cands.some((c) => c.type === field.type && c.n === field.n)) {
      throw new Error(`場と同じ形（${field.type === 'seq' ? '階段' : '同じ数字'}${field.n}枚）で出してください`);
    }
    throw new Error(s.revolution ? '革命中なので、場より弱いカードを出してください' : '場より強いカードを出してください');
  }
  return { combo: best, cards };
}

// ---------- 状態 ----------
export function init(options, players = 2, rng) {
  const s = {
    players, out: Array(players).fill(false), hands: [], round: 0,
    points: Array(players).fill(0), lastRanks: null, finished: [],
    phase: 'play', turn: 0, field: null, passed: Array(players).fill(false), revolution: false,
    exchange: [], lastPlay: null, turnNo: 0, result: null, history: [],
  };
  deal(s, rng);
  return s;
}

const label = (seat) => `P${seat + 1}`;
const playing = (s, p) => !s.out[p] && s.hands[p].length > 0 && !s.finished.includes(p);

function nextActive(s, from) {
  for (let k = 1; k <= s.players; k++) {
    const p = (from + k) % s.players;
    if (playing(s, p)) return p;
  }
  return -1;
}

function deal(s, rng) {
  const deck = shuffle(makeDeck(), rng);
  const n = s.players;
  const seats = [...Array(n).keys()].filter((p) => !s.out[p]);
  s.hands = Array.from({ length: n }, () => []);
  deck.forEach((c, i) => s.hands[seats[i % seats.length]].push(c));
  s.hands = s.hands.map(sortHand);
  s.round += 1;
  s.finished = [];
  s.field = null;
  s.passed = Array(n).fill(false);
  s.revolution = false;
  s.lastPlay = null;
  s.exchange = [];
  s.history.push(`第${s.round}ラウンド`);

  const ranks = s.lastRanks;
  if (ranks) {
    // 前のラウンドの順位で交換。貧しい側は一番強いカードを自動で渡す
    const order = ranks.filter((p) => !s.out[p]);
    const m = order.length;
    const pairs = m >= 4 ? [[order[m - 1], order[0], 2], [order[m - 2], order[1], 1]] : m >= 2 ? [[order[m - 1], order[0], m >= 3 ? 2 : 1]] : [];
    for (const [poor, rich, count] of pairs) {
      const strongest = s.hands[poor].slice(-count);
      s.hands[poor] = s.hands[poor].slice(0, -count);
      s.hands[rich] = sortHand([...s.hands[rich], ...strongest]);
      s.exchange.push({ from: rich, to: poor, count, done: false, received: strongest.map((c) => c.id) });
      s.history.push(`${label(poor)} → ${label(rich)} に ${count}枚（${strongest.map(cardLabel).join(' ')}）`);
    }
    s.phase = s.exchange.length ? 'exchange' : 'play';
    s.turn = order[m - 1]; // 大貧民から
  } else {
    s.phase = 'play';
    s.turn = Math.max(0, s.hands.findIndex((h) => h.some((c) => c.s === 'd' && c.r === 3))); // ♦3を持つ人から
  }
}

export const canActOutOfTurn = (s) => s.phase !== 'play';

export function viewFor(s, seat) {
  return {
    ...s,
    hands: s.hands.map((h, i) => (i === seat || s.phase === 'result' ? h : null)),
    handCounts: s.hands.map((h) => h.length),
  };
}

export function phaseText(s, you) {
  if (s.phase === 'exchange') {
    const mine = s.exchange.find((e) => e.from === you && !e.done);
    return mine ? `カード交換：相手に返すカードを${mine.count}枚選んでください` : 'カード交換中…';
  }
  if (s.phase === 'result') return `第${s.round}ラウンド終了`;
  if (you !== s.turn) return null;
  return s.field ? 'あなたの番：場より強いカードを出すか、パスしてください' : 'あなたの番：好きなカードを出せます（親）';
}

export const scoreOf = (s, seat) => `${s.points[seat]}pt`;

const clone = (s) => ({
  ...s, out: s.out.slice(), hands: s.hands.map((h) => h.slice()), points: s.points.slice(),
  finished: s.finished.slice(), passed: s.passed.slice(), exchange: s.exchange.map((e) => ({ ...e })), history: s.history.slice(),
});

function finishIfOver(ns) {
  const left = [...Array(ns.players).keys()].filter((p) => playing(ns, p));
  if (left.length > 1) return false;
  for (const p of left) ns.finished.push(p);
  const order = [...ns.finished, ...[...Array(ns.players).keys()].filter((p) => !ns.finished.includes(p))];
  const n = order.length;
  order.forEach((p, i) => { if (!ns.out[p]) ns.points[p] += n - 1 - i; });
  ns.lastRanks = order;
  ns.phase = 'result';
  ns.field = null;
  ns.history.push('順位: ' + order.filter((p) => !ns.out[p]).map((p, i) => `${titleOf(i, order.filter((q) => !ns.out[q]).length)} ${label(p)}`).join(' / '));
  return true;
}

function clearField(ns, leader) {
  ns.field = null;
  ns.passed = Array(ns.players).fill(false);
  ns.turn = playing(ns, leader) ? leader : nextActive(ns, leader);
}

export function applyMove(s, mv, seat, rng, ctx = {}) {
  mv = mv || {};
  if (s.out[seat]) throw new Error('投了しています');
  const ns = clone(s);

  if (mv.resign) {
    ns.out[seat] = true;
    ns.hands[seat] = [];
    ns.history.push(`${label(seat)} が投了`);
    ns.exchange = ns.exchange.filter((e) => e.from !== seat && e.to !== seat);
    if (ns.phase === 'exchange' && ns.exchange.every((e) => e.done)) ns.phase = 'play';
    if (ns.phase === 'play' && !finishIfOver(ns) && ns.turn === seat) ns.turn = nextActive(ns, seat);
    if (ns.field && ns.field.by === seat && ns.phase === 'play') {
      const others = [...Array(ns.players).keys()].filter((p) => playing(ns, p) && !ns.passed[p]);
      if (!others.length) clearField(ns, seat);
    }
    return ns;
  }

  if (mv.next) {
    if (s.phase !== 'result') return s;
    if (seat !== ctx.hostSeat) throw new Error('ホストだけが次のラウンドに進めます');
    deal(ns, rng);
    return ns;
  }

  if (mv.give) {
    const ex = ns.exchange.find((e) => e.from === seat && !e.done);
    if (s.phase !== 'exchange' || !ex) throw new Error('今はカードを渡せません');
    const ids = mv.give;
    if (!Array.isArray(ids) || ids.length !== ex.count || new Set(ids).size !== ids.length) throw new Error(`${ex.count}枚選んでください`);
    const cards = ids.map((id) => ns.hands[seat].find((c) => c.id === id));
    if (cards.some((c) => !c)) throw new Error('手札のカードを選んでください');
    ns.hands[seat] = ns.hands[seat].filter((c) => !ids.includes(c.id));
    ns.hands[ex.to] = sortHand([...ns.hands[ex.to], ...cards]);
    ex.done = true;
    ex.given = ids;
    ns.history.push(`${label(seat)} → ${label(ex.to)} に ${ex.count}枚返す`);
    if (ns.exchange.every((e) => e.done)) ns.phase = 'play';
    return ns;
  }

  if (s.phase !== 'play') throw new Error('今は出せません');
  if (s.turn !== seat) throw new Error('あなたの番ではありません');

  if (mv.pass) {
    if (!s.field) throw new Error('親はパスできません。好きなカードを出してください');
    ns.passed[seat] = true;
    ns.history.push(`${label(seat)} パス`);
    const others = [...Array(ns.players).keys()].filter((p) => p !== ns.field.by && playing(ns, p) && !ns.passed[p]);
    if (!others.length) {
      ns.history.push('場が流れました');
      clearField(ns, ns.field.by);
    } else {
      ns.turn = nextActive(ns, seat);
    }
    ns.turnNo++;
    return ns;
  }

  if (mv.play) {
    const { combo, cards } = checkPlay(s, seat, mv.play);
    ns.hands[seat] = ns.hands[seat].filter((c) => !mv.play.includes(c.id));
    ns.field = { ...combo, cards, by: seat };
    ns.lastPlay = { by: seat, cards };
    ns.passed = Array(ns.players).fill(false);
    let note = `${label(seat)} ${sortHand(cards).map(cardLabel).join(' ')}`;
    if (combo.type === 'set' && combo.n >= 4) {
      ns.revolution = !ns.revolution;
      note += ns.revolution ? ' 革命！' : ' 革命返し！';
    }
    const done = ns.hands[seat].length === 0;
    if (done) { ns.finished.push(seat); note += ` 上がり（${ns.finished.length}位）`; }
    ns.turnNo++;
    if (isEightCut(combo)) {
      note += ' 8切り';
      ns.history.push(note);
      if (!finishIfOver(ns)) clearField(ns, seat);
      return ns;
    }
    ns.history.push(note);
    if (finishIfOver(ns)) return ns;
    ns.turn = nextActive(ns, seat);
    return ns;
  }
  throw new Error('不明な操作です');
}
