// 一致するまで終われまテン（サーバーとブラウザで共通）
// 2〜8人の協力ゲーム。お題（例：赤い果物といえば？）に全員が同時に答えを書き、全員の答えがそろえばクリア。
// そろわなければ、答えを見せ合ったうえで同じお題にもう一度挑戦（何度でも）。決めた数のお題をクリアしたら終わり。
// 書き方がちがうだけ（「林檎」と「りんご」など）のときは、全員が「一致でいいね」を押せば一致にできる。
// 何回の挑戦でクリアできたかが記録。ホストは、どうしてもそろわないお題を変えられる。
// 手: { answer: '文字' } / { agree: true } 一致でいいね / { retry: true } もう一度 / { skip: true } ホストがお題を変える / { resign: true }
export const id = 'itchi';
export const title = '一致するまで終われまテン';
export const sideNames = Array.from({ length: 8 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 2;
export const maxPlayers = 8;
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const TEAM_NAMES = ['みんな'];
export const CLEAR_MS = 4000;
export const MAX_ANSWER = 30;

// お題（オリジナル）。みんなの答えがそろいそうで、そろわないくらいのもの
export const THEMES = `
赤い果物といえば？
黄色い果物といえば？
夏の果物といえば？
おにぎりの具といえば？
カレーに入れる具といえば？
お味噌汁の具といえば？
ラーメンの味といえば？
寿司のネタといえば？
朝ごはんの定番といえば？
お弁当のおかずといえば？
給食のメニューといえば？
コンビニのおでんといえば？
お祭りの屋台といえば？
アイスの味といえば？
ケーキの種類といえば？
和菓子といえば？
冬に食べたいものといえば？
誕生日に食べたいものといえば？
居酒屋の最初の注文といえば？
ジュースといえば？
日本一高い山といえば？
日本の首都の名所といえば？
京都の観光地といえば？
北海道の名物といえば？
沖縄の名物といえば？
大阪の名物といえば？
世界の有名な建物といえば？
行ってみたい国といえば？
海外旅行先の定番といえば？
動物園の人気者といえば？
水族館の人気者といえば？
ペットの定番といえば？
十二支の最初といえば？
速い動物といえば？
大きい動物といえば？
空を飛ぶ生き物といえば？
夏の虫といえば？
花といえば？
春の花といえば？
秋といえば？
冬といえば？
夏休みにすることといえば？
正月にすることといえば？
クリスマスといえば？
ハロウィンの仮装といえば？
運動会の種目といえば？
学校の教科といえば？
文房具といえば？
筆箱に入っているものといえば？
カバンに入っているものといえば？
台所にあるものといえば？
冷蔵庫に入っているものといえば？
家電といえば？
お風呂にあるものといえば？
乗り物といえば？
電車の色といえば？
信号の色といえば？
虹の色の最初といえば？
好きな色の定番といえば？
丸いものといえば？
四角いものといえば？
白いものといえば？
黒いものといえば？
甘いものといえば？
辛いものといえば？
すっぱいものといえば？
冷たいものといえば？
熱いものといえば？
大きい数字といえば？
ラッキーナンバーといえば？
トランプのマークといえば？
じゃんけんで最初に出す手といえば？
ボールを使うスポーツといえば？
オリンピックの競技といえば？
冬のスポーツといえば？
野球のポジションといえば？
楽器といえば？
音楽室にある楽器といえば？
童謡といえば？
昔話といえば？
童話のお姫様といえば？
国民的アニメといえば？
有名なキャラクターといえば？
ヒーローといえば？
ゲーム機といえば？
ボードゲームといえば？
カードゲームといえば？
子どもの遊びといえば？
公園の遊具といえば？
遊園地の乗り物といえば？
職業といえば？
子どもがなりたい職業といえば？
病院の科といえば？
星座といえば？
惑星といえば？
天気といえば？
季節といえば？
曜日で好きなのといえば？
月の別名といえば？
日本の苗字といえば？
よくある名前といえば？
あいさつといえば？
口ぐせといえば？
魔法の呪文といえば？
SNSといえば？
スマホのアプリといえば？
コンビニといえば？
ファストフード店といえば？
牛丼チェーンといえば？
コーヒーチェーンといえば？
服のお店といえば？
靴のブランドといえば？
車のメーカーといえば？
ゲームの会社といえば？
お菓子といえば？
チョコのお菓子といえば？
ガムの味といえば？
飴の味といえば？
炭酸飲料といえば？
お茶の種類といえば？
パンの種類といえば？
麺類といえば？
卵料理といえば？
肉料理といえば？
魚料理といえば？
鍋の種類といえば？
調味料といえば？
`.trim().split('\n').map((x) => x.trim()).filter(Boolean);

// 答えを比べるときは、空白・かな/カナ・全角/半角・大文字小文字の違いは無視
export function normalizeAnswer(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・。、！？!?.,〜~ー]/g, '');
}

export function normalizeOptions(o) {
  const goal = [1, 3, 5, 10].includes(Number(o && o.goal)) ? Number(o.goal) : 3;
  const seconds = [0, 30, 60, 90].includes(Number(o && o.seconds)) ? Number(o.seconds) : 60;
  return { goal, seconds };
}
export const variantName = (o) => {
  const x = normalizeOptions(o);
  return `${x.goal}問クリアで終わり・${x.seconds ? `${x.seconds}秒` : '時間制限なし'}`;
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

export function init(options, players = 2, rng) {
  const opts = normalizeOptions(options);
  const s = {
    players, options: opts, out: Array(players).fill(false),
    deck: shuffle(THEMES.map((_, i) => i), rng), theme: null, cleared: 0, attempts: 0, tries: 0,
    phase: 'write', answers: Array(players).fill(null), choice: Array(players).fill(null), matched: false,
    clearedThemes: [], endsAt: null, tickAt: null, turn: 0, result: null, history: [],
  };
  nextTheme(s, rng);
  return s;
}

function nextTheme(s, rng) {
  if (!s.deck.length) s.deck = shuffle(THEMES.map((_, i) => i), rng);
  s.theme = s.deck.pop();
  s.tries = 0;
  s.history.push(`お題${s.cleared + 1}：${THEMES[s.theme]}`);
  startTry(s);
}

function startTry(s) {
  s.tries += 1;
  s.attempts += 1;
  s.phase = 'write';
  s.answers = Array(s.players).fill(null);
  s.choice = Array(s.players).fill(null);
  s.matched = false;
  s.endsAt = s.options.seconds ? Date.now() + s.options.seconds * 1000 : null;
  s.tickAt = s.endsAt;
}

// 全員書いた（または時間切れ）: 見せ合って、そろったかを見る
function reveal(s) {
  const live = active(s);
  const keys = live.map((p) => normalizeAnswer(s.answers[p]));
  const all = live.every((p) => s.answers[p]) && keys.every((k) => k && k === keys[0]);
  if (all) { clear(s, '全員一致！'); return; }
  s.phase = 'reveal';
  s.endsAt = null;
  s.tickAt = null;
  s.history.push(`${s.tries}回目：${live.map((p) => s.answers[p] || '（なし）').join(' / ')} → そろわず`);
}

function clear(s, why) {
  s.cleared += 1;
  s.matched = true;
  s.clearedThemes.push({ theme: THEMES[s.theme], tries: s.tries });
  s.history.push(`${why}「${active(s).map((p) => s.answers[p]).find(Boolean) || ''}」（${s.tries}回目でクリア）`);
  s.phase = 'clear';
  s.tickAt = Date.now() + CLEAR_MS;
  s.endsAt = s.tickAt;
}

function finish(s) {
  s.phase = 'end';
  s.tickAt = null;
  s.endsAt = null;
  const live = active(s);
  s.result = { winners: live, team: 0, reason: `${s.attempts}回の挑戦で${s.cleared}問クリア` };
}

export function tick(s, rng) {
  const ns = clone(s);
  if (s.phase === 'write') { reveal(ns); return ns; }
  if (s.phase === 'clear') {
    if (ns.cleared >= ns.options.goal) finish(ns);
    else nextTheme(ns, rng);
    return ns;
  }
  return { ...s, tickAt: null };
}

export const canActOutOfTurn = () => true;

// 書いている間は、ほかの人の答えは「書いた／まだ」だけ
export function viewFor(s, seat) {
  return {
    ...s, deck: null, themeText: s.theme == null ? '' : THEMES[s.theme],
    answers: s.answers.map((a, i) => (s.phase !== 'write' || i === seat ? a : a ? '✓' : null)),
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'write') {
    if (you < 0) return 'みんなが答えを考えています…';
    return s.answers[you] ? 'ほかの人を待っています（書き直しもできます）' : 'みんなと同じになりそうな答えを書こう！';
  }
  if (s.phase === 'reveal') {
    if (you < 0) return 'そろいませんでした…';
    return s.choice[you] ? 'ほかの人を待っています…' : 'そろわなかった！ 「もう一度」か、同じ意味なら「一致でいいね」';
  }
  if (s.phase === 'clear') return '全員一致！ 次のお題へ';
  return null;
}

export const resultText = (s) => `クリア！ ${s.result.reason}`;
export const scoreOf = (s) => `${s.cleared}/${s.options.goal}問`;

const clone = (s) => ({
  ...s, out: s.out.slice(), deck: s.deck ? s.deck.slice() : [], answers: s.answers.slice(), choice: s.choice.slice(),
  clearedThemes: s.clearedThemes.slice(), history: s.history.slice(),
});

// 全員が選んだら: 全員「一致でいいね」ならクリア、だれか「もう一度」なら同じお題でもう一度
function decide(s) {
  const live = active(s);
  if (!live.every((p) => s.choice[p])) return;
  if (live.every((p) => s.choice[p] === 'agree')) clear(s, '同じ意味なので一致！');
  else startTry(s);
}

export function applyMove(s, mv, seat, rng, ctx = {}) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    if (s.out[seat]) return s;
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (active(ns).length < 2) { finish(ns); return ns; }
    if (s.phase === 'write' && active(ns).every((p) => ns.answers[p])) reveal(ns);
    else if (s.phase === 'reveal') decide(ns);
    return ns;
  }
  if (s.out[seat]) throw new Error('抜けています');
  if (mv.answer != null) {
    if (s.phase !== 'write') throw new Error('今は書けません');
    const text = String(mv.answer).trim().slice(0, MAX_ANSWER);
    if (!text) throw new Error('答えを書いてください');
    ns.answers[seat] = text;
    if (active(ns).every((p) => ns.answers[p])) reveal(ns);
    return ns;
  }
  if (mv.agree || mv.retry) {
    if (s.phase !== 'reveal') throw new Error('今は選べません');
    ns.choice[seat] = mv.agree ? 'agree' : 'retry';
    decide(ns);
    return ns;
  }
  if (mv.skip) {
    if (s.phase !== 'reveal' && s.phase !== 'write') throw new Error('今はお題を変えられません');
    if (seat !== ctx.hostSeat) throw new Error('お題を変えられるのはホストだけです');
    ns.history.push(`お題を変えました（${THEMES[s.theme]}）`);
    nextTheme(ns, rng);
    return ns;
  }
  throw new Error('不明な操作です');
}
