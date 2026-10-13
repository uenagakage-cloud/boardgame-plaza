// ワードバスケットのルール（サーバーとブラウザで共通）
// 2〜6人。手番はなく、場の文字から始まり手札の文字で終わる言葉（3文字以上）を早い者勝ちで出す。
// 先に手札がなくなった人の勝ち。
// カード: { id, t: 'kana', c: 'あ' } その文字で終わる
//         { id, t: 'row',  c: 'か' } その行（か行など）のどれかで終わる
//         { id, t: 'len',  n: 4|5|6 } 4文字・5文字・6文字以上の言葉（終わりの文字は自由）
// 言葉が辞書にあるかは判定しない。おかしな言葉は他の人が「ダメ！」で取り消せる（出した人は手札に戻して1枚引く）。
// 手: { word, card } 言葉を出す（card は手札の番号。省略すると自動で選ぶ）
//     { challenge: playIndex } 直前の言葉にダメ出し / { flip: true } 場を流す投票 / { resign: true } 投了
export const id = 'wordbasket';
export const title = 'ワードバスケット';
export const sideNames = ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4', 'プレイヤー5', 'プレイヤー6'];
export const minPlayers = 2;
export const maxPlayers = 6;
export const HAND_SIZE = 5;
export const MIN_LENGTH = 3;

const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ';
const ROWS = {
  あ: 'あいうえお', か: 'かきくけこ', さ: 'さしすせそ', た: 'たちつてと', な: 'なにぬねの',
  は: 'はひふへほ', ま: 'まみむめも', や: 'やゆよ', ら: 'らりるれろわ',
};
const SMALL = { ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ', ゕ: 'か', ゖ: 'け' };

export function cardLabel(card) {
  if (card.t === 'kana') return card.c;
  if (card.t === 'row') return card.c + '行';
  return card.n === 6 ? '6文字以上' : `${card.n}文字`;
}

function makeDeck() {
  const cards = [...KANA].map((c) => ({ t: 'kana', c }));
  for (const c of Object.keys(ROWS)) cards.push({ t: 'row', c });
  for (const n of [4, 4, 5, 5, 6, 6]) cards.push({ t: 'len', n });
  return cards.map((c, i) => ({ id: i, ...c }));
}

function shuffle(arr, rng) {
  const rand = rng ? (n) => rng(n) - 1 : (n) => Math.floor(Math.random() * n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- 言葉の正規化 ----------
// カタカナはひらがなに。ひらがな・カタカナ・長音以外を含む場合は null
export function normalize(word) {
  const w = String(word || '').trim().replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  return /^[ぁ-ゖー]+$/.test(w) && !w.startsWith('ー') ? w : null;
}

// 濁点・半濁点・小さい文字を取った基本の文字
export function baseChar(ch) {
  if (ch === 'ゔ') return 'う';
  const plain = ch.normalize('NFD').replace(/[゙゚]/g, '').normalize('NFC');
  return SMALL[plain] || plain;
}

export const firstChar = (w) => baseChar(w[0]);
// 「ー」で終わるときはその前の文字を使う
export const lastChar = (w) => baseChar(w.replace(/ー+$/, '').slice(-1));

function cardMatches(card, word, last) {
  if (card.t === 'kana') return last === card.c;
  if (card.t === 'row') return ROWS[card.c].includes(last);
  const len = [...word].length;
  return card.n === 6 ? len >= 6 : len === card.n;
}

// 出せるカードの番号（文字カード → 行カード → 文字数カードの順に優先）。なければ -1
export function findCard(hand, word, last) {
  for (const t of ['kana', 'row', 'len']) {
    const i = hand.findIndex((card) => card.t === t && cardMatches(card, word, last));
    if (i >= 0) return i;
  }
  return -1;
}

// 言葉が出せるか調べる。出せなければ理由つきで例外
export function checkWord(s, seat, word, cardIndex) {
  const w = normalize(word);
  if (!w) throw new Error('ひらがなかカタカナで入力してください');
  if ([...w].length < MIN_LENGTH) throw new Error(`${MIN_LENGTH}文字以上の言葉にしてください`);
  if (firstChar(w) !== s.field) throw new Error(`「${s.field}」から始まる言葉にしてください`);
  const last = lastChar(w);
  if (last === 'ん') throw new Error('「ん」で終わる言葉は出せません');
  if (s.used.includes(w)) throw new Error('その言葉はもう使われました');
  const hand = s.hands[seat];
  const index = cardIndex == null ? findCard(hand, w, last) : cardIndex;
  const card = hand[index];
  if (!card) throw new Error(`「${last}」で終わるカードを持っていません`);
  if (!cardMatches(card, w, last)) throw new Error(`「${cardLabel(card)}」のカードでは出せません`);
  return { word: w, index, card, last };
}

// ---------- 状態 ----------
function draw(s, rng) {
  if (!s.deck.length) { s.deck = shuffle(s.discard, rng); s.discard = []; }
  return s.deck.pop();
}

// 文字カードが出るまで引いて場に置く
function newField(s, rng) {
  for (let tries = 0; tries < 200; tries++) {
    const card = draw(s, rng);
    if (!card) break;
    if (card.t === 'kana') { s.fieldCard = card; s.field = card.c; return; }
    s.discard.push(card);
  }
  throw new Error('山札がありません');
}

export function init(options, players = 2, rng) {
  const s = {
    players, deck: shuffle(makeDeck(), rng), discard: [],
    hands: [], out: Array(players).fill(false),
    field: null, fieldCard: null, plays: [], challengeable: null, used: [],
    flipVotes: [], turn: 0, result: null, history: [],
  };
  for (let p = 0; p < players; p++) s.hands.push(Array.from({ length: HAND_SIZE }, () => draw(s, rng)));
  newField(s, rng);
  return s;
}

export const canActOutOfTurn = () => true;
const active = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);

// 他の人には手札の中身と山札を見せない（終局後は公開）
export function viewFor(s, seat) {
  return {
    ...s,
    hands: s.hands.map((h, i) => (i === seat || s.result ? h : null)),
    handCounts: s.hands.map((h) => h.length),
    deck: null, deckCount: s.deck.length, discard: null,
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (you >= 0 && s.out[you]) return 'あなたは投了しました（観戦中）';
  return `「${s.field}」から始まる言葉を早い者勝ちで出そう！`;
}

export const scoreOf = (s, seat) => `手札 ${s.handCounts ? s.handCounts[seat] : s.hands[seat].length}枚`;

const clone = (s) => ({
  ...s, deck: s.deck.slice(), discard: s.discard.slice(), hands: s.hands.map((h) => h.slice()),
  out: s.out.slice(), plays: s.plays.slice(), used: s.used.slice(), flipVotes: s.flipVotes.slice(), history: s.history.slice(),
});

export function applyMove(s, mv, seat, rng) {
  mv = mv || {};
  if (mv.challenge != null) return challenge(s, mv.challenge, seat, rng);
  if (s.result) throw new Error('ゲームは終了しています');
  if (s.out[seat]) throw new Error('投了しています');
  const ns = clone(s);

  if (mv.word != null) {
    const { word, index, card, last } = checkWord(s, seat, mv.word, mv.card);
    ns.hands[seat].splice(index, 1);
    ns.discard.push(ns.fieldCard);
    ns.plays.push({ seat, word, card, prevField: s.field, prevFieldCard: s.fieldCard, challenged: false });
    ns.challengeable = ns.plays.length - 1;
    ns.field = last;
    ns.fieldCard = card;
    ns.used.push(word);
    ns.flipVotes = [];
    ns.history.push(`${word}（${cardLabel(card)}）`);
    if (!ns.hands[seat].length) ns.result = { winner: seat, reason: `「${word}」で上がり`, byPlay: true };
    return ns;
  }

  if (mv.flip) {
    if (!ns.flipVotes.includes(seat)) ns.flipVotes.push(seat);
    flipIfAgreed(ns, rng);
    return ns;
  }

  if (mv.resign) {
    ns.out[seat] = true;
    ns.discard.push(...ns.hands[seat]);
    ns.hands[seat] = [];
    ns.flipVotes = ns.flipVotes.filter((p) => p !== seat);
    ns.history.push(`プレイヤー${seat + 1}が投了`);
    const left = active(ns);
    if (left.length === 1) ns.result = { winner: left[0], reason: '他の全員が投了' };
    else flipIfAgreed(ns, rng);
    return ns;
  }
  throw new Error('不明な操作です');
}

// 残っている全員が投票したら場を流して新しいカードにする
function flipIfAgreed(ns, rng) {
  if (!ns.flipVotes.length || !active(ns).every((p) => ns.flipVotes.includes(p))) return;
  ns.discard.push(ns.fieldCard);
  newField(ns, rng);
  ns.flipVotes = [];
  ns.challengeable = null;
  ns.history.push(`場を流しました → 「${ns.field}」`);
}

// 直前の言葉を取り消す。出した人はカードを手札に戻し、ペナルティで1枚引く
function challenge(s, index, seat, rng) {
  const play = s.plays[index];
  if (!play || s.challengeable !== index) throw new Error('その言葉にはもうダメ出しできません');
  if (play.seat === seat) throw new Error('自分の言葉にはダメ出しできません');
  if (s.result && !s.result.byPlay) throw new Error('ゲームは終了しています');
  if (s.out[seat]) throw new Error('投了しています');
  const ns = clone(s);
  ns.plays[index] = { ...play, challenged: true };
  ns.challengeable = null;
  ns.field = play.prevField;
  ns.fieldCard = play.prevFieldCard;
  const di = ns.discard.findIndex((c) => c.id === play.prevFieldCard.id);
  if (di >= 0) ns.discard.splice(di, 1);
  ns.hands[play.seat].push(play.card, draw(ns, rng));
  ns.used = ns.used.filter((w) => w !== play.word);
  ns.result = null;
  ns.history.push(`✕ ${play.word}（ダメ出し）`);
  return ns;
}
