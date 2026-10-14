// スカルのルール（サーバーとブラウザで共通）
// 3〜6人。各自コースター4枚（花3枚・ドクロ1枚）を持つ。
// 1. 全員が1枚ずつ伏せて置く。
// 2. 手番の人は「もう1枚置く」か「入札（何枚めくれるか宣言）」する。手持ちがなければ入札するしかない。
// 3. 入札が始まったら、手番の人は数を上げるかパス。場の枚数まで上がるか、ほかの全員がパスしたら最高入札者が挑戦。
// 4. 挑戦者はまず自分の山を全部めくり、次にほかの人の山を上から好きにめくる。宣言した枚数ぶん花ならば成功。
//    途中でドクロが出たら失敗し、挑戦者はコースターを1枚（ランダム）失う。0枚になったら脱落。
// 5. 成功2回か、最後の1人になったら勝ち。次のラウンドは挑戦者（失敗したらドクロの持ち主）から始める。
// 手: { place: 'flower'|'skull' } / { bid: 数 } / { pass: true } / { flip: 席 } / { resign: true }
export const id = 'skull';
export const title = 'スカル';
export const sideNames = Array.from({ length: 6 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 3;
export const maxPlayers = 6;
export const lobbyReturn = true;
export const WIN_POINTS = 2;
export const NEXT_ROUND_MS = 5000;

const label = (seat) => `P${seat + 1}`;
const alive = (s, p) => !s.out[p];
const aliveSeats = (s) => [...Array(s.players).keys()].filter((p) => alive(s, p));
const handCount = (h) => h.flower + h.skull;
export const tableCount = (s) => s.stacks.reduce((a, st) => a + st.length, 0);

function nextSeat(s, from, pred = (p) => alive(s, p)) {
  for (let k = 1; k <= s.players; k++) {
    const p = (from + k) % s.players;
    if (pred(p)) return p;
  }
  return -1;
}

export function init(options, players = 3, rng) {
  const s = {
    players, out: Array(players).fill(false), points: Array(players).fill(0),
    owned: Array.from({ length: players }, () => ({ flower: 3, skull: 1 })),
    hands: [], stacks: [], revealed: [], phase: 'place', turn: 0,
    first: rng ? rng(players) - 1 : 0, bid: null, passed: [], challenger: -1, flowersFound: 0,
    lastRound: null, lost: Array(players).fill(null), tickAt: null, result: null, history: [],
  };
  startRound(s);
  return s;
}

function startRound(s) {
  s.hands = s.owned.map((o) => ({ ...o }));
  s.stacks = Array.from({ length: s.players }, () => []);
  s.revealed = Array(s.players).fill(0);
  s.phase = 'place';
  if (!alive(s, s.first)) s.first = nextSeat(s, s.first);
  s.turn = s.first;
  s.bid = null;
  s.passed = Array(s.players).fill(false);
  s.challenger = -1;
  s.flowersFound = 0;
  s.tickAt = null;
  s.history.push(`新しいラウンド（${label(s.first)} から）`);
}

export const canActOutOfTurn = (s) => s.phase === 'place';

// ほかの人の山の中身・手持ちの内訳は隠す（めくられた分だけ見せる）
export function viewFor(s, seat) {
  return {
    ...s,
    stacks: s.stacks.map((st, i) => (i === seat ? st : st.map((d, k) => (k >= st.length - s.revealed[i] ? d : 'hidden')))),
    hands: s.hands.map((h, i) => (i === seat ? h : { count: handCount(h) })),
    owned: s.owned.map((o, i) => (i === seat ? o : { count: handCount(o) })),
    lost: s.lost.map((l, i) => (i === seat ? l : null)),
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (you < 0 || !alive(s, you)) return null;
  if (s.phase === 'place') return s.stacks[you].length ? 'ほかの人が1枚目を置くのを待っています…' : '1枚目のコースターを伏せて置いてください';
  if (s.phase === 'roundEnd') return 'ラウンド終了。まもなく次のラウンド';
  if (you !== s.turn) return null;
  if (s.phase === 'build') return handCount(s.hands[you]) ? 'コースターをもう1枚置くか、入札してください' : '手持ちがないので入札してください';
  if (s.phase === 'bid') return `入札：${s.bid.n}枚より多く宣言するか、パスしてください`;
  if (s.phase === 'reveal') return `ほかの人の山をめくろう（あと ${s.bid.n - s.flowersFound}枚）`;
  return null;
}

export const scoreOf = (s, seat) => `${s.points[seat]}勝`;

const clone = (s) => ({
  ...s, out: s.out.slice(), points: s.points.slice(), owned: s.owned.map((o) => ({ ...o })), hands: s.hands.map((h) => ({ ...h })),
  stacks: s.stacks.map((st) => st.slice()), revealed: s.revealed.slice(), passed: s.passed.slice(), lost: s.lost.slice(), history: s.history.slice(),
});

function checkWinner(ns) {
  const left = aliveSeats(ns);
  const champ = ns.points.findIndex((p) => p >= WIN_POINTS);
  if (champ >= 0) ns.result = { winner: champ, reason: `挑戦に${WIN_POINTS}回成功` };
  else if (left.length === 1) ns.result = { winner: left[0], reason: '最後の1人' };
  if (ns.result) { ns.phase = 'end'; ns.tickAt = null; ns.turn = -1; }
  return !!ns.result;
}

function endRound(ns, success, skullOwner, rng) {
  const c = ns.challenger;
  if (success) {
    ns.points[c] += 1;
    ns.lastRound = { challenger: c, success: true };
    ns.history.push(`${label(c)} が挑戦成功！（${ns.points[c]}回目）`);
    ns.first = c;
  } else {
    // 挑戦者は持っているコースターをランダムに1枚失う
    const o = ns.owned[c];
    const total = handCount(o);
    const pick = rng ? rng(total) - 1 : Math.floor(Math.random() * total);
    const type = pick < o.flower ? 'flower' : 'skull';
    o[type] -= 1;
    ns.lost[c] = type;
    ns.lastRound = { challenger: c, success: false, skullOwner };
    ns.history.push(`${label(c)} が挑戦失敗（${label(skullOwner)} のドクロ）。コースターを1枚失いました`);
    if (handCount(o) === 0) { ns.out[c] = true; ns.history.push(`${label(c)} は脱落`); }
    ns.first = alive(ns, skullOwner) ? skullOwner : c;
  }
  if (checkWinner(ns)) return;
  ns.phase = 'roundEnd';
  ns.turn = -1;
  ns.tickAt = Date.now() + NEXT_ROUND_MS;
}

// 次のラウンドへ（サーバーが呼ぶ）
export function tick(s) {
  if (s.phase !== 'roundEnd') return { ...s, tickAt: null };
  const ns = clone(s);
  startRound(ns);
  return ns;
}

// 挑戦開始: まず自分の山を全部めくる
function startChallenge(ns, seat, rng) {
  ns.phase = 'reveal';
  ns.challenger = seat;
  ns.turn = seat;
  ns.history.push(`${label(seat)} が ${ns.bid.n}枚に挑戦！`);
  const own = ns.stacks[seat];
  for (let k = own.length - 1; k >= 0; k--) {
    ns.revealed[seat] += 1;
    if (own[k] === 'skull') return endRound(ns, false, seat, rng);
    ns.flowersFound += 1;
    if (ns.flowersFound >= ns.bid.n) return endRound(ns, true, -1, rng);
  }
}

function nextBidder(ns, from) {
  return nextSeat(ns, from, (p) => alive(ns, p) && !ns.passed[p]);
}

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (!alive(s, seat)) throw new Error('脱落しています');
  const ns = clone(s);

  if (mv.resign) {
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (checkWinner(ns)) return ns;
    if (ns.phase === 'reveal' && ns.challenger === seat) { ns.phase = 'roundEnd'; ns.turn = -1; ns.tickAt = Date.now() + NEXT_ROUND_MS; return ns; }
    if (ns.phase === 'place' && aliveSeats(ns).every((p) => ns.stacks[p].length)) ns.phase = 'build';
    if (ns.turn === seat && (ns.phase === 'build' || ns.phase === 'bid')) {
      ns.turn = ns.phase === 'bid' ? nextBidder(ns, seat) : nextSeat(ns, seat);
      if (ns.phase === 'bid' && aliveSeats(ns).filter((p) => !ns.passed[p]).length === 1) startChallenge(ns, ns.bid.seat, rng);
    }
    return ns;
  }

  if (mv.place) {
    const type = mv.place === 'skull' ? 'skull' : 'flower';
    if (s.phase === 'place') {
      if (s.stacks[seat].length) throw new Error('1枚目はもう置きました');
    } else if (s.phase === 'build') {
      if (s.turn !== seat) throw new Error('あなたの番ではありません');
    } else throw new Error('今は置けません');
    if (!ns.hands[seat][type]) throw new Error(type === 'skull' ? 'ドクロは持っていません' : '花は持っていません');
    ns.hands[seat][type] -= 1;
    ns.stacks[seat].push(type);
    if (s.phase === 'place') {
      if (aliveSeats(ns).every((p) => ns.stacks[p].length)) { ns.phase = 'build'; ns.turn = ns.first; ns.history.push('全員が1枚目を置きました'); }
    } else {
      ns.history.push(`${label(seat)} がもう1枚置きました`);
      ns.turn = nextSeat(ns, seat);
    }
    return ns;
  }

  if (mv.bid != null) {
    if ((s.phase !== 'build' && s.phase !== 'bid') || s.turn !== seat) throw new Error('あなたの番ではありません');
    const n = Math.floor(Number(mv.bid));
    const max = tableCount(s);
    const min = s.bid ? s.bid.n + 1 : 1;
    if (!(n >= min && n <= max)) throw new Error(`${min}〜${max}枚で宣言してください`);
    ns.bid = { seat, n };
    ns.phase = 'bid';
    ns.history.push(`${label(seat)} が ${n}枚と宣言`);
    if (n === max || aliveSeats(ns).filter((p) => !ns.passed[p]).length === 1) startChallenge(ns, seat, rng);
    else ns.turn = nextBidder(ns, seat);
    return ns;
  }

  if (mv.pass) {
    if (s.phase !== 'bid' || s.turn !== seat) throw new Error('今はパスできません');
    ns.passed[seat] = true;
    ns.history.push(`${label(seat)} パス`);
    const still = aliveSeats(ns).filter((p) => !ns.passed[p]);
    if (still.length === 1) startChallenge(ns, ns.bid.seat, rng);
    else ns.turn = nextBidder(ns, seat);
    return ns;
  }

  if (mv.flip != null) {
    if (s.phase !== 'reveal' || seat !== s.challenger) throw new Error('今はめくれません');
    const t = Number(mv.flip);
    if (t === seat) throw new Error('自分の山はもうめくりました');
    const st = ns.stacks[t];
    if (!st || ns.revealed[t] >= st.length) throw new Error('その山にはもうめくれるコースターがありません');
    const disc = st[st.length - 1 - ns.revealed[t]];
    ns.revealed[t] += 1;
    if (disc === 'skull') { endRound(ns, false, t, rng); return ns; }
    ns.flowersFound += 1;
    if (ns.flowersFound >= ns.bid.n) endRound(ns, true, -1, rng);
    return ns;
  }
  throw new Error('不明な操作です');
}
