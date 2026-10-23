// ヒット&ブロー（サーバーとブラウザで共通）
// 2人。それぞれが同じ数字を使わない3けた（または4けた）の秘密の数を決め、交互に相手の数を当てる。
// 当てた数のうち、数字も位置も合っているものが「ヒット」、数字だけ合っているものが「ブロー」。
// 先攻が当てたら、後攻にも同じ回数のチャンスがある（後攻も当てたら引き分け）。
// 手: { secret: '123' } 秘密の数を決める（決める間は相手の番でも動ける） / { guess: '456' } / { resign: true }
export const id = 'hitblow';
export const title = 'ヒット&ブロー';
export const sideNames = ['先攻', '後攻'];
export const logTitle = 'ログ';
export const DIGIT_OPTIONS = [3, 4];

export function normalizeOptions(o) {
  return { digits: DIGIT_OPTIONS.includes(Number(o && o.digits)) ? Number(o.digits) : 3, cpu: !!(o && o.cpu) };
}
export const variantName = (o) => {
  const x = normalizeOptions(o);
  return `${x.digits}けた${x.cpu ? '・CPU対戦' : ''}`;
};

export function init(options) {
  const opts = normalizeOptions(options);
  return {
    options: opts, phase: 'setup', secrets: [null, null], guesses: [[], []],
    turn: 0, solvedAt: [null, null], result: null, history: [],
  };
}

// 数が正しい形か（決まったけた数・同じ数字なし）
export function checkNumber(text, digits) {
  const t = String(text || '').normalize('NFKC').trim();
  if (!new RegExp(`^\\d{${digits}}$`).test(t)) throw new Error(`${digits}けたの数字を入れてください`);
  if (new Set(t).size !== t.length) throw new Error('同じ数字は使えません');
  return t;
}

export function judge(secret, guess) {
  let hit = 0, blow = 0;
  for (let i = 0; i < guess.length; i++) {
    if (secret[i] === guess[i]) hit++;
    else if (secret.includes(guess[i])) blow++;
  }
  return { hit, blow };
}

export const canActOutOfTurn = (s) => s.phase === 'setup';

export function viewFor(s, seat) {
  // 相手の秘密の数は、終わるまで見せない
  return { ...s, secrets: s.secrets.map((x, i) => (i === seat || s.result ? x : x ? 'set' : null)) };
}

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'setup') {
    if (you < 0) return '秘密の数を決めています…';
    return s.secrets[you] ? '相手が秘密の数を決めるのを待っています…' : `秘密の数（${s.options.digits}けた・同じ数字なし）を決めてください`;
  }
  if (you === s.turn) return s.solvedAt[1 - you] != null ? '最後のチャンス！ 相手の数を当ててください' : '相手の数を当ててください';
  return null;
}

export const scoreOf = (s, seat) => `${s.guesses[seat].length}回`;

const clone = (s) => ({
  ...s, secrets: s.secrets.slice(), guesses: s.guesses.map((g) => g.slice()), solvedAt: s.solvedAt.slice(), history: s.history.slice(),
});

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  const ns = clone(s);
  const digits = s.options.digits;
  if (mv.secret != null) {
    if (s.phase !== 'setup') throw new Error('もう決まっています');
    if (s.secrets[seat]) throw new Error('もう決めました');
    ns.secrets[seat] = checkNumber(mv.secret, digits);
    ns.history.push(`${sideNames[seat]}が秘密の数を決めました`);
    if (ns.secrets.every(Boolean)) {
      ns.phase = 'play';
      ns.turn = 0;
      ns.history.push('当てっこ開始！');
    }
    return ns;
  }
  if (mv.guess != null) {
    if (s.phase !== 'play') throw new Error('まだ当てられません');
    if (s.turn !== seat) throw new Error('相手の番です');
    const g = checkNumber(mv.guess, digits);
    const { hit, blow } = judge(s.secrets[1 - seat], g);
    ns.guesses[seat].push({ guess: g, hit, blow });
    ns.history.push(`${sideNames[seat]} ${g} → ${hit}ヒット ${blow}ブロー`);
    if (hit === digits) ns.solvedAt[seat] = ns.guesses[seat].length;
    const other = 1 - seat;
    if (seat === 0) {
      // 先攻が当てても、後攻に同じ回数のチャンス
      ns.turn = 1;
      return ns;
    }
    // 後攻が言い終わったら1ラウンド終わり。どちらかが当てていれば決着
    const [a, b] = ns.solvedAt;
    if (a != null && b != null) ns.result = { winner: null, reason: `同じ${a}回で当てた` };
    else if (a != null) ns.result = { winner: 0, reason: `${a}回で当てた` };
    else if (b != null) ns.result = { winner: 1, reason: `${b}回で当てた` };
    else ns.turn = other;
    return ns;
  }
  throw new Error('不明な操作です');
}

// ---------- CPU ----------
// 秘密の数はでたらめに決め、当てるときは今までの答えと食い違わない数から選ぶ
function allNumbers(digits) {
  const out = [];
  const rec = (pre) => {
    if (pre.length === digits) { out.push(pre); return; }
    for (let d = 0; d <= 9; d++) if (!pre.includes(String(d))) rec(pre + d);
  };
  rec('');
  return out;
}

export function aiMove(s, seat, rng) {
  const pick = (arr) => arr[(rng ? rng(arr.length) : Math.floor(Math.random() * arr.length) + 1) - 1];
  const digits = s.options.digits;
  if (s.phase === 'setup') return s.secrets[seat] ? null : { secret: pick(allNumbers(digits)) };
  if (s.phase !== 'play' || s.turn !== seat) return null;
  const mine = s.guesses[seat];
  const cands = allNumbers(digits).filter((n) => mine.every((g) => {
    const r = judge(n, g.guess);
    return r.hit === g.hit && r.blow === g.blow;
  }));
  return { guess: pick(cands.length ? cands : allNumbers(digits)) };
}
