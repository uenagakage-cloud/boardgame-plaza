// キャット＆チョコレート風の大喜利ゲーム（サーバーとブラウザで共通）
// 2〜6人。全員が「ねこチーム」か「チョコチーム」に秘密で分かれる。
// 手番の人はピンチ（イベント）を、手札のアイテムを指定の数だけ使って解決する方法を文章で説明する。
// ほかの全員が成功／失敗を投票し、成功が過半数ならイベントを獲得。最後にチームごとの獲得数で勝敗を決める。
// 手: { explain: { items: [手札の番号...], text } } / { giveUp: true } / { vote: true|false } / { resign: true }
// カードの文章はこのアプリのオリジナル。
export const id = 'catchoco';
export const title = 'キャット＆チョコレート';
export const sideNames = ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4', 'プレイヤー5', 'プレイヤー6'];
export const minPlayers = 2;
export const maxPlayers = 6;
export const HAND_SIZE = 3;
export const LAPS = 2; // 全員が2回ずつ手番をしたら終了
export const TEAM_NAMES = ['ねこチーム', 'チョコチーム'];
export const MAX_TEXT = 400;

const EVENTS = [
  ['寝坊した！大事な会議まであと10分', 2], ['家の鍵をなくして締め出された', 2], ['無人島に流れ着いてしまった', 3],
  ['ゾンビの群れに囲まれた', 3], ['好きな人に告白したい', 2], ['財布を忘れて高級レストランで食べてしまった', 2],
  ['宇宙人にさらわれた', 3], ['試験は明日なのに何も勉強していない', 1], ['迷子の子犬を見つけた', 1],
  ['雪山で遭難した', 3], ['大事な花瓶を割ってしまった', 2], ['ライオンが動物園から逃げてきた', 2],
  ['停電で真っ暗になった', 1], ['仮病で休んだのが上司にバレそう', 2], ['結婚式のスピーチ原稿をなくした', 2],
  ['巨大なクモが部屋に出た', 1], ['乗っている船が沈みかけている', 3], ['幽霊に取りつかれた', 2],
  ['冷蔵庫が空なのに友だちが10人来る', 2], ['満員電車でくしゃみが止まらない', 1], ['密室事件の犯人を見つけなければ', 3],
  ['銀行強盗の人質になってしまった', 3], ['タイムマシンで江戸時代に来てしまった', 3], ['大事なプレゼン直前にパソコンが壊れた', 2],
  ['夏休みの宿題が最終日に全部残っている', 2], ['ペットのハムスターが逃げた', 1], ['雨なのに傘がない', 1],
  ['有名人と間違えられてファンに追われている', 2], ['魔王を倒す勇者に選ばれてしまった', 3], ['隣の家がうるさくて眠れない', 1],
  // 追加のピンチ
  ['エレベーターに閉じ込められた', 2], ['大事な書類を燃えるゴミに出してしまった', 2], ['山奥でクマに出会った', 3], ['海で泳いでいたらサメが近づいてきた', 3], ['初めてのデートで服にカレーをこぼした', 2], ['終電を逃して知らない駅にいる', 2], ['スマホの充電が残り1%', 1], ['テスト中にお腹が鳴りそう', 1], ['授業中に寝ていて先生に当てられた', 1], ['友だちの誕生日を完全に忘れていた', 2], ['引っ越しのトラックが来ない', 2], ['台風で家の窓が割れそう', 2], ['砂漠で水がなくなった', 3], ['ジャングルで道に迷った', 3], ['南極基地のストーブが壊れた', 3], ['ロボットが反乱を起こした', 3], ['宇宙船の酸素が残りわずか', 3], ['恐竜の時代に来てしまった', 3], ['ドラゴンが村を襲いに来る', 3], ['お城のパーティーに招待されたのに服がない', 2], ['魔女にカエルにされてしまった', 3], ['テレビの生放送で頭が真っ白になった', 2], ['マラソン大会で足をつった', 2], ['運動会のリレーでバトンを落とした', 1], ['料理コンテストで食材が全部焦げた', 2], ['お見合いの相手が元カレ・元カノだった', 2], ['上司の名前を間違えて呼んだ', 1], ['間違えて社長にスタンプを送ってしまった', 1], ['旅行先でパスポートをなくした', 2], ['海外で言葉が全く通じない', 2], ['家の中に泥棒が入ってきた', 2], ['ペンキ塗りたてのベンチに座ってしまった', 1], ['靴のかかとが取れた', 1], ['自転車がパンクした、約束まであと5分', 2], ['バスの中で知らない赤ちゃんが泣き止まない', 2], ['文化祭の出し物が何も決まっていない', 2], ['卒業式で答辞を読むのに原稿がない', 2], ['友だちのペットを預かったら逃げた', 2], ['お隣さんのボールで窓ガラスが割れた', 1], ['冷蔵庫の中身が全部くさってしまった', 1], ['実家の母が急に遊びに来る、部屋が汚い', 2], ['会社のパソコンがウイルスに感染した', 2], ['プールで水着が流された', 2], ['スキー場でリフトが止まった', 2], ['遊園地の観覧車がてっぺんで止まった', 2], ['動物園のゴリラににらまれている', 1], ['結婚式の指輪を家に忘れた', 3], ['ピアノの発表会で楽譜を忘れた', 2], ['くしゃみで入れ歯（めがね）が飛んでいった', 1], ['美容院で髪を切りすぎられた', 1], ['頼んでいないピザが10枚届いた', 1], ['魔法のランプからランプの精が出てきた', 1], ['UFOが家の前に着陸した', 2], ['透明人間になって元に戻れない', 3], ['体が小さくなってしまった', 3], ['犬と心が入れかわってしまった', 3], ['夢の中から出られない', 3], ['クラスの全員が自分の秘密を知っている', 2], ['SNSに変な写真を投稿してしまった', 1], ['推しのライブのチケットが取れない', 2], ['世界中のお金がなくなった', 3], ['明日地球に隕石が落ちてくる', 3], ['王様に「1日で城を建てよ」と言われた', 3], ['海賊船に乗せられてしまった', 3], ['忍者の里の試験を受けることになった', 2], ['探偵として事件を解決してほしいと頼まれた', 2], ['迷子になった宇宙人の子どもを家に帰したい', 3], ['雪の日に家のドアが凍って開かない', 2], ['お弁当を家に忘れてきた', 1],
];
const ITEMS = [
  '輪ゴム', 'バナナ', 'スマートフォン', '傘', 'ガムテープ', '段ボール', '懐中電灯', '消しゴム', '毛布', '自転車',
  'ペットボトル', 'ハサミ', '鏡', '新聞紙', 'カップラーメン', '風船', 'ロープ', '双眼鏡', 'ほうき', '腕時計',
  '招き猫', 'ハンバーガー', '金づち', '釣りざお', 'ラジカセ', 'フライパン', '絆創膏', '地図', '枕', 'トランプ',
  '磁石', '花火', 'サングラス', 'スケートボード', '掃除機', '歯ブラシ', 'チョコレート', '黒猫', 'リコーダー', '扇風機',
  '着ぐるみ', '消火器', '水鉄砲', 'ドローン', '宝くじ', '植木鉢', '辞書', 'マッチ', 'ラブレター', '王冠',
  '笛', '野球のバット', 'はちみつ', '浮き輪', 'カメラ', '鈴', '寝袋', 'ギター', '手品のステッキ', '大きな岩',
  // 日用品
  'ヘルメット', '長ぐつ', '虫めがね', 'ホッチキス', '洗濯ばさみ', 'トイレットペーパー', 'ドライヤー', '電子レンジ', '炊飯器', 'やかん',
  // 食べ物
  'ちくわ', 'おにぎり', '納豆', 'カレーライス', 'ドーナツ', 'たこ焼き', 'ソフトクリーム', '梅干し', '唐辛子', 'にんにく',
  // 生き物
  'ニワトリ', '金魚', 'カブトムシ', 'パンダのぬいぐるみ', 'オウム', '柴犬', 'ペンギン', 'カメ', 'ハト', 'ゴリラ',
  // 街にあるもの
  '自動販売機', '信号機', 'マンホール', 'ベンチ', '公衆電話', 'ポスト', '滑り台', 'ブランコ', 'エレベーター', '観覧車',
  // 乗り物
  'パラシュート', 'ロケット', '潜水艦', '熱気球', '一輪車', '三輪車', 'リヤカー', 'ショッピングカート', 'ボート', 'スーパーカー',
  // 道具
  'スコップ', 'のこぎり', 'ドライバー', 'はしご', 'バケツ', 'ジョウロ', '軍手', 'ペンキ', 'セメント', 'ブルーシート',
  // 電子機器
  'ノートパソコン', 'ゲーム機', 'ヘッドホン', 'プロジェクター', 'ロボット掃除機', '電卓', '拡声器', 'トランシーバー', '防犯ブザー', 'モバイルバッテリー',
  // 服・身につけるもの
  'マフラー', 'ネクタイ', 'ハイヒール', 'タキシード', '浴衣', 'マスク', 'カツラ', 'つけひげ', '白衣', 'エプロン',
  // 楽器・音
  '太鼓', 'トライアングル', 'ピアノ', 'カスタネット', 'マイク', 'メトロノーム', 'ハーモニカ', '鍵盤ハーモニカ', 'ほら貝', '三味線',
  // 遊び道具
  '将棋盤', 'けん玉', 'こま', 'ルービックキューブ', 'ヨーヨー', '竹とんぼ', 'フリスビー', '縄跳び', 'ボウリングの球', 'サッカーボール',
  // 縁起物・不思議なもの
  'お守り', 'だるま', 'こけし', 'ひな人形', '鯉のぼり', '門松', 'おみくじ', '数珠', '水晶玉', '魔法のじゅうたん',
  // 紙・お金など
  '透明マント', 'タイムマシンの説明書', '宝の地図', '金の延べ棒', 'ダイヤモンド', '札束', 'クーポン券', '名刺', '履歴書', '卒業アルバム',
  // 追加のアイテム
  '段ボールの家', 'ちゃぶ台', '招待状', 'メガホン', 'ドラゴンの卵', '伝説の剣', '手錠', '虫取り網', 'ハリネズミ', 'おばあちゃん', '赤ちゃん', '警察官', '野球チーム', 'お笑い芸人', 'スマートスピーカー', '電動キックボード', 'ゴーグル', 'シュノーケル', 'ビーチボール', '流しそうめんの道具', 'たこ焼き器', 'ホットプレート', '圧力鍋', 'そろばん', '地球儀', '顕微鏡', '望遠鏡', '扇子', '風鈴', '和太鼓', 'こたつ', '雪だるま', 'かき氷機', 'わたあめ', '焼きいも', 'おでん', '納豆巻き', 'プリン', 'ポップコーン', 'コーラ', '牛乳びん', '炭酸水',
];

function shuffle(arr, rng) {
  const rand = rng ? (n) => rng(n) - 1 : (n) => Math.floor(Math.random() * n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawItem(s, rng) {
  if (!s.itemDeck.length) { s.itemDeck = shuffle(s.itemDiscard, rng); s.itemDiscard = []; }
  return s.itemDeck.pop();
}

export function init(options, players = 2, rng) {
  const order = shuffle([...Array(players).keys()], rng);
  const teams = Array(players).fill(0);
  order.forEach((seat, i) => { teams[seat] = i % 2; });
  const s = {
    players, teams, out: Array(players).fill(false),
    itemDeck: shuffle(ITEMS.map((name, i) => ({ id: i, name })), rng), itemDiscard: [],
    events: shuffle(EVENTS.map(([text, count], i) => ({ id: i, text, count })), rng),
    hands: [], won: Array.from({ length: players }, () => []),
    turn: 0, turnNo: 0, totalTurns: Math.min(players * LAPS, EVENTS.length),
    event: null, phase: 'explain', story: null, votes: Array(players).fill(null),
    log: [], result: null, history: [],
  };
  for (let p = 0; p < players; p++) s.hands.push(Array.from({ length: HAND_SIZE }, () => drawItem(s, rng)));
  s.event = s.events.pop();
  return s;
}

const active = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
const voters = (s) => active(s).filter((p) => p !== s.turn);

// 投票中は手番以外の人が操作する
export const canActOutOfTurn = (s) => s.phase === 'vote';

export function teamScores(s) {
  const score = [0, 0];
  s.won.forEach((events, seat) => { score[s.teams[seat]] += events.length; });
  return score;
}

// 他の人の手札・チーム・投票内容は隠す（終局後はチームを公開）
export function viewFor(s, seat) {
  return {
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : null)),
    handCounts: s.hands.map((h) => h.length),
    teams: s.teams.map((t, i) => (i === seat || s.result ? t : null)),
    votes: s.votes.map((v, i) => (v === null ? null : i === seat ? v : 'voted')),
    itemDeck: null, itemDiscard: null, events: null, eventsLeft: s.events.length,
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  const mine = you === s.turn;
  if (s.phase === 'explain') return mine ? `あなたの番：アイテムを${s.event.count}個使ってピンチを切り抜けよう！` : '解決方法を考えています…';
  if (mine) return 'みんなの判定を待っています…';
  if (you >= 0 && !s.out[you]) return s.votes[you] === null ? 'この解決方法は成功？ 失敗？ 投票してください' : 'ほかの人の投票を待っています…';
  return '投票中です';
}

export const scoreOf = (s, seat) => `獲得 ${s.won[seat].length}`;

const clone = (s) => ({
  ...s, out: s.out.slice(), itemDeck: s.itemDeck.slice(), itemDiscard: s.itemDiscard.slice(), events: s.events.slice(),
  hands: s.hands.map((h) => h.slice()), won: s.won.map((w) => w.slice()), votes: s.votes.slice(),
  log: s.log.slice(), history: s.history.slice(),
});

// 手番を終えて次の人へ。規定のターン数かイベントがなくなったら終了
function nextTurn(ns, entry, rng) {
  ns.log.push(entry);
  ns.history.push(`${ns.event.text}：${entry.success ? '成功' : entry.gaveUp ? 'ギブアップ' : '失敗'}`);
  if (entry.usedIds) {
    const hand = ns.hands[entry.seat];
    for (const id of entry.usedIds) {
      const i = hand.findIndex((c) => c.id === id);
      if (i >= 0) ns.itemDiscard.push(...hand.splice(i, 1));
    }
    while (hand.length < HAND_SIZE) hand.push(drawItem(ns, rng));
  }
  ns.turnNo++;
  ns.story = null;
  ns.votes = Array(ns.players).fill(null);
  ns.phase = 'explain';
  const left = active(ns);
  if (ns.turnNo >= ns.totalTurns || !ns.events.length || left.length < 2) return finish(ns);
  let next = ns.turn;
  do next = (next + 1) % ns.players; while (ns.out[next]);
  ns.turn = next;
  ns.event = ns.events.pop();
  return ns;
}

function finish(ns) {
  const [a, b] = teamScores(ns);
  const reason = `${TEAM_NAMES[0]} ${a} 対 ${TEAM_NAMES[1]} ${b}`;
  const team = a === b ? null : a > b ? 0 : 1;
  ns.result = {
    winner: null, reason,
    winners: team === null ? [] : ns.teams.map((t, i) => (t === team ? i : -1)).filter((i) => i >= 0),
    team,
  };
  return ns;
}

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (s.out[seat]) throw new Error('投了しています');
  const ns = clone(s);

  if (mv.resign) {
    ns.out[seat] = true;
    ns.history.push(`プレイヤー${seat + 1}が抜けました`);
    if (active(ns).length < 2) return finish(ns);
    if (seat === ns.turn) return nextTurn(ns, { seat, event: ns.event, gaveUp: true, success: false, items: [], text: '' }, rng);
    if (ns.phase === 'vote') return resolveIfVoted(ns, rng);
    return ns;
  }

  if (mv.explain) {
    if (s.phase !== 'explain' || seat !== s.turn) throw new Error('あなたの番ではありません');
    const idx = Array.isArray(mv.explain.items) ? mv.explain.items : [];
    const hand = s.hands[seat];
    if (new Set(idx).size !== idx.length || idx.some((i) => !hand[i])) throw new Error('アイテムの選び方が正しくありません');
    if (idx.length !== s.event.count) throw new Error(`アイテムをちょうど${s.event.count}個選んでください`);
    const text = String(mv.explain.text || '').trim().slice(0, MAX_TEXT);
    if (text.length < 5) throw new Error('解決方法をもう少し詳しく書いてください');
    ns.story = { items: idx.map((i) => hand[i]), text };
    ns.phase = 'vote';
    ns.votes = Array(ns.players).fill(null);
    return voters(ns).length ? ns : resolveIfVoted(ns, rng);
  }

  if (mv.giveUp) {
    if (s.phase !== 'explain' || seat !== s.turn) throw new Error('あなたの番ではありません');
    return nextTurn(ns, { seat, event: s.event, gaveUp: true, success: false, items: [], text: '' }, rng);
  }

  if (mv.vote != null) {
    if (s.phase !== 'vote') throw new Error('今は投票できません');
    if (seat === s.turn) throw new Error('自分の解決方法には投票できません');
    if (s.votes[seat] !== null) throw new Error('もう投票しました');
    ns.votes[seat] = !!mv.vote;
    return resolveIfVoted(ns, rng);
  }
  throw new Error('不明な操作です');
}

// 全員が投票したら判定。成功票が過半数なら成功（同数は失敗）
function resolveIfVoted(ns, rng) {
  const vs = voters(ns);
  if (vs.some((p) => ns.votes[p] === null)) return ns;
  const ok = vs.filter((p) => ns.votes[p]).length, ng = vs.length - ok;
  const success = ok > ng || vs.length === 0;
  if (success) ns.won[ns.turn].push(ns.event);
  return nextTurn(ns, {
    seat: ns.turn, event: ns.event, items: ns.story.items, text: ns.story.text,
    usedIds: ns.story.items.map((c) => c.id), ok, ng, success,
  }, rng);
}
