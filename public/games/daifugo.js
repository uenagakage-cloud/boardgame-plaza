// 大富豪のルール（サーバーとブラウザで共通）
// 2〜6人。53枚（ジョーカー1枚）を全員に配り切る。強さは 3<4<…<K<A<2<ジョーカー。
// 出せる組: 同じ数字の1〜4枚（ジョーカーは何にでもなる）、同じマークで3枚以上続く階段。
// 場と同じ組・同じ枚数で、より強いものだけ出せる。出せない・出さないときはパス。
// ほかの全員がパスしたら場が流れ、最後に出した人から始める。
// ルールは部屋を作るときに選べる（RULES）。ふつうは 8切り・革命・スペ3返し・階段・カード交換が入り、
// しばり・11バック・5飛ばし・7渡し・10捨て・12ボンバー・都落ち・反則上がりは入っていない。ジョーカーは0〜2枚。
// 7渡し・10捨て・12ボンバーは、出した人が続けて選ぶ（s.pending）。選び終わるまで次の人には回らない。
// 全員の順位が決まったらラウンド終了。次のラウンドは配り直して、
//   大貧民→大富豪に一番強い2枚、貧民→富豪に一番強い1枚を渡し、大富豪・富豪は好きなカードを同じ枚数返す。
// 手: { play: [カードid...] } / { pass: true } / { give: [カードid...] } 交換で返す / { next: true } ホストが次のラウンドへ
//     7渡し { give7: [カードid...] } / 10捨て { discard10: [カードid...] } / 12ボンバー { bomb: [数字...] }（ジョーカーは 16）
//     { resign: true }
export const id = 'daifugo';
export const title = '大富豪';
export const sideNames = Array.from({ length: 6 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 2;
export const maxPlayers = 6;
export const lobbyReturn = true;

// ルール: [キー, 名前, 説明, ふつうは入っているか]
export const RULES = [
  ['eightCut', '8切り', '8を出すと場が流れて、出した人から', true],
  ['revolution', '革命', '同じ数字4枚以上で強さが逆転', true],
  ['spade3', 'スペ3返し', 'ジョーカー1枚には♠3で勝てる', true],
  ['sequence', '階段', '同じマークで3枚以上続く数字を出せる', true],
  ['exchange', 'カード交換', '2ラウンド目から大貧民⇔大富豪・貧民⇔富豪で交換', true],
  ['shibari', 'しばり', '同じマークが続くと、場が流れるまでそのマークしか出せない', false],
  ['elevenBack', '11バック', 'Jを出すと、場が流れるまで強さが逆', false],
  ['fiveSkip', '5飛ばし', '5を出した枚数だけ次の人を飛ばす', false],
  ['sevenPass', '7渡し', '7を出した枚数だけ、好きなカードを次の人に渡す', false],
  ['tenDiscard', '10捨て', '10を出した枚数だけ、好きなカードを捨てる', false],
  ['queenBomber', '12ボンバー', 'Qを出した枚数だけ数字を選び、全員その数字のカードを捨てる', false],
  ['miyakoOchi', '都落ち', '大富豪が1番に上がれないと、その場で大貧民', false],
  ['foulFinish', '反則上がり', 'ジョーカー・2（革命中は3）・8で上がると大貧民', false],
];
export const JOKER_COUNTS = [0, 1, 2];
const DEFAULT_RULES = Object.fromEntries(RULES.map(([k, , , on]) => [k, on]));

export function normalizeOptions(o) {
  o = o || {};
  const rules = Object.fromEntries(RULES.map(([k, , , on]) => [k, typeof o[k] === 'boolean' ? o[k] : on]));
  const jokers = JOKER_COUNTS.includes(Number(o.jokers)) ? Number(o.jokers) : 1;
  return { ...rules, jokers };
}
// 部屋の一覧などに出す短い説明（入っているルール）
export const variantName = (o) => {
  const x = normalizeOptions(o);
  const on = RULES.filter(([k]) => x[k]).map(([, name]) => name);
  return [...on, `ジョーカー${x.jokers}枚`].join('・');
};

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

function makeDeck(jokers = 1) {
  const cards = [];
  for (const s of SUITS) for (let r = 3; r <= 15; r++) cards.push({ s, r });
  for (let k = 0; k < jokers; k++) cards.push({ s: 'j', r: JOKER });
  return cards.map((c, i) => ({ id: i, ...c }));
}

// 手札の並び（弱い順、同じ数字はマーク順）
export const sortHand = (hand) => hand.slice().sort((a, b) => a.r - b.r || SUITS.indexOf(a.s) - SUITS.indexOf(b.s));

// ---------- 組の判定 ----------
// 出したカードがどんな組になりうるかの候補。{ type: 'set'|'seq', n, key }（階段の key は一番下の数字）
export function combos(cards, rules = DEFAULT_RULES) {
  const n = cards.length;
  if (!n) return [];
  const normal = cards.filter((c) => c.s !== 'j');
  const jokers = n - normal.length;
  const out = [];
  if (!normal.length) {
    // ジョーカーだけ（2枚ならペア）
    out.push({ type: 'set', n, key: JOKER, joker: n === 1 });
    return out;
  }
  if (normal.every((c) => c.r === normal[0].r)) out.push({ type: 'set', n, key: normal[0].r });
  if (rules.sequence !== false && n >= 3 && normal.every((c) => c.s === normal[0].s) && new Set(normal.map((c) => c.r)).size === normal.length) {
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
function bestPlay(cands, field, rev, cards, rules = DEFAULT_RULES) {
  let best = null;
  for (const c of cands) {
    if (field) {
      if (c.type !== field.type || c.n !== field.n) continue;
      const spade3 = rules.spade3 && field.joker && c.n === 1 && cards[0].s === 's' && cards[0].r === 3; // スペ3返し
      if (!spade3 && !(strength(c.key, rev) > strength(field.key, rev))) continue;
    }
    if (!best || strength(c.key, rev) > strength(best.key, rev)) best = c;
  }
  return best;
}

const covers = (c, r) => (c.type === 'set' ? c.key === r : c.key <= r && r <= c.key + c.n - 1);
const isEightCut = (c) => covers(c, 8);
// 今の強さが逆かどうか（革命と11バックが両方なら元どおり）
export const reversed = (s) => !!s.revolution !== !!s.jback;
const rulesOf = (s) => s.options || DEFAULT_RULES;
const suitsOf = (cards) => cards.filter((c) => c.s !== 'j').map((c) => c.s).sort();
export const SUIT_ORDER_LABEL = (suits) => suits.map((x) => SUIT_MARK[x]).join('');

// 手札のカードで出せるか調べる。出せなければ理由つきで例外
export function checkPlay(s, seat, ids) {
  const hand = s.hands[seat] || [];
  const cards = ids.map((id) => hand.find((c) => c.id === id));
  if (!cards.length || cards.some((c) => !c) || new Set(ids).size !== ids.length) throw new Error('カードを選んでください');
  const rules = rulesOf(s);
  const cands = combos(cards, rules);
  if (!cands.length) throw new Error(rules.sequence ? 'その組み合わせは出せません（同じ数字か、同じマークの3枚以上の階段）' : 'その組み合わせは出せません（同じ数字だけ）');
  const field = s.field;
  const rev = reversed(s);
  const best = bestPlay(cands, field, rev, cards, rules);
  if (!best) {
    if (field && !cands.some((c) => c.type === field.type && c.n === field.n)) {
      throw new Error(`場と同じ形（${field.type === 'seq' ? '階段' : '同じ数字'}${field.n}枚）で出してください`);
    }
    throw new Error(rev ? '強さが逆なので、場より弱いカードを出してください' : '場より強いカードを出してください');
  }
  // しばり: 決まったマークしか出せない（ジョーカーはどのマークにもなる）
  if (s.lock) {
    const need = s.lock.slice();
    for (const x of suitsOf(cards)) {
      const i = need.indexOf(x);
      if (i < 0) throw new Error(`しばり中です。${SUIT_ORDER_LABEL(s.lock)} のカードしか出せません`);
      need.splice(i, 1);
    }
  }
  return { combo: best, cards };
}

// ---------- 状態 ----------
export function init(options, players = 2, rng) {
  const s = {
    options: normalizeOptions(options), jback: false, lock: null, penalty: [], pending: null,
    players, out: Array(players).fill(false), hands: [], round: 0,
    points: Array(players).fill(0), lastRanks: null, finished: [],
    phase: 'play', turn: 0, field: null, passed: Array(players).fill(false), revolution: false,
    exchange: [], lastPlay: null, turnNo: 0, result: null, history: [],
  };
  deal(s, rng);
  return s;
}

const label = (seat) => `P${seat + 1}`;
const playing = (s, p) => !s.out[p] && s.hands[p].length > 0 && !s.finished.includes(p) && !(s.penalty || []).includes(p);

function nextActive(s, from) {
  for (let k = 1; k <= s.players; k++) {
    const p = (from + k) % s.players;
    if (playing(s, p)) return p;
  }
  return -1;
}

function deal(s, rng) {
  const deck = shuffle(makeDeck(rulesOf(s).jokers ?? 1), rng);
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
  s.jback = false;
  s.lock = null;
  s.penalty = [];
  s.pending = null;
  s.lastPlay = null;
  s.exchange = [];
  s.history.push(`第${s.round}ラウンド`);

  const ranks = s.lastRanks;
  if (ranks && !rulesOf(s).exchange) {
    s.phase = 'play';
    s.turn = ranks.filter((p) => !s.out[p]).at(-1); // 交換なし: 大貧民から
  } else if (ranks) {
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

export const PENDING_TEXT = { seven: '7渡し', ten: '10捨て', bomber: '12ボンバー' };
export function phaseText(s, you) {
  if (s.pending && s.phase === 'play') {
    const e = s.pending.effects[0];
    if (you !== s.pending.by) return `${PENDING_TEXT[e.type]}を選んでいます…`;
    if (e.type === 'seven') return `7渡し：次の人に渡すカードを${e.count}枚選んでください`;
    if (e.type === 'ten') return `10捨て：捨てるカードを${e.count}枚選んでください`;
    return `12ボンバー：全員に捨てさせる数字を${e.count}つ選んでください`;
  }
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
  finished: s.finished.slice(), passed: s.passed.slice(), penalty: (s.penalty || []).slice(), exchange: s.exchange.map((e) => ({ ...e })), history: s.history.slice(),
});

function finishIfOver(ns) {
  const left = [...Array(ns.players).keys()].filter((p) => playing(ns, p));
  if (left.length > 1) return false;
  for (const p of left) ns.finished.push(p);
  // 反則上がり・都落ちの人は最後（先にそうなった人ほど下）
  const penalty = ns.penalty || [];
  const rest = [...Array(ns.players).keys()].filter((p) => !ns.finished.includes(p) && !penalty.includes(p));
  const order = [...ns.finished, ...rest, ...penalty.slice().reverse()];
  const n = order.length;
  order.forEach((p, i) => { if (!ns.out[p]) ns.points[p] += n - 1 - i; });
  ns.lastRanks = order;
  ns.phase = 'result';
  ns.field = null;
  ns.history.push('順位: ' + order.filter((p) => !ns.out[p]).map((p, i) => `${titleOf(i, order.filter((q) => !ns.out[q]).length)} ${label(p)}`).join(' / '));
  return true;
}

// 普通に上がった人を順位に入れる（都落ちの判定もここ）。履歴に足す文を返す
function finishPlayer(ns, prevRanks, p) {
  ns.finished.push(p);
  let note = ` ${label(p)} 上がり（${ns.finished.length}位）`;
  const prevTop = prevRanks && prevRanks.filter((q) => !ns.out[q])[0];
  if (rulesOf(ns).miyakoOchi && ns.finished.length === 1 && prevTop != null && prevTop !== p && playing(ns, prevTop)) {
    ns.penalty = [...(ns.penalty || []), prevTop];
    note += ` 都落ち！ ${label(prevTop)} は大貧民`;
  }
  return note;
}

// 出したあとの続き（8切りなら場を流す、そうでなければ次の人へ。5飛ばしの人数も）
function resumeAfterPlay(ns, seat, resume) {
  if (finishIfOver(ns)) return;
  if (resume.eight) { clearField(ns, seat); return; }
  let next = nextActive(ns, seat);
  for (let k = 0; k < resume.skips; k++) next = nextActive(ns, next);
  ns.turn = next;
}

function clearField(ns, leader) {
  ns.field = null;
  ns.lock = null;
  ns.jback = false;
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
    if (ns.pending && ns.pending.by === seat) ns.pending = null; // 選んでいる途中で抜けたら、その効果はなし
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

  if (s.pending) {
    const e = s.pending.effects[0];
    const hand = ns.hands[seat];
    let note;
    if (e.type === 'seven' || e.type === 'ten') {
      const ids = e.type === 'seven' ? mv.give7 : mv.discard10;
      if (!Array.isArray(ids)) throw new Error(`${PENDING_TEXT[e.type]}のカードを選んでください`);
      const need = Math.min(e.count, hand.length);
      if (ids.length !== need || new Set(ids).size !== ids.length) throw new Error(`${need}枚選んでください`);
      const cards = ids.map((id) => hand.find((c) => c.id === id));
      if (cards.some((c) => !c)) throw new Error('手札のカードを選んでください');
      ns.hands[seat] = hand.filter((c) => !ids.includes(c.id));
      if (e.type === 'seven') {
        const to = nextActive(ns, seat);
        ns.hands[to] = sortHand([...ns.hands[to], ...cards]);
        note = `${label(seat)} → ${label(to)} に7渡し（${cards.length}枚）`;
      } else {
        note = `${label(seat)} 10捨て（${sortHand(cards).map(cardLabel).join(' ')}）`;
      }
      if (!ns.hands[seat].length) note += finishPlayer(ns, s.lastRanks, seat);
    } else {
      const ranks = mv.bomb;
      if (!Array.isArray(ranks) || ranks.length !== e.count || new Set(ranks).size !== ranks.length
        || ranks.some((r) => !(Number.isInteger(r) && r >= 3 && r <= JOKER))) throw new Error(`数字を${e.count}つ選んでください`);
      const lost = [];
      // 出した人から順に、選ばれた数字のカードを全部捨てる。手札がなくなった人は上がり
      for (let k = 0; k < ns.players; k++) {
        const p = (seat + k) % ns.players;
        if (ns.out[p] || !ns.hands[p].length || ns.finished.includes(p) || (ns.penalty || []).includes(p)) continue;
        const before = ns.hands[p].length;
        ns.hands[p] = ns.hands[p].filter((c) => !ranks.includes(c.r));
        if (before !== ns.hands[p].length) lost.push(`${label(p)} ${before - ns.hands[p].length}枚`);
        if (!ns.hands[p].length) lost.push(finishPlayer(ns, s.lastRanks, p).trim());
      }
      note = `${label(seat)} 12ボンバー：${ranks.map(rankLabel).join('・')}（${lost.join('、') || '誰も持っていなかった'}）`;
    }
    ns.history.push(note);
    ns.turnNo++;
    const rest = s.pending.effects.slice(1).filter((x) => x.type === 'bomber' || ns.hands[seat].length);
    if (rest.length) {
      ns.pending = { ...s.pending, effects: rest.map((x) => (x.type === 'seven' ? { ...x, count: Math.min(x.count, ns.hands[seat].length) } : x)) };
      return ns;
    }
    ns.pending = null;
    resumeAfterPlay(ns, seat, s.pending.resume);
    return ns;
  }

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
    const rules = rulesOf(s);
    const { combo, cards } = checkPlay(s, seat, mv.play);
    const strongest = reversed(s) ? 3 : 15; // 出す前の一番強い数字（反則上がりの判定用）
    ns.hands[seat] = ns.hands[seat].filter((c) => !mv.play.includes(c.id));
    const suits = suitsOf(cards);
    let note = `${label(seat)} ${sortHand(cards).map(cardLabel).join(' ')}`;
    // しばり: 前と同じマークの組が続いたら、場が流れるまでそのマークだけ
    if (rules.shibari && s.field && !s.lock && s.field.suits && suits.length === cards.length
      && s.field.suits.length === suits.length && s.field.suits.join() === suits.join()) {
      ns.lock = suits;
      note += ` しばり（${SUIT_ORDER_LABEL(suits)}）`;
    }
    ns.field = { ...combo, cards, by: seat, suits };
    ns.lastPlay = { by: seat, cards };
    ns.passed = Array(ns.players).fill(false);
    if (rules.revolution && combo.type === 'set' && combo.n >= 4) {
      ns.revolution = !ns.revolution;
      note += ns.revolution ? ' 革命！' : ' 革命返し！';
    }
    if (rules.elevenBack && covers(combo, 11)) {
      ns.jback = !ns.jback;
      note += ' 11バック';
    }
    const done = ns.hands[seat].length === 0;
    if (done) {
      const foul = rules.foulFinish && cards.some((c) => c.s === 'j' || c.r === strongest || (rules.eightCut && c.r === 8));
      if (foul) {
        ns.penalty = [...(ns.penalty || []), seat];
        note += ' 反則上がり（大貧民）';
      } else {
        note += finishPlayer(ns, s.lastRanks, seat);
      }
    }
    ns.turnNo++;
    const eight = rules.eightCut && isEightCut(combo);
    if (eight) note += ' 8切り';
    // 5飛ばし: 出した5の枚数だけ次の人を飛ばす（8切りで流れるときは飛ばさない）
    const skips = rules.fiveSkip && !eight ? cards.filter((c) => c.r === 5).length : 0;
    if (skips) note += ` 5飛ばし（${skips}人）`;
    ns.history.push(note);
    // 7渡し・10捨て・12ボンバー（ジョーカーは数えない）。手札がなくなったら渡す・捨てるはなし
    const count = (r) => cards.filter((c) => c.s !== 'j' && c.r === r).length;
    const effects = [];
    if (rules.sevenPass && count(7) && !done && nextActive(ns, seat) >= 0) effects.push({ type: 'seven', count: Math.min(count(7), ns.hands[seat].length) });
    if (rules.tenDiscard && count(10) && !done) effects.push({ type: 'ten', count: count(10) });
    if (rules.queenBomber && count(12)) effects.push({ type: 'bomber', count: count(12) });
    if (effects.length) {
      ns.pending = { by: seat, effects, resume: { eight, skips } };
      ns.turn = seat;
      return ns;
    }
    resumeAfterPlay(ns, seat, { eight, skips });
    return ns;
  }
  throw new Error('不明な操作です');
}
