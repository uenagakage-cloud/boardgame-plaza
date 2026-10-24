// 朝からそれ正解（サーバーとブラウザで共通）
// 3〜8人。毎ラウンド「頭文字」と「テーマ」のお題が出る（例：「か」で始まる、お弁当に入っていてうれしいおかずは？）。
// 全員がこっそり答えを書き（考える時間）、全員そろったら一斉に公開。一人ずつ「なぜその答えか」を通話やチャットで熱弁して、
// 全員で一番納得できる答えに投票する（自分だけの答えには投票できない。ほかの人と被った答えなら自分も投票できる）。一番票を集めた答えが「今日の正解」。
// 点数: 今日の正解を書いた人に +1（同じ答えを書いた人はまとめて1つの答えとして扱う。同数なら全部が正解）。決めたラウンド数で終わり。
// 手: { answer: '文字' } 書く（書き直しもできる） / { vote: 答えの番号 } 一番いいと思う答えに投票（変えられる）
//     { voteDone: true } 投票おわり / { resign: true }
export const id = 'asasore';
export const title = '朝からそれ正解';
export const sideNames = Array.from({ length: 8 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 3;
export const maxPlayers = 8;
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const REVEAL_MS = 7000;
export const JUDGE_MS = 120000; // 熱弁と投票の時間
export const MAX_ANSWER = 30;

// 頭文字に使うかな（始まる言葉が少ない「ぬ・る・を・ん」などは入れない）
export const KANA = 'あいうえおかきくけこさしすせそたちつてとなにねのはひふへほまみむめもやよらりろわ'.split('');

// テーマ（オリジナル）。「〇で始まる」の後ろにつながる形
export const THEMES = `
朝起きて最初にすることは？
お弁当に入っていてうれしいおかずは？
コンビニでつい買ってしまうものは？
旅行に必ず持っていくものは？
言われたらうれしいほめ言葉は？
もらってうれしいプレゼントは？
もらって困るプレゼントは？
修学旅行の思い出といえば？
小学生のころに流行ったものは？
夏休みにやりたいことは？
冬になると食べたくなるものは？
雨の日にしたいことは？
休みの日の過ごし方は？
無人島に1つ持っていくものは？
初デートで行きたい場所は？
モテる人がやっていることは？
モテない人がやりがちなことは？
いい上司の条件は？
いい後輩の条件は？
理想の休日に食べたいものは？
寝る前にすることは？
お風呂で考えがちなことは？
宝くじが当たったら買うものは？
お金持ちの家にありそうなものは？
おしゃれな人の部屋にあるものは？
ひとり暮らしで必要なものは？
実家にありがちなものは？
おばあちゃんの家にありそうなものは？
田舎にあるものといえば？
都会っぽいものといえば？
学校の七不思議といえば？
怖いものといえば？
苦手な食べ物といえば？
子どもが好きな食べ物は？
大人になって好きになった食べ物は？
給食の人気メニューといえば？
お祭りの屋台で買うものは？
遊園地の乗り物といえば？
動物園で見たい動物は？
飼ってみたいペットは？
生まれ変わったらなりたいものは？
子どものころの夢は？
かっこいい職業といえば？
大変そうな仕事といえば？
社会人あるあるといえば？
学生あるあるといえば？
ゲーマーあるあるといえば？
主婦・主夫あるあるといえば？
運動部あるあるといえば？
文化部あるあるといえば？
アニメでよくある展開は？
ドラマでよくあるセリフは？
映画館で食べたいものは？
カラオケで歌いたい曲は？
テンションが上がる音楽のジャンルは？
さらりと言えたらかっこいい言葉は？
言ってみたい決めゼリフは？
口ぐせにしたい言葉は？
座右の銘にしたい言葉は？
落ち込んだときに言われたい言葉は？
プロポーズの言葉といえば？
謝るときの言葉といえば？
朝ドラのタイトルにありそうな言葉は？
新しくできたお店の名前にありそうな言葉は？
芸人のコンビ名にありそうな言葉は？
ゆるキャラの名前にありそうな言葉は？
ペットにつけたい名前は？
ヒーローの必殺技にありそうな名前は？
魔法の呪文っぽい言葉は？
怪獣の名前っぽい言葉は？
お菓子の名前にありそうな言葉は？
スポーツの技名っぽい言葉は？
台所にあるものは？
カバンの中に入っているものは？
机の引き出しに入っているものは？
冷蔵庫に入っているものは？
文房具といえば？
キャンプに持っていくものは？
防災グッズといえば？
100円ショップで買うものは？
家電量販店で見たくなるものは？
雑貨屋で見かけるものは？
海で見かけるものは？
山で見かけるものは？
空にあるものは？
丸いものといえば？
四角いものといえば？
赤いものといえば？
青いものといえば？
白いものといえば？
黒いものといえば？
甘いものといえば？
しょっぱいものといえば？
すっぱいものといえば？
辛いものといえば？
やわらかいものといえば？
かたいものといえば？
重いものといえば？
軽いものといえば？
長いものといえば？
小さいものといえば？
大きいものといえば？
うるさいものといえば？
いいにおいのするものといえば？
くさいものといえば？
冷たいものといえば？
熱いものといえば？
光るものといえば？
回るものといえば？
飛ぶものといえば？
泳ぐものといえば？
跳ねるものといえば？
増えるとうれしいものは？
減るとうれしいものは？
なくすと困るものは？
すぐなくしてしまうものは？
ついつい集めてしまうものは？
いくらあっても困らないものは？
一生食べ続けるならこれ！という食べ物は？
最後の晩さんに食べたいものは？
休日の朝ごはんにしたいものは？
夜中に食べたくなるものは？
疲れたときに食べたいものは？
風邪をひいたときに食べたいものは？
おみやげにもらってうれしいものは？
有名な観光地といえば？
行ってみたい国といえば？
日本の名物料理といえば？
日本らしいものといえば？
昔からある遊びといえば？
運動会の種目といえば？
冬のスポーツといえば？
オリンピックで見たい競技は？
体にいい食べ物は？
ダイエット中に食べたくなるものは？
ストレス解消法といえば？
早起きのコツといえば？
勉強がはかどるものは？
仕事中にやりがちなことは？
会議でよく聞く言葉は？
メールでよく使う言葉は？
SNSでよく見る言葉は？
若者言葉っぽい言葉は？
昭和っぽいものといえば？
未来にありそうなものは？
ロボットにやってほしいことは？
魔法が使えたらしたいことは？
透明人間になったらしたいことは？
一日だけ王様になったらしたいことは？
異世界に持っていきたいものは？
宇宙に持っていきたいものは？
タイムマシンで行きたい時代のものは？
忍者が持っていそうなものは？
海賊が持っていそうなものは？
名探偵が持っていそうなものは？
勇者が持っていそうなものは？
魔女が持っていそうなものは？
サンタさんにお願いしたいものは？
誕生日にしてもらいたいことは？
結婚式で見かけるものは？
新生活で買うものは？
引っ越しで大変なことは？
テストの前にやってしまうことは？
夏の風物詩といえば？
冬の風物詩といえば？
春といえば？
秋といえば？
`.trim().split('\n').map((x) => x.trim()).filter(Boolean);

// 答えを比べるときは、空白・かな/カナ・全角/半角の違いは無視
export function normalizeAnswer(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・。、！？!?.,〜~]/g, '');
}

export function normalizeOptions(o) {
  const rounds = [3, 5, 7, 10].includes(Number(o && o.rounds)) ? Number(o.rounds) : 5;
  const seconds = [0, 60, 90, 120].includes(Number(o && o.seconds)) ? Number(o.seconds) : 60;
  const kana = !(o && o.kana === false); // 頭文字しばり
  return { rounds, seconds, kana };
}
export const variantName = (o) => {
  const x = normalizeOptions(o);
  return `${x.rounds}ラウンド・${x.seconds ? `${x.seconds}秒` : '時間制限なし'}${x.kana ? '' : '・頭文字なし'}`;
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
// お題の文
export const themeText = (s) => (s.kana ? `「${s.kana}」で始まる、${THEMES[s.theme]}` : THEMES[s.theme]);

export function init(options, players = 3, rng) {
  const opts = normalizeOptions(options);
  const s = {
    players, options: opts, out: Array(players).fill(false), scores: Array(players).fill(0),
    deck: shuffle(THEMES.map((_, i) => i), rng), round: 0, theme: null, kana: '',
    phase: 'write', answers: Array(players).fill(null), groups: [], votes: Array(players).fill(null), voted: Array(players).fill(false),
    winners: [], endsAt: null, tickAt: null, turn: 0, result: null, history: [],
  };
  startRound(s, rng);
  return s;
}

function startRound(s, rng) {
  s.round += 1;
  if (!s.deck.length) s.deck = shuffle(THEMES.map((_, i) => i), rng);
  s.theme = s.deck.pop();
  s.kana = s.options.kana ? KANA[(rng ? rng(KANA.length) : Math.floor(Math.random() * KANA.length) + 1) - 1] : '';
  s.phase = 'write';
  s.answers = Array(s.players).fill(null);
  s.groups = [];
  s.votes = Array(s.players).fill(null);
  s.voted = Array(s.players).fill(false);
  s.winners = [];
  s.endsAt = s.options.seconds ? Date.now() + s.options.seconds * 1000 : null;
  s.tickAt = s.endsAt;
  s.history = []; // 新しい試合（ラウンド）になったらログは最初から
  s.history.push(`第${s.round}/${s.options.rounds}ラウンド：${themeText(s)}`);
}

// 全員書いた（または時間切れ）: 一斉に公開。同じ答えは1つにまとめる
function toJudge(s) {
  s.phase = 'judge';
  const groups = [];
  for (const p of active(s)) {
    const a = s.answers[p];
    if (!a) continue;
    const key = normalizeAnswer(a);
    const g = groups.find((x) => x.key === key);
    if (g) g.by.push(p);
    else groups.push({ key, text: a, by: [p] });
  }
  s.groups = groups.map(({ text, by }) => ({ text, by }));
  s.votes = Array(s.players).fill(null);
  s.voted = Array(s.players).fill(false);
  s.endsAt = Date.now() + JUDGE_MS;
  s.tickAt = s.endsAt;
  if (!s.groups.length) { s.history.push('誰も書きませんでした'); finishRound(s); }
}

// 票を数える。一番多い答え（同数なら全部）が今日の正解
export function tally(s) {
  const counts = s.groups.map(() => 0);
  for (const p of active(s)) if (s.votes[p] != null && counts[s.votes[p]] != null) counts[s.votes[p]]++;
  const max = Math.max(0, ...counts);
  return { counts, best: max > 0 ? counts.map((n, i) => (n === max ? i : -1)).filter((i) => i >= 0) : [] };
}

function finishRound(s) {
  const { counts, best } = tally(s);
  s.winners = best;
  for (const g of best) for (const p of s.groups[g].by) if (!s.out[p]) s.scores[p] += 1;
  s.history.push(best.length
    ? `今日の正解：${best.map((g) => `「${s.groups[g].text}」（${counts[g]}票・${s.groups[g].by.map(label).join('・')}）`).join('、')}`
    : '投票がなかったので、今日の正解はなし');
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
  if (s.phase === 'write') { toJudge(ns); return ns; } // 考える時間の終わり
  if (s.phase === 'judge') { finishRound(ns); return ns; } // 投票の時間切れ
  if (s.phase === 'reveal') {
    if (ns.round >= ns.options.rounds || active(ns).length < 3) finishGame(ns);
    else startRound(ns, rng);
    return ns;
  }
  return { ...s, tickAt: null };
}

export const canActOutOfTurn = () => true;

// 書いている間は、ほかの人の答えは「書いた／まだ」だけ。投票先は結果が出るまで見せない
export function viewFor(s, seat) {
  const open = s.phase === 'reveal' || s.phase === 'end';
  return {
    ...s, deck: null, themeText: s.theme == null ? '' : themeText(s),
    answers: s.answers.map((a, i) => (s.phase !== 'write' || i === seat ? a : a ? '✓' : null)),
    votes: s.votes.map((v, i) => (open || i === seat ? v : v != null ? -1 : null)),
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'write') {
    if (you < 0) return 'みんなが答えを考えています…';
    return s.answers[you] ? 'ほかの人を待っています（書き直しもできます）' : 'これこそ正解！ と思う答えを書いてください';
  }
  if (s.phase === 'judge') {
    if (you < 0) return 'みんなが熱弁・投票しています…';
    return s.voted[you] ? 'ほかの人の投票を待っています…' : 'なぜその答えか熱弁して、一番納得できる答えに投票しよう';
  }
  if (s.phase === 'reveal') return '今日の正解が決まりました！ まもなく次のお題';
  return null;
}

export const scoreOf = (s, seat) => `${s.scores[seat]}点`;

const clone = (s) => ({
  ...s, out: s.out.slice(), scores: s.scores.slice(), deck: s.deck ? s.deck.slice() : [], answers: s.answers.slice(),
  groups: s.groups.map((g) => ({ ...g, by: g.by.slice() })), votes: s.votes.slice(), voted: s.voted.slice(),
  winners: s.winners.slice(), history: s.history.slice(),
});

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  if (mv.resign) {
    if (s.out[seat]) return s;
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (active(ns).length < 3) { finishGame(ns); return ns; }
    if (s.phase === 'write' && active(ns).every((p) => ns.answers[p])) toJudge(ns);
    else if (s.phase === 'judge' && active(ns).every((p) => ns.voted[p])) finishRound(ns);
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
  if (mv.vote != null) {
    if (s.phase !== 'judge') throw new Error('今は投票できません');
    const g = Number(mv.vote);
    if (!s.groups[g]) throw new Error('その答えには投票できません');
    // 自分だけの答えには投票できない（ほかの人と被っている答えならよい）
    if (s.groups[g].by.includes(seat) && s.groups[g].by.length < 2) throw new Error('自分だけの答えには投票できません');
    ns.votes[seat] = g;
    ns.voted[seat] = false; // 変えたら、もう一度「投票おわり」
    return ns;
  }
  if (mv.voteDone) {
    if (s.phase !== 'judge') throw new Error('今は投票できません');
    ns.voted[seat] = true;
    if (active(ns).every((p) => ns.voted[p])) finishRound(ns);
    return ns;
  }
  throw new Error('不明な操作です');
}
