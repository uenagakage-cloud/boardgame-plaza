// ワードウルフ（サーバーとブラウザで共通）
// 3〜8人。全員にお題（言葉）が配られるが、1人（6人以上は選べば2人）だけ少し違うお題（ウルフ）。誰がウルフかは本人も知らない。
// 決められた時間、通話やチャットでお題について話し合い（お題そのものは言わない）、そのあと全員で「ウルフだと思う人」に投票する。
// 一番多く票を集めた人が処刑。同数のときは処刑なし（ウルフの勝ち）。
// ウルフが処刑されたら、ウルフは「みんなのお題」を当てれば逆転勝ち。
// 点数: 勝った側の全員に +1（ウルフが勝ったら、ウルフは +3）。決めたラウンド数で終わり。
// 手: { endTalk: true } ホストが話し合いを早めに終える / { vote: 席 } / { guess: '言葉' } ウルフの逆転 / { resign: true }
export const id = 'wordwolf';
export const title = 'ワードウルフ';
export const sideNames = Array.from({ length: 8 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 3;
export const maxPlayers = 8;
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const REVEAL_MS = 9000;
export const GUESS_MS = 40000;

// お題のペア（オリジナル）。どちらがウルフ側になるかはラウンドごとにでたらめ
export const PAIRS = `
うどん|そば
犬|猫
海|プール
コーヒー|紅茶
カレー|シチュー
ラーメン|つけ麺
おにぎり|サンドイッチ
りんご|なし
いちご|さくらんぼ
みかん|レモン
スイカ|メロン
ケーキ|プリン
アイスクリーム|かき氷
チョコレート|クッキー
ポテトチップス|ポップコーン
焼肉|すき焼き
寿司|刺身
たこ焼き|お好み焼き
ハンバーガー|ホットドッグ
ピザ|グラタン
牛乳|豆乳
ビール|ワイン
朝ごはん|昼ごはん
夏休み|冬休み
春|秋
雪|雨
太陽|月
山|丘
川|湖
森|公園
電車|バス
飛行機|ヘリコプター
自転車|スケートボード
車|バイク
新幹線|特急
タクシー|パトカー
船|潜水艦
学校|塾
教科書|ノート
鉛筆|ボールペン
消しゴム|修正テープ
黒板|ホワイトボード
運動会|文化祭
修学旅行|遠足
卒業式|入学式
先生|校長先生
宿題|テスト
野球|ソフトボール
サッカー|フットサル
テニス|バドミントン
バスケットボール|バレーボール
水泳|マラソン
スキー|スノーボード
ボウリング|ビリヤード
将棋|チェス
トランプ|UNO
カラオケ|ライブ
映画館|水族館
遊園地|動物園
温泉|銭湯
ホテル|旅館
コンビニ|スーパー
本屋|図書館
病院|歯医者
美容院|床屋
スマホ|タブレット
テレビ|ラジオ
パソコン|ゲーム機
冷蔵庫|冷凍庫
エアコン|扇風機
こたつ|ストーブ
ベッド|ふとん
まくら|クッション
歯ブラシ|くし
シャンプー|せっけん
傘|レインコート
帽子|ヘルメット
メガネ|サングラス
腕時計|目覚まし時計
財布|カバン
スニーカー|サンダル
Tシャツ|パーカー
ジーンズ|スカート
マフラー|手袋
指輪|ネックレス
花火|お祭り
クリスマス|お正月
誕生日|記念日
結婚式|お葬式
バレンタイン|ホワイトデー
ハロウィン|七夕
サンタクロース|トナカイ
お化け|ゾンビ
忍者|侍
王様|お姫様
警察官|消防士
医者|看護師
歌手|アイドル
YouTuber|芸人
アニメ|漫画
ドラマ|映画
小説|絵本
写真|動画
ライオン|トラ
パンダ|コアラ
ペンギン|アザラシ
イルカ|クジラ
カブトムシ|クワガタ
ハト|カラス
ひまわり|チューリップ
桜|梅
朝寝坊|夜ふかし
初恋|片思い
ダイエット|筋トレ
お風呂|シャワー
掃除|洗濯
料理|お菓子作り
キャンプ|バーベキュー
宝くじ|競馬
焼きそば|ナポリタン
餃子|しゅうまい
からあげ|とんかつ
ハンバーグ|ステーキ
オムライス|チャーハン
パンケーキ|ワッフル
ドーナツ|ベーグル
マカロン|クッキー
ゼリー|ムース
たい焼き|今川焼き
味噌汁|スープ
醤油|ソース
マヨネーズ|ケチャップ
わさび|からし
塩|砂糖
ジュース|スポーツドリンク
緑茶|麦茶
ココア|ホットミルク
コーラ|サイダー
水|炭酸水
ディズニーランド|USJ
北海道|沖縄
京都|奈良
東京タワー|スカイツリー
富士山|エベレスト
ハワイ|グアム
アメリカ|イギリス
中国|韓国
パリ|ロンドン
ピラミッド|スフィンクス
ゴキブリ|クモ
蚊|ハエ
ハムスター|リス
うさぎ|モルモット
金魚|メダカ
カエル|カメ
キリン|ゾウ
サル|ゴリラ
ワニ|ヘビ
フクロウ|ミミズク
ユニクロ|しまむら
マクドナルド|モスバーガー
スターバックス|ドトール
セブンイレブン|ローソン
無印良品|ニトリ
LINE|メール
Instagram|TikTok
YouTube|テレビ
ネットフリックス|レンタルビデオ
ポケモン|デジモン
ドラえもん|アンパンマン
マリオ|カービィ
ジブリ|ディズニー
ワンピース|ナルト
ガンダム|エヴァンゲリオン
ピアノ|エレクトーン
ギター|ベース
ドラム|太鼓
バイオリン|チェロ
リコーダー|ハーモニカ
じゃんけん|あっち向いてホイ
鬼ごっこ|かくれんぼ
オセロ|五目並べ
人生ゲーム|モノポリー
テトリス|ぷよぷよ
卒業アルバム|日記
手紙|年賀状
お年玉|おこづかい
貯金|投資
給料|ボーナス
月曜日|金曜日
朝|夜
正月|お盆
入学|入社
合コン|お見合い
風邪|インフルエンザ
頭痛|腹痛
マスク|めがね
ベッド|ソファ
階段|エスカレーター
`.trim().split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p.length === 2);

export function normalizeOptions(o) {
  const minutes = [1, 2, 3, 5].includes(Number(o && o.minutes)) ? Number(o.minutes) : 3;
  const rounds = [1, 3, 5].includes(Number(o && o.rounds)) ? Number(o.rounds) : 3;
  const wolves = [1, 2].includes(Number(o && o.wolves)) ? Number(o.wolves) : 1;
  return { minutes, rounds, wolves };
}
export const variantName = (o) => {
  const x = normalizeOptions(o);
  return `話し合い${x.minutes}分・${x.rounds}ラウンド${x.wolves === 2 ? '・ウルフ2人（6人以上）' : ''}`;
};

function shuffle(arr, rng) {
  const rand = rng ? (n) => rng(n) - 1 : (n) => Math.floor(Math.random() * n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const pick = (n, rng) => (rng ? rng(n) - 1 : Math.floor(Math.random() * n));

const label = (seat) => `P${seat + 1}`;
const active = (s) => [...Array(s.players).keys()].filter((p) => !s.out[p]);

// 言葉の比べ方: 空白・かな/カナ・全角/半角の違いは無視
export function normalizeWord(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・。、！？!?.,ー]/g, '');
}

export function init(options, players = 3, rng) {
  const s = {
    players, options: normalizeOptions(options), out: Array(players).fill(false), scores: Array(players).fill(0),
    deck: shuffle(PAIRS.map((_, i) => i), rng), round: 0, phase: 'talk', words: [], wolves: [], major: '', minor: '',
    votes: Array(players).fill(null), executed: null, guess: null, winner: null,
    endsAt: null, tickAt: null, turn: 0, result: null, history: [],
  };
  startRound(s, rng);
  return s;
}

function startRound(s, rng) {
  s.round += 1;
  if (!s.deck.length) s.deck = shuffle(PAIRS.map((_, i) => i), rng);
  const pair = PAIRS[s.deck.pop()];
  const flip = pick(2, rng) === 1;
  s.major = flip ? pair[1] : pair[0];
  s.minor = flip ? pair[0] : pair[1];
  const live = active(s);
  const n = s.options.wolves === 2 && live.length >= 6 ? 2 : 1;
  s.wolves = shuffle(live.slice(), rng).slice(0, n);
  s.words = [...Array(s.players).keys()].map((p) => (s.out[p] ? null : s.wolves.includes(p) ? s.minor : s.major));
  s.votes = Array(s.players).fill(null);
  s.executed = null;
  s.guess = null;
  s.winner = null;
  s.phase = 'talk';
  s.endsAt = Date.now() + s.options.minutes * 60000;
  s.tickAt = s.endsAt;
  s.history.push(`第${s.round}/${s.options.rounds}ラウンド：話し合いスタート（ウルフ${n}人）`);
}

function startVote(s) {
  s.phase = 'vote';
  s.endsAt = Date.now() + 60000;
  s.tickAt = s.endsAt;
  s.history.push('投票の時間です');
}

// 票を数える。一番多い人が1人なら処刑、同数なら処刑なし
function countVotes(s) {
  const tally = Array(s.players).fill(0);
  for (const p of active(s)) if (s.votes[p] != null) tally[s.votes[p]]++;
  const max = Math.max(...tally);
  const top = tally.map((n, i) => (n === max && max > 0 ? i : -1)).filter((i) => i >= 0);
  s.executed = top.length === 1 ? top[0] : null;
  if (s.executed == null) {
    s.history.push('同じ票数（または投票なし）なので処刑なし');
    endRound(s, 'wolf');
    return;
  }
  s.history.push(`${label(s.executed)} が処刑されました`);
  if (s.wolves.includes(s.executed)) {
    // ウルフが処刑された: 逆転のチャンス
    s.phase = 'guess';
    s.endsAt = Date.now() + GUESS_MS;
    s.tickAt = s.endsAt;
  } else endRound(s, 'wolf');
}

function endRound(s, winner) {
  s.winner = winner;
  s.phase = 'reveal';
  s.endsAt = Date.now() + REVEAL_MS;
  s.tickAt = s.endsAt;
  const wolves = s.wolves.filter((p) => !s.out[p]);
  const citizens = active(s).filter((p) => !s.wolves.includes(p));
  if (winner === 'wolf') for (const p of wolves) s.scores[p] += 3;
  else for (const p of citizens) s.scores[p] += 1;
  s.history.push(`みんなのお題「${s.major}」・ウルフのお題「${s.minor}」 ウルフは ${s.wolves.map(label).join('・')} → ${winner === 'wolf' ? 'ウルフの勝ち' : '市民の勝ち'}`);
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
  if (s.phase === 'talk') { startVote(ns); return ns; }
  if (s.phase === 'vote') { countVotes(ns); return ns; }
  if (s.phase === 'guess') { ns.history.push('ウルフは答えられませんでした'); endRound(ns, 'citizen'); return ns; }
  if (s.phase === 'reveal') {
    if (ns.round >= ns.options.rounds || active(ns).length < 3) finishGame(ns);
    else startRound(ns, rng);
    return ns;
  }
  return { ...s, tickAt: null };
}

export const canActOutOfTurn = () => true;

// 自分のお題だけ見える。ウルフが誰か・投票先は、結果が出るまで見せない（投票したかどうかだけ）
export function viewFor(s, seat) {
  const open = s.phase === 'reveal' || s.phase === 'end';
  return {
    ...s, deck: null,
    words: s.words.map((w, i) => (open || i === seat ? w : null)),
    wolves: open ? s.wolves : [],
    major: open ? s.major : null,
    minor: open ? s.minor : null,
    votes: s.votes.map((v, i) => (open || i === seat || s.phase === 'guess' ? v : v != null ? -1 : null)),
    wolfCount: s.wolves.length,
    executedIsWolf: s.phase === 'guess' ? true : undefined,
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'talk') return 'お題について話し合おう（お題そのものは言わないで！）';
  if (s.phase === 'vote') return you >= 0 && s.votes[you] == null ? 'ウルフだと思う人に投票してください' : '投票を待っています…';
  if (s.phase === 'guess') return you === s.executed ? 'あなたはウルフでした！ みんなのお題を当てれば逆転勝ち' : 'ウルフがみんなのお題を考えています…';
  if (s.phase === 'reveal') return '結果発表！ まもなく次のラウンド';
  return null;
}

export const scoreOf = (s, seat) => `${s.scores[seat]}点`;

const clone = (s) => ({
  ...s, out: s.out.slice(), scores: s.scores.slice(), deck: s.deck ? s.deck.slice() : [], words: s.words.slice(),
  wolves: s.wolves.slice(), votes: s.votes.slice(), history: s.history.slice(),
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
    if (s.phase === 'vote' && active(ns).every((p) => ns.votes[p] != null)) countVotes(ns);
    if (s.phase === 'guess' && seat === s.executed) endRound(ns, 'citizen');
    return ns;
  }
  if (s.out[seat]) throw new Error('抜けています');
  if (mv.endTalk) {
    if (s.phase !== 'talk') throw new Error('今は話し合いの時間ではありません');
    if (seat !== ctx.hostSeat) throw new Error('ホストだけが投票に進めます');
    startVote(ns);
    return ns;
  }
  if (mv.vote != null) {
    if (s.phase !== 'vote') throw new Error('今は投票できません');
    const t = Number(mv.vote);
    if (!(t in s.words) || s.out[t]) throw new Error('その人には投票できません');
    if (t === seat) throw new Error('自分には投票できません');
    ns.votes[seat] = t;
    if (active(ns).every((p) => ns.votes[p] != null)) countVotes(ns);
    return ns;
  }
  if (mv.guess != null) {
    if (s.phase !== 'guess' || seat !== s.executed) throw new Error('今は答えられません');
    const text = String(mv.guess).trim().slice(0, 30);
    if (!text) throw new Error('言葉を書いてください');
    ns.guess = text;
    const ok = normalizeWord(text) === normalizeWord(s.major);
    ns.history.push(`ウルフの答え「${text}」→ ${ok ? '正解！ 逆転' : 'はずれ'}`);
    endRound(ns, ok ? 'wolf' : 'citizen');
    return ns;
  }
  throw new Error('不明な操作です');
}
