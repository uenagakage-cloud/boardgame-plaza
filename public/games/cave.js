// 洞窟脱出ジャンプ（ゲームいっぱいの部屋で遊ぶとき。サーバーとブラウザで共通）
// 1〜8人。ゲームそのもの（物理・描画）は public/cave/index.html を部屋の画面に埋めこんで、各自のブラウザで動かす。
// この部屋がするのは、みんな同時のスタート（カウントダウン）・ゴールの記録・順位だけ。位置は /cave/ws で配る（cave-relay.js）。
// 全員がゴールするか、制限時間（30分）で終わり。いちばん早くゴールした人の勝ち。
// 手: { finish: { jumps, falls } } ゴール（タイムはサーバーが数える。1/60 秒単位の frames で持つ）/ { resign: true }
export const id = 'cave';
export const title = '洞窟脱出ジャンプ';
export const sideNames = Array.from({ length: 8 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 1;
export const maxPlayers = 8;
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const COUNTDOWN_MS = 4000;
export const LIMIT_MS = 30 * 60 * 1000;
export const COLORS = ['#c94a32', '#2f7fd8', '#2a9d5c', '#b05cd6', '#e08a1e', '#d6457c', '#1fa5a5', '#7a7a7a'];

const label = (seat) => `P${seat + 1}`;
export const fmtTime = (f) => {
  const s = f / 60, m = Math.floor(s / 60), r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
};
const racing = (s) => [...Array(s.players).keys()].filter((p) => !s.out[p] && !s.results[p]);

export function init(options, players = 1) {
  const startAt = Date.now() + COUNTDOWN_MS;
  return {
    players, startAt, results: Array(players).fill(null), out: Array(players).fill(false), rank: [],
    tickAt: startAt + LIMIT_MS, result: null, history: [`${players}人でスタート！`],
  };
}

function finish(s, reason) {
  s.tickAt = null;
  s.result = s.rank.length ? { winner: s.rank[0], reason: `${fmtTime(s.results[s.rank[0]].frames)}でいちばんに脱出` } : { winner: null, reason };
}

export function tick(s) {
  if (s.result) return { ...s, tickAt: null };
  const ns = { ...s, history: [...s.history, '時間切れ'] };
  finish(ns, 'だれも脱出できなかった');
  return ns;
}

export const canActOutOfTurn = () => true;
export const scoreOf = (s, seat) => (s.results[seat] ? `${s.rank.indexOf(seat) + 1}位 ${fmtTime(s.results[seat].frames)}` : s.out[seat] ? '' : '登っている');
export const phaseText = (s, you) => (s.result || you < 0 ? null : s.results[you] ? 'ゴール！ ほかの人を待っています' : '頂上の光を目指して脱出しよう！');

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (s.out[seat]) throw new Error('抜けています');
  const ns = { ...s, results: s.results.slice(), out: s.out.slice(), rank: s.rank.slice(), history: s.history.slice() };
  if (mv.resign) {
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
  } else if (mv.finish) {
    if (s.results[seat]) return s;
    // タイムはサーバーが数える（スタートからゴールの知らせが届くまで）。みんな同じ時計で比べられるように
    const frames = Math.max(0, Math.round((Date.now() - s.startAt) / (1000 / 60)));
    ns.results[seat] = { frames, jumps: Math.max(0, mv.finish.jumps | 0), falls: Math.max(0, mv.finish.falls | 0) };
    ns.rank.push(seat);
    ns.history.push(`${label(seat)} 脱出！ ${ns.rank.length}位（${fmtTime(frames)}）`);
  } else throw new Error('不明な操作です');
  if (!racing(ns).length) finish(ns, 'みんな抜けた');
  return ns;
}
