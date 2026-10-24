// ハゲタカのえじき（サーバーとブラウザで共通）
// 2〜6人。全員が 1〜15 のカードを1枚ずつ持つ。得点カード（-5〜-1、1〜10 の15枚）を1枚ずつめくり、
// 全員がこっそり手札から1枚出す（決まるまで出し直せる）。全員出したら同時に見せる。
// 得点がプラスなら一番大きい数、マイナスなら一番小さい数を出した人が得点カードを取る。
// ただし同じ数を出した人どうしは打ち消し合って無効（その次の人が取る）。全員打ち消し合ったら、得点カードは次の回に持ち越し。
// 15回で終わり、合計点が一番多い人の勝ち。
// 手: { play: 数 } / { resign: true }
export const id = 'hagetaka';
export const title = 'ハゲタカのえじき';
export const sideNames = Array.from({ length: 6 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 2;
export const maxPlayers = 6;
export const lobbyReturn = true;
export const logTitle = 'ログ（記憶力のゲームなので、終わってから見られます）';
export const REVEAL_MS = 4000;
export const HAND = Array.from({ length: 15 }, (_, i) => i + 1);
export const POINTS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function shuffle(arr, rng) {
  const rand = rng ? (n) => rng(n) - 1 : (n) => Math.floor(Math.random() * n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const label = (seat) => `P${seat + 1}`;
const active = (s) => [...Array(s.players).keys()].filter((p) => !s.out[p]);

export function init(options, players = 2, rng) {
  const s = {
    players, out: Array(players).fill(false), hands: Array.from({ length: players }, () => HAND.slice()),
    scores: Array(players).fill(0), taken: Array.from({ length: players }, () => []),
    deck: shuffle(POINTS.slice(), rng), current: null, pot: [], played: Array(players).fill(null),
    phase: 'choose', round: 0, last: null, tickAt: null, endsAt: null, turn: 0, result: null, history: [],
  };
  nextCard(s);
  return s;
}

function nextCard(s) {
  s.round += 1;
  s.current = s.deck.pop();
  s.played = Array(s.players).fill(null);
  s.phase = 'choose';
  s.tickAt = null;
  s.endsAt = null;
}

// 全員出したら勝ち負けを決める
export function resolve(points, played, live) {
  const counts = {};
  for (const p of live) counts[played[p]] = (counts[played[p]] || 0) + 1;
  const unique = live.filter((p) => counts[played[p]] === 1);
  if (!unique.length) return null;
  const sorted = unique.sort((a, b) => played[a] - played[b]);
  return points > 0 ? sorted[sorted.length - 1] : sorted[0];
}

function reveal(s) {
  const live = active(s);
  const prize = [...s.pot, s.current];
  const winner = resolve(s.current, s.played, live);
  const plays = live.map((p) => `${label(p)}:${s.played[p]}`).join(' ');
  if (winner == null) {
    s.pot = prize;
    s.history.push(`得点${fmt(s.current)} → ${plays} 全員打ち消し合い、次に持ち越し`);
  } else {
    s.pot = [];
    s.taken[winner].push(...prize);
    s.scores[winner] += prize.reduce((a, b) => a + b, 0);
    s.history.push(`得点${prize.map(fmt).join('+')} → ${plays} ${label(winner)} が取った`);
  }
  s.last = { points: prize, played: s.played.slice(), winner };
  s.phase = 'reveal';
  s.tickAt = Date.now() + REVEAL_MS;
  s.endsAt = s.tickAt;
}

export const fmt = (n) => (n > 0 ? `+${n}` : String(n));

function finish(s) {
  s.phase = 'end';
  s.tickAt = null;
  s.endsAt = null;
  const live = active(s);
  const best = Math.max(...live.map((p) => s.scores[p]));
  const top = live.filter((p) => s.scores[p] === best);
  s.result = top.length === 1 ? { winner: top[0], reason: `${best}点` } : { winner: null, reason: `${best}点で同点` };
}

export function tick(s) {
  const ns = clone(s);
  if (s.phase === 'reveal') {
    if (!ns.deck.length || active(ns).length < 2) finish(ns);
    else nextCard(ns);
    return ns;
  }
  return { ...s, tickAt: null };
}

export const canActOutOfTurn = () => true;

// 出したカードは、全員出し終わるまで見せない（出したかどうかだけ）
export function viewFor(s, seat) {
  return {
    ...s, deck: null, deckCount: s.deck.length,
    // 記憶力のゲームなので、だれが何を出したかのログは終わるまで見せない
    history: s.result ? s.history : [],
    // 観戦者・抜けた人・終わったあとは、全員の手札が見える
    seesAll: seat < 0 || !!s.result || !!s.out[seat],
    hands: s.hands.map((h, i) => (i === seat || s.result || seat < 0 || s.out[seat] ? h : null)),
    handCounts: s.hands.map((h) => h.length),
    played: s.played.map((x, i) => (i === seat || s.phase !== 'choose' ? x : x != null ? 0 : null)),
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'choose') return you >= 0 && !s.out[you] ? (s.played[you] != null ? 'ほかの人を待っています（出し直せます）' : '出すカードを選んでください') : '選んでいます…';
  if (s.phase === 'reveal') return '結果！ まもなく次のカード';
  return null;
}

export const scoreOf = (s, seat) => `${s.scores[seat]}点`;

const clone = (s) => ({
  ...s, out: s.out.slice(), hands: s.hands.map((h) => h.slice()), scores: s.scores.slice(), taken: s.taken.map((t) => t.slice()),
  deck: s.deck.slice(), pot: s.pot.slice(), played: s.played.slice(), history: s.history.slice(),
});

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    if (s.out[seat]) return s;
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (active(ns).length < 2) { finish(ns); return ns; }
    if (s.phase === 'choose' && active(ns).every((p) => ns.played[p] != null)) {
      for (const p of active(ns)) ns.hands[p] = ns.hands[p].filter((x) => x !== ns.played[p]);
      reveal(ns);
    }
    return ns;
  }
  if (s.out[seat]) throw new Error('抜けています');
  if (mv.play == null) throw new Error('不明な操作です');
  if (s.phase !== 'choose') throw new Error('今は出せません');
  const n = Number(mv.play);
  if (!s.hands[seat].includes(n)) throw new Error('そのカードは持っていません');
  ns.played[seat] = n;
  if (active(ns).every((p) => ns.played[p] != null)) {
    for (const p of active(ns)) ns.hands[p] = ns.hands[p].filter((x) => x !== ns.played[p]);
    reveal(ns);
  }
  return ns;
}
