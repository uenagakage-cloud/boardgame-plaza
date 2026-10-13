// ワンナイト人狼のルール（サーバーとブラウザで共通）
// 3〜6人。役職カードは人数＋2枚（2枚は中央に伏せる）。
//   構成: 人狼×2・占い師・怪盗・村人（5人以上なら村人1枚の代わりに狂人）
// 夜: 全員が同時に行動する。人狼は仲間を知る（1人なら中央を1枚見られる）。占い師は誰か1人か中央2枚を見る。
//     怪盗は誰かとカードを交換して新しい役職を知る（しなくてもよい）。占い師が見るのは交換前のカード。
// 昼: 話し合って処刑したい人に投票（自分以外）。最多得票の人が処刑（同数なら全員）。全員1票ずつなら誰も処刑されない。
// 勝敗（夜明け後のカードで判定）:
//   人狼が参加者にいる → 人狼を1人でも処刑すれば村人陣営の勝ち、そうでなければ人狼陣営（人狼・狂人）の勝ち
//   人狼が参加者にいない → 誰も処刑されなければ村人陣営の勝ち。誰かを処刑したら狂人だけの勝ち（いなければ全員の負け）
// 手: { night: { look?: 席, center?: [番号...], swap?: 席 } } / { vote: 席 } / { resign: true }
export const id = 'werewolf';
export const title = 'ワンナイト人狼';
export const sideNames = ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4', 'プレイヤー5', 'プレイヤー6'];
export const minPlayers = 3;
export const maxPlayers = 6;
export const TEAM_NAMES = ['村人陣営', '人狼陣営'];

export const ROLES = {
  wolf: { name: '人狼', team: 1, desc: '仲間の人狼を知ります。1人だけなら中央のカードを1枚見られます。処刑されなければ勝ち。' },
  seer: { name: '占い師', team: 0, desc: '誰か1人のカードか、中央のカード2枚を見られます（見なくてもよい）。' },
  thief: { name: '怪盗', team: 0, desc: '誰かとカードを交換し、新しい役職になれます（交換しなくてもよい）。' },
  villager: { name: '村人', team: 0, desc: '夜は何もしません。話し合いで人狼を見つけよう。' },
  madman: { name: '狂人', team: 1, desc: '人狼の味方をする人間です。誰が人狼かは知りませんが、人狼陣営が勝てばあなたも勝ち。' },
};

export function composition(players) {
  const cards = ['wolf', 'wolf', 'seer', 'thief'];
  if (players >= 5) cards.push('madman');
  while (cards.length < players + 2) cards.push('villager');
  return cards;
}

function shuffle(arr, rng) {
  const rand = rng ? (n) => rng(n) - 1 : (n) => Math.floor(Math.random() * n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function init(options, players = 3, rng) {
  const cards = shuffle(composition(players), rng);
  return {
    players, roles: cards.slice(0, players), center: cards.slice(players),
    final: null, out: Array(players).fill(false),
    phase: 'night', night: Array.from({ length: players }, () => ({ done: false, info: [] })),
    swap: null, votes: Array(players).fill(null), executed: null,
    turn: 0, result: null, history: [],
  };
}

export const canActOutOfTurn = () => true;
const roleName = (r) => ROLES[r].name;
const wolvesOf = (roles) => roles.map((r, i) => (r === 'wolf' ? i : -1)).filter((i) => i >= 0);
const activeSeats = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);

// 夜の行動が要るか（人狼・村人・狂人は確認するだけ）
export function nightOptions(s, seat) {
  const role = s.roles[seat];
  if (role === 'seer') return 'seer';
  if (role === 'thief') return 'thief';
  if (role === 'wolf' && wolvesOf(s.roles).length === 1) return 'lonewolf';
  return 'none';
}

// 他の人の役職・中央・夜の行動・投票先は隠す（終局後はすべて公開）
export function viewFor(s, seat) {
  if (s.result) return s;
  const me = seat >= 0 ? s.roles[seat] : null;
  return {
    ...s,
    roles: s.roles.map((r, i) => (i === seat ? r : null)),
    center: null, final: null, swap: null,
    night: s.night.map((n, i) => (i === seat ? n : { done: n.done, info: [] })),
    votes: s.votes.map((v, i) => (v === null ? null : i === seat ? v : 'voted')),
    wolves: me === 'wolf' ? wolvesOf(s.roles) : null,
    cardCount: s.players + 2,
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (you < 0 || s.out[you]) return s.phase === 'night' ? '夜です。みんなが行動しています…' : '昼の話し合いと投票の時間です';
  if (s.phase === 'night') {
    if (s.night[you].done) return '夜の行動を終えました。ほかの人を待っています…';
    return '夜です：あなたの役職を確認して行動してください';
  }
  return s.votes[you] === null ? '昼です：チャットで話し合って、処刑する人に投票してください' : '投票しました（全員がそろうまで変更できます）';
}

export const scoreOf = () => '';

const clone = (s) => ({
  ...s, out: s.out.slice(), night: s.night.map((n) => ({ ...n, info: n.info.slice() })),
  votes: s.votes.slice(), history: s.history.slice(),
});

function label(seat) { return `P${seat + 1}`; }

function doNight(s, ns, seat, act) {
  const kind = nightOptions(s, seat);
  const n = ns.night[seat];
  const role = s.roles[seat];
  if (role === 'wolf') {
    const others = wolvesOf(s.roles).filter((p) => p !== seat);
    n.info.push(others.length ? `仲間の人狼は ${others.map(label).join('・')} です` : '人狼はあなた1人です');
  }
  if (kind === 'lonewolf' && Array.isArray(act.center) && act.center.length) {
    const i = act.center[0];
    if (!(i in s.center)) throw new Error('中央のカードを選んでください');
    n.info.push(`中央のカード${i + 1}は「${roleName(s.center[i])}」でした`);
  }
  if (kind === 'seer') {
    if (act.look != null) {
      if (act.look === seat || !(act.look in s.roles)) throw new Error('占う相手を選んでください');
      n.info.push(`${label(act.look)} は「${roleName(s.roles[act.look])}」でした`);
    } else if (!Array.isArray(act.center) || !act.center.length) {
      n.info.push('占いをしませんでした');
    } else if (act.center.length === 2 && act.center[0] !== act.center[1] && act.center.every((i) => i in s.center)) {
      n.info.push(...act.center.map((i) => `中央のカード${i + 1}は「${roleName(s.center[i])}」でした`));
    } else {
      throw new Error('1人を占うか、中央のカードを2枚選んでください');
    }
  }
  if (kind === 'thief') {
    if (act.swap != null) {
      if (act.swap === seat || !(act.swap in s.roles)) throw new Error('交換する相手を選んでください');
      ns.swap = { thief: seat, target: act.swap };
      n.info.push(`${label(act.swap)} とカードを交換しました。あなたは今「${roleName(s.roles[act.swap])}」です`);
    } else {
      n.info.push('カードを交換しませんでした');
    }
  }
  if (role === 'villager' || role === 'madman') n.info.push('夜の行動はありません');
  n.done = true;
}

function startDayIfReady(ns) {
  if (ns.phase !== 'night' || !activeSeats(ns).every((p) => ns.night[p].done)) return;
  const final = ns.roles.slice();
  if (ns.swap) {
    final[ns.swap.thief] = ns.roles[ns.swap.target];
    final[ns.swap.target] = 'thief';
  }
  ns.final = final;
  ns.phase = 'day';
  ns.history.push('夜が明けました');
}

function resolveIfVoted(ns) {
  const voters = activeSeats(ns);
  if (ns.phase !== 'day' || voters.some((p) => ns.votes[p] === null)) return;
  const count = Array(ns.players).fill(0);
  for (const p of voters) count[ns.votes[p]]++;
  const max = Math.max(...count);
  ns.executed = max <= 1 ? [] : count.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
  ns.voteCount = count;

  const team = (r) => ROLES[r].team;
  const wolvesInPlay = ns.final.some((r) => r === 'wolf');
  let winTeam, reason;
  const executedNames = ns.executed.map(label).join('・');
  if (wolvesInPlay) {
    const wolfDied = ns.executed.some((p) => ns.final[p] === 'wolf');
    winTeam = wolfDied ? 0 : 1;
    reason = ns.executed.length ? `${executedNames} を処刑。${wolfDied ? '人狼を退治しました' : '人狼は生き残りました'}` : '誰も処刑されず、人狼は生き残りました';
  } else if (!ns.executed.length) {
    winTeam = 0;
    reason = '人狼はいませんでした。誰も処刑されず平和な村です';
  } else {
    winTeam = null;
    reason = `人狼はいなかったのに ${executedNames} を処刑してしまいました`;
  }
  let winners;
  if (winTeam === null) winners = ns.final.map((r, i) => (r === 'madman' ? i : -1)).filter((i) => i >= 0);
  else winners = ns.final.map((r, i) => (team(r) === winTeam ? i : -1)).filter((i) => i >= 0);
  if (winTeam === null && winners.length) { winTeam = 1; reason += '（狂人の勝ち）'; }
  ns.result = { winner: null, winners, team: winners.length ? winTeam : null, reason: winners.length ? reason : `${reason}。全員の負け`, allLose: !winners.length };
  ns.history.push(ns.executed.length ? `${executedNames} を処刑` : '処刑なし');
}

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (s.out[seat]) throw new Error('抜けています');
  const ns = clone(s);

  if (mv.resign) {
    ns.out[seat] = true;
    ns.votes = ns.votes.map((v, i) => (i === seat ? null : v));
    ns.history.push(`${label(seat)} が抜けました`);
    startDayIfReady(ns);
    resolveIfVoted(ns);
    return ns;
  }
  if (mv.night) {
    if (s.phase !== 'night') throw new Error('夜の行動はもう終わりました');
    if (s.night[seat].done) throw new Error('もう行動しました');
    doNight(s, ns, seat, mv.night);
    startDayIfReady(ns);
    return ns;
  }
  if (mv.vote != null) {
    if (s.phase !== 'day') throw new Error('まだ投票できません');
    if (mv.vote === seat || !(mv.vote in s.roles) || s.out[mv.vote]) throw new Error('その人には投票できません');
    ns.votes[seat] = mv.vote;
    resolveIfVoted(ns);
    return ns;
  }
  throw new Error('不明な操作です');
}
