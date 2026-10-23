// 朝からそれ正解（サーバーとブラウザで共通）
// 3〜8人。毎ラウンド1人が「親」。お題（例：朝から食べたいもの）に、全員がこっそり答えを1つ書く。
// 親以外は「親が書きそうな答え」を当てにいく。全員そろったら答えを見せ合い、
// 親が自分の答えと同じだと思うものに「正解」を付けて確定する（書き方が違っても親が決めてよい）。
// 点数: 正解した子は +1点、親は正解した子の人数ぶん +1点。親は順番に交代、全員が決めた回数親をやったら終わり。
// 手: { answer: '文字' } 書く（書き直しもできる） / { mark: 席, on: true|false } 親が正解を付ける / { confirm: true } 親が確定
//     { resign: true }
export const id = 'asasore';
export const title = '朝からそれ正解';
export const sideNames = Array.from({ length: 8 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 3;
export const maxPlayers = 8;
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const REVEAL_MS = 6000;

// お題（オリジナル）
export const THEMES = `
朝から食べたいもの
朝から飲みたいもの
朝から聞きたい音
朝から聞きたい言葉
朝から見たいもの
朝から行きたい場所
朝からしたいこと
朝からしたくないこと
朝から会いたい有名人
朝から会いたい動物
朝から食べたくないもの
朝から言われたらうれしいこと
朝から言われたらへこむこと
朝から聞こえたらびっくりする音
朝からテンションが上がるもの
朝からテンションが下がるもの
朝から歌いたい歌
朝から見たいテレビ番組
朝からやりがちなこと
朝から探しがちなもの
朝から忘れがちなもの
朝からあると助かるもの
朝から乗りたい乗り物
朝からやってみたいスポーツ
朝から読みたいもの
朝から着たい服の色
朝から使いたい言葉
朝から起きたらうれしい天気
朝から作りたい料理
朝からコンビニで買うもの
朝から鳴ってほしくないもの
朝から気になるニュース
朝から嗅ぎたいにおい
朝から触りたいもの
朝から見つけたらうれしいもの
朝から落としがちなもの
朝からありがちな失敗
朝からほめられたいこと
朝から欲しいプレゼント
朝からもらったらうれしいお菓子
朝から行列に並んでもいいもの
朝からかけたい調味料
朝からパンに塗りたいもの
朝ごはんのおかず
朝のお味噌汁の具
朝に飲む飲み物
朝のテレビでよく見るもの
朝の通学・通勤で見かけるもの
朝の駅にあるもの
朝の公園にいるもの
朝の台所の音
朝の目覚まし代わりになるもの
朝ドラの主人公の職業
朝から降ってきたらうれしいもの
朝から当たったらうれしいもの
朝から叫びたい言葉
朝から目に入るもの
朝からすること・ベスト1
朝の占いで出たらうれしいラッキーアイテム
朝から見たい映画
朝から聞きたいアーティスト
朝から食べたい果物
朝から食べたいパン
朝から食べたい麺類
朝から食べたいお菓子
朝から食べたい丼もの
朝から食べたいお寿司のネタ
朝から食べたいおにぎりの具
朝から食べたい卵料理
朝から飲みたいジュース
朝から行きたいお店
朝から行きたい国
朝から行きたい観光地
朝から遊びたいゲーム
朝から遊びたい遊具
朝から見たい生き物
朝から触りたい動物
朝から飼いたいペット
朝からなりたい職業
朝からなりたいキャラクター
朝から使いたい魔法
朝から欲しい超能力
朝から呼びたい人
朝から電話がかかってきたら困る人
朝から届いたらうれしいもの
朝から始めたい習いごと
朝から鍛えたい体の部分
朝から洗いたいもの
朝から掃除したい場所
朝から開けたいもの
朝から押したいボタン
朝から鳴らしたい楽器
朝から見上げたいもの
朝から乗ってみたい動物
朝から行きたいイベント
朝から観たいスポーツ
朝から応援したいもの
朝から集めたいもの
朝から数えたいもの
朝から描きたい絵
朝から撮りたい写真
朝から入りたいお風呂
朝から寝転びたい場所
朝から逃げたいもの
朝から勝ちたい相手
朝からやめられないこと
朝から思い出すこと
朝から考えてしまうこと
朝からつぶやきたいこと
朝から送りたいスタンプ
朝から見たいアプリ
朝からチェックしたいもの
朝から聞きたい昔話
朝から読みたい漫画
朝から観たいアニメ
朝から会いたい家族
朝から食べたい給食のメニュー
朝から食べたい駄菓子
朝から食べたいアイス
朝から食べたい鍋の具
朝から食べたい焼肉の部位
朝から食べたい中華料理
朝から食べたいファストフード
`.trim().split('\n').map((x) => x.trim()).filter(Boolean);

export const MAX_ANSWER = 30;

// 答えを比べるときは、空白・かな/カナ・全角/半角の違いは無視
export function normalizeAnswer(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・。、！？!?.,ー〜~]/g, '');
}

export function normalizeOptions(o) {
  const turns = [1, 2, 3].includes(Number(o && o.turns)) ? Number(o.turns) : 1;
  const seconds = [0, 60, 90, 120].includes(Number(o && o.seconds)) ? Number(o.seconds) : 90;
  return { turns, seconds };
}
export const variantName = (o) => {
  const x = normalizeOptions(o);
  return `親${x.turns}周・${x.seconds ? `${x.seconds}秒` : '時間制限なし'}`;
};

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

export function init(options, players = 3, rng) {
  const opts = normalizeOptions(options);
  const s = {
    players, options: opts, out: Array(players).fill(false), scores: Array(players).fill(0),
    deck: shuffle(THEMES.map((_, i) => i), rng), round: 0, totalRounds: players * opts.turns,
    parent: -1, theme: null, phase: 'write', answers: Array(players).fill(null), marks: Array(players).fill(false),
    endsAt: null, tickAt: null, turn: 0, result: null, history: [],
  };
  startRound(s, rng);
  return s;
}

function startRound(s, rng) {
  s.round += 1;
  let p = s.parent;
  do p = (p + 1) % s.players; while (s.out[p]);
  s.parent = p;
  s.turn = p;
  if (!s.deck.length) s.deck = shuffle(THEMES.map((_, i) => i), rng);
  s.theme = s.deck.pop();
  s.phase = 'write';
  s.answers = Array(s.players).fill(null);
  s.marks = Array(s.players).fill(false);
  s.endsAt = s.options.seconds ? Date.now() + s.options.seconds * 1000 : null;
  s.tickAt = s.endsAt;
  s.history.push(`第${s.round}/${s.totalRounds}ラウンド：親は ${label(p)}「${THEMES[s.theme]}」`);
}

// 全員書いた（または時間切れ）: 答えを見せて、親が判定する。同じ答えには最初から正解を付けておく
function toJudge(s) {
  s.phase = 'judge';
  s.endsAt = null;
  s.tickAt = null;
  const mine = normalizeAnswer(s.answers[s.parent]);
  s.marks = s.answers.map((a, i) => i !== s.parent && !s.out[i] && !!a && !!mine && normalizeAnswer(a) === mine);
}

function finishRound(s) {
  const winners = s.marks.map((m, i) => (m && i !== s.parent && !s.out[i] ? i : -1)).filter((i) => i >= 0);
  for (const i of winners) s.scores[i] += 1;
  if (!s.out[s.parent]) s.scores[s.parent] += winners.length;
  s.history.push(`親の答え「${s.answers[s.parent] || '（なし）'}」 正解：${winners.length ? winners.map(label).join('・') : 'なし'}`);
  s.phase = 'reveal';
  s.tickAt = Date.now() + REVEAL_MS;
  s.endsAt = s.tickAt;
}

function finishGame(s) {
  s.phase = 'end';
  s.tickAt = null;
  s.endsAt = null;
  const live = active(s);
  const best = Math.max(...live.map((p) => s.scores[p]));
  const top = live.filter((p) => s.scores[p] === best);
  s.result = top.length === 1 ? { winner: top[0], reason: `${best}点` } : { winner: null, reason: `${best}点で同点` };
}

export function tick(s, rng) {
  const ns = clone(s);
  if (s.phase === 'write') { toJudge(ns); return ns; } // 時間切れ
  if (s.phase === 'reveal') {
    if (ns.round >= ns.totalRounds || active(ns).length < 3) finishGame(ns);
    else startRound(ns, rng);
    return ns;
  }
  return { ...s, tickAt: null };
}

export const canActOutOfTurn = () => true;

// 書いている間は、ほかの人の答えは「書いた／まだ」だけ見せる
export function viewFor(s, seat) {
  const open = s.phase !== 'write';
  return {
    ...s, deck: null, themeText: THEMES[s.theme],
    answers: s.answers.map((a, i) => (open || i === seat ? a : a ? '✓' : null)),
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  const parent = you === s.parent;
  if (s.phase === 'write') {
    if (you < 0) return 'みんなが答えを書いています…';
    if (s.answers[you]) return 'ほかの人を待っています（書き直しもできます）';
    return parent ? '親です。お題への自分の答えを書いてください' : '親が書きそうな答えを書いてください';
  }
  if (s.phase === 'judge') return parent ? '自分の答えと同じものに「正解」を付けて、確定してください' : '親が判定しています…';
  if (s.phase === 'reveal') return '結果発表！ まもなく次のラウンド';
  return null;
}

export const scoreOf = (s, seat) => `${s.scores[seat]}点`;

const clone = (s) => ({
  ...s, out: s.out.slice(), scores: s.scores.slice(), deck: s.deck ? s.deck.slice() : [], answers: s.answers.slice(),
  marks: s.marks.slice(), history: s.history.slice(),
});

export function applyMove(s, mv, seat, rng, ctx = {}) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    if (s.out[seat]) return s;
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (active(ns).length < 3) { finishGame(ns); return ns; }
    if (seat === s.parent && (s.phase === 'write' || s.phase === 'judge')) {
      // 親が抜けたら、このラウンドはなしで次へ
      ns.history.push('親が抜けたので、このラウンドはなし');
      ns.phase = 'reveal';
      ns.tickAt = Date.now() + 1500;
      ns.endsAt = ns.tickAt;
    } else if (s.phase === 'write' && active(ns).every((p) => ns.answers[p])) toJudge(ns);
    return ns;
  }
  if (s.out[seat]) throw new Error('抜けています');

  if (mv.answer != null) {
    if (s.phase !== 'write') throw new Error('今は書けません');
    const text = String(mv.answer).trim().slice(0, MAX_ANSWER);
    if (!text) throw new Error('答えを書いてください');
    ns.answers[seat] = text;
    if (active(ns).every((p) => ns.answers[p])) toJudge(ns);
    return ns;
  }
  // 判定は親（親がいないときはホスト）
  const judgeSeat = ctx.online && ctx.online[s.parent] === false && ctx.hostSeat >= 0 ? ctx.hostSeat : s.parent;
  if (mv.mark != null) {
    if (s.phase !== 'judge') throw new Error('今は判定できません');
    if (seat !== judgeSeat) throw new Error('判定するのは親です');
    const i = Number(mv.mark);
    if (!(i in s.answers) || i === s.parent || s.out[i]) throw new Error('その人は選べません');
    ns.marks[i] = !!mv.on;
    return ns;
  }
  if (mv.confirm) {
    if (s.phase !== 'judge') throw new Error('今は確定できません');
    if (seat !== judgeSeat) throw new Error('確定するのは親です');
    finishRound(ns);
    return ns;
  }
  throw new Error('不明な操作です');
}
