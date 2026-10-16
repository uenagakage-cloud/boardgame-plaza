// 軍儀のルール（サーバーとブラウザで共通）
// 9×9 の盤。駒は最大3段まで重ねられ（ツケ）、上の段にいるほど遠くまで動ける。動かせるのは一番上の駒だけ。
// 0 = 先手（下側、前は上）、1 = 後手（上側）。盤は board[r][c] = 下から順の駒の配列 [{ o, t }]。
// モード:
//   入門 … 2段まで・固定配置・特殊駒（弓・砲・筒・謀）なし・帥はツケ不可
//   初級 … 2段まで・固定配置・特殊駒は弓のみ・帥はツケ不可
//   中級 … 2段まで・自由配置・全部の駒・帥もツケ可
//   上級 … 3段まで・自由配置・全部の駒・帥もツケ可
// 主なルール:
//   ・自分の段 ≥ 相手の塔の高さ のときだけ、その塔の駒を取ったりツケたりできる（低い駒は高い塔に手を出せない）
//   ・取ると、その塔の敵の駒はすべて取り除かれ（ゲームから除外）、味方の駒は残る
//   ・帥の上には何も重ねられない
//   ・弓・砲・筒は間の駒を飛び越えられる（自分より高い塔は飛び越えられない）。ほかの駒は間に駒があると進めない
//   ・新（あらた）: 持ち駒を、空きマスか自分の駒の上に打つ。自分の一番前の駒より前には打てない
//   ・謀が敵の駒にツケたとき、同じ種類の持ち駒があれば寝返らせられる（敵の駒は除外され、自分の駒に置き換わる）
//   ・自分の帥が取られる手は指せない。相手の帥を詰ませたら勝ち。手がなければ引き分け、同一局面4回・帥だけでも引き分け
// 移動の範囲は gungi.io（公式ルール準拠）の駒の動きの図をもとにしている。
// 手: { from, to, kind: 'move'|'capture'|'tsuke', betray? } / { drop: 種類, to } / 配置中は { place: 種類, to } { done: true } { autoSetup: true }
export const id = 'gungi';
export const title = '軍儀';
export const sideNames = ['先手', '後手'];

export const MODES = {
  intro: { name: '入門', maxTier: 2, marshalStack: false, draft: false, specials: [] },
  beginner: { name: '初級', maxTier: 2, marshalStack: false, draft: false, specials: ['弓'] },
  intermediate: { name: '中級', maxTier: 2, marshalStack: true, draft: true, specials: ['弓', '砲', '筒', '謀'] },
  advanced: { name: '上級', maxTier: 3, marshalStack: true, draft: true, specials: ['弓', '砲', '筒', '謀'] },
};
const SPECIALS = ['弓', '砲', '筒', '謀'];
export const PIECE_COUNTS = { 帥: 1, 大: 1, 中: 1, 小: 2, 侍: 2, 槍: 3, 馬: 2, 忍: 2, 砦: 2, 兵: 4, 砲: 1, 弓: 2, 筒: 1, 謀: 1 };
export const PIECE_ORDER = ['帥', '大', '中', '小', '侍', '槍', '馬', '忍', '砦', '兵', '弓', '砲', '筒', '謀'];
export const PIECE_NAMES = {
  帥: '帥（すい）', 大: '大将', 中: '中将', 小: '小将', 侍: '侍', 槍: '槍', 馬: '馬', 忍: '忍', 砦: '砦', 兵: '兵',
  砲: '砲', 弓: '弓', 筒: '筒', 謀: '謀将',
};
export const JUMPERS = new Set(['弓', '砲', '筒']);
export const VALUES = { 帥: 1000, 大: 9, 中: 8, 小: 5, 侍: 4, 槍: 4, 馬: 4, 忍: 4, 砦: 3, 兵: 1.5, 砲: 5, 弓: 4, 筒: 4, 謀: 3 };

// 先手から見た動き。[行の差, 列の差, その段から動ける（1〜3）か 'run'（遮られるまで）]。行の差がマイナスが前
const L = (dirs, extra = []) => [...dirs.flatMap(([dr, dc]) => [1, 2, 3].map((k) => [dr * k, dc * k, k])), ...extra];
const KING8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const run = (dirs) => dirs.flatMap(([dr, dc]) => Array.from({ length: 8 }, (_, i) => [dr * (i + 1), dc * (i + 1), 'run']));
export const MOVES = {
  帥: L(KING8),
  大: [...run(ORTH), ...L(DIAG)],
  中: [...run(DIAG), ...L(ORTH)],
  小: L([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]]),
  侍: L([[-1, -1], [-1, 0], [-1, 1], [1, 0]]),
  槍: [[-1, -1, 1], [-1, 0, 1], [-1, 1, 1], [1, 0, 1], [-2, 0, 1], [-2, -2, 2], [-2, 2, 2], [-3, 0, 2], [2, 0, 2], [-3, -3, 3], [-3, 3, 3], [-4, 0, 3], [3, 0, 3]],
  馬: [[-1, 0, 1], [-2, 0, 1], [0, -1, 1], [0, 1, 1], [1, 0, 1], [2, 0, 1], [-3, 0, 2], [0, -2, 2], [0, 2, 2], [3, 0, 2], [-4, 0, 3], [0, -3, 3], [0, 3, 3], [4, 0, 3]],
  忍: [...DIAG.flatMap(([dr, dc]) => [[dr, dc, 1], [dr * 2, dc * 2, 1], [dr * 3, dc * 3, 2], [dr * 4, dc * 4, 3]])],
  砦: L([[-1, 0], [0, -1], [0, 1], [1, -1], [1, 1]]),
  兵: L([[-1, 0], [1, 0]]),
  砲: [[-3, 0, 1], [-4, 0, 2], [-5, 0, 3], ...L([[0, -1], [0, 1], [1, 0]])],
  弓: [[-2, -1, 1], [-2, 0, 1], [-2, 1, 1], [-3, -2, 2], [-3, 0, 2], [-3, 2, 2], [-4, -3, 3], [-4, 0, 3], [-4, 3, 3], ...L([[1, 0]])],
  筒: [[-2, 0, 1], [-3, 0, 2], [-4, 0, 3], ...L([[1, -1], [1, 1]])],
  謀: L([[-1, -1], [-1, 1], [1, 0]]),
};

// 固定配置（gungi.io の入門・初級の初期配置）。行は上（後手側）から。小文字 = 後手、大文字 = 先手
const LETTER = { m: '帥', g: '大', i: '中', j: '小', w: '侍', n: '槍', r: '馬', s: '忍', f: '砦', d: '兵', c: '砲', a: '弓', k: '筒', t: '謀' };
const FIXED = {
  intro: '3img3/1s2n2s1/d1fwdwf1d/9/9/9/D1FWDWF1D/1S2N2S1/3GMI3',
  beginner: '3img3/1ra1n1as1/d1fwdwf1d/9/9/9/D1FWDWF1D/1SA1N1AR1/3GMI3',
};
// 自由配置で「おすすめ配置」を使うときの形（先手から見た [行, 列]。後手は180度回す）
const TEMPLATE = [
  ['帥', 8, 4], ['大', 8, 3], ['中', 8, 5], ['忍', 7, 1], ['弓', 7, 2], ['槍', 7, 4], ['弓', 7, 6], ['馬', 7, 7],
  ['兵', 6, 0], ['砦', 6, 2], ['侍', 6, 3], ['兵', 6, 4], ['侍', 6, 5], ['砦', 6, 6], ['兵', 6, 8],
  ['砲', 8, 1], ['筒', 8, 7], ['小', 8, 2], ['小', 8, 6],
];

export function normalizeOptions(o) {
  const mode = o && MODES[o.mode] ? o.mode : 'intro';
  return { mode, cpu: !!(o && o.cpu) };
}
export const variantName = (o) => {
  const x = normalizeOptions(o);
  return MODES[x.mode].name + (x.cpu ? '・CPU対戦' : '');
};

const inB = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9;
const fwd = (p) => (p === 0 ? 1 : -1); // 先手から見た差分を各プレイヤーの向きに直す係数
const top = (st) => st[st.length - 1];
const emptyBoard = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => []));

function pieceSet(mode) {
  const set = { ...PIECE_COUNTS };
  for (const sp of SPECIALS) if (!MODES[mode].specials.includes(sp)) delete set[sp];
  return set;
}

export function init(options) {
  const opts = normalizeOptions(options);
  const mode = MODES[opts.mode];
  const s = {
    options: opts, board: emptyBoard(), hands: [pieceSet(opts.mode), pieceSet(opts.mode)],
    phase: mode.draft ? 'draft' : 'play', done: [false, false], turn: 0,
    lastMove: null, check: false, positions: {}, result: null, history: [],
  };
  if (!mode.draft) {
    // 固定配置: 盤にない駒は持ち駒
    FIXED[opts.mode].split('/').forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { c += Number(ch); continue; }
        const o = ch === ch.toUpperCase() ? 0 : 1;
        const t = LETTER[ch.toLowerCase()];
        s.board[r][c].push({ o, t });
        s.hands[o][t] -= 1;
        c += 1;
      }
    });
    s.positions[posKey(s)] = 1;
  }
  return s;
}

function posKey(s) {
  return s.board.map((row) => row.map((st) => st.map((p) => p.o + p.t).join('') || '.').join(',')).join('/') + s.turn
    + '|' + s.hands.map((h) => PIECE_ORDER.map((t) => h[t] || 0).join('')).join('|');
}

export const tierAt = (st, i) => i + 1;

// ---------- 駒の利き ----------
// (r, c) の一番上の駒が行けるマス: [{ to: [r, c], jump: 間を飛び越えたか }]
export function reachable(board, r, c) {
  const st = board[r][c];
  const piece = top(st);
  if (!piece) return [];
  const tier = st.length, f = fwd(piece.o), jumper = JUMPERS.has(piece.t);
  const out = [];
  const seen = new Set();
  const runBlocked = new Set();
  for (const [dr0, dc0, k] of MOVES[piece.t]) {
    if (k !== 'run' && k > tier) continue;
    const dr = dr0 * f, dc = dc0 * f;
    const tr = r + dr, tc = c + dc;
    if (!inB(tr, tc)) continue;
    const key = tr * 9 + tc;
    if (seen.has(key)) continue;
    if (k === 'run') {
      const dir = Math.sign(dr) * 3 + Math.sign(dc);
      if (runBlocked.has(dir)) continue;
    }
    // 間のマス
    const n = Math.max(Math.abs(dr), Math.abs(dc));
    let blocked = false, jumped = false;
    for (let i = 1; i < n; i++) {
      const mr = r + Math.round((dr * i) / n), mc = c + Math.round((dc * i) / n);
      const h = board[mr][mc].length;
      if (!h) continue;
      if (jumper && h <= tier) { jumped = true; continue; }
      blocked = true;
      break;
    }
    if (blocked) {
      if (k === 'run') runBlocked.add(Math.sign(dr) * 3 + Math.sign(dc));
      continue;
    }
    seen.add(key);
    out.push({ to: [tr, tc], jump: jumped });
    if (k === 'run' && board[tr][tc].length) runBlocked.add(Math.sign(dr) * 3 + Math.sign(dc));
  }
  return out;
}

// p の帥がいるマス
function marshalOf(board, p) {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const st = board[r][c];
    if (st.length && top(st).o === p && top(st).t === '帥') return [r, c];
  }
  return null;
}

// (r, c) の塔を by が取れるか
function attacked(board, r, c, by) {
  const h = board[r][c].length;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    const st = board[i][j];
    if (!st.length || top(st).o !== by || st.length < h) continue;
    if (reachable(board, i, j).some((x) => x.to[0] === r && x.to[1] === c)) return true;
  }
  return false;
}

export function inCheck(board, p) {
  const m = marshalOf(board, p);
  return m ? attacked(board, m[0], m[1], 1 - p) : false;
}

// 駒を動かしたときに取れる選択肢
function targetKinds(s, from, to) {
  const mode = MODES[s.options.mode];
  const src = s.board[from[0]][from[1]], dst = s.board[to[0]][to[1]];
  const piece = top(src), tier = src.length;
  const kinds = [];
  if (!dst.length) return ['move'];
  if (dst.length > tier) return []; // 高い塔には手を出せない
  const t = top(dst);
  if (t.o === piece.o) {
    if (t.t !== '帥' && dst.length < mode.maxTier && (piece.t !== '帥' || mode.marshalStack)) kinds.push('tsuke');
    return kinds;
  }
  const ownBelow = dst.filter((p) => p.o === piece.o).length;
  if (piece.t !== '帥' || mode.marshalStack || ownBelow === 0) kinds.push('capture');
  if (t.t !== '帥' && dst.length < mode.maxTier && (piece.t !== '帥' || mode.marshalStack)) kinds.push('tsuke');
  return kinds;
}

function frontRowOK(s, p, r) {
  // 自分の一番前の駒（塔の一番上が自分の駒）より前には打てない
  let front = p === 0 ? 9 : -1;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    const st = s.board[i][j];
    if (st.length && top(st).o === p) front = p === 0 ? Math.min(front, i) : Math.max(front, i);
  }
  return p === 0 ? r >= front : r <= front;
}

// 手の候補（自分の帥が取られるかどうかは見ない）
function pseudoMoves(s) {
  const p = s.turn, moves = [];
  const mode = MODES[s.options.mode];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const st = s.board[r][c];
    if (!st.length || top(st).o !== p) continue;
    for (const { to, jump } of reachable(s.board, r, c)) {
      for (const kind of targetKinds(s, [r, c], to)) {
        moves.push({ from: [r, c], to, kind, jump });
        const dst = s.board[to[0]][to[1]];
        if (kind === 'tsuke' && top(st).t === '謀' && dst.length && top(dst).o !== p && s.hands[p][top(dst).t] > 0) {
          moves.push({ from: [r, c], to, kind, jump, betray: true });
        }
      }
    }
  }
  for (const t of PIECE_ORDER) {
    if (!s.hands[p][t]) continue;
    for (let r = 0; r < 9; r++) {
      if (!frontRowOK(s, p, r)) continue;
      for (let c = 0; c < 9; c++) {
        const st = s.board[r][c];
        if (st.length && (top(st).o !== p || top(st).t === '帥' || st.length >= mode.maxTier)) continue;
        moves.push({ drop: t, to: [r, c] });
      }
    }
  }
  return moves;
}

function apply(s, m) {
  const board = s.board.map((row) => row.map((st) => st.slice()));
  const hands = [{ ...s.hands[0] }, { ...s.hands[1] }];
  const p = s.turn;
  let captured = [];
  if (m.drop) {
    board[m.to[0]][m.to[1]].push({ o: p, t: m.drop });
    hands[p][m.drop] -= 1;
  } else {
    const piece = board[m.from[0]][m.from[1]].pop();
    const dst = board[m.to[0]][m.to[1]];
    if (m.kind === 'capture') {
      captured = dst.filter((x) => x.o !== p);
      board[m.to[0]][m.to[1]] = dst.filter((x) => x.o === p);
    } else if (m.betray) {
      // 謀の寝返り: すぐ下の敵の駒を、同じ種類の自分の持ち駒と入れ替える
      const enemy = dst.pop();
      captured = [enemy];
      dst.push({ o: p, t: enemy.t });
      hands[p][enemy.t] -= 1;
    }
    board[m.to[0]][m.to[1]].push(piece);
  }
  return { board, hands, captured };
}

export function legalMoves(s) {
  if (s.result || s.phase !== 'play') return [];
  const p = s.turn;
  const checked = inCheck(s.board, p);
  return pseudoMoves(s).filter((m) => {
    // 王手されていなければ、新（打つ）で自分の帥が危なくなることはない
    if (m.drop && !checked) return true;
    return !inCheck(apply(s, m).board, p);
  });
}

// ---------- 自由配置 ----------
const homeRows = (p) => (p === 0 ? [6, 7, 8] : [0, 1, 2]);

export function draftTargets(s, p, t) {
  const mode = MODES[s.options.mode];
  const out = [];
  const placedMarshal = s.board.some((row) => row.some((st) => st.some((x) => x.o === p && x.t === '帥')));
  if (!placedMarshal && t !== '帥') return out;
  for (const r of homeRows(p)) for (let c = 0; c < 9; c++) {
    const st = s.board[r][c];
    if (st.length && (top(st).o !== p || top(st).t === '帥' || st.length >= mode.maxTier)) continue;
    if (t === '帥' && st.length && !mode.marshalStack) continue;
    out.push([r, c]);
  }
  return out;
}

function draftPlace(ns, p, t, r, c) {
  if (!ns.hands[p][t]) throw new Error('その駒は持っていません');
  if (!draftTargets(ns, p, t).some(([a, b]) => a === r && b === c)) {
    const placedMarshal = ns.board.some((row) => row.some((st) => st.some((x) => x.o === p && x.t === '帥')));
    throw new Error(!placedMarshal && t !== '帥' ? '最初は帥を置いてください' : 'そこには置けません（自陣の3段だけ）');
  }
  ns.board[r][c].push({ o: p, t });
  ns.hands[p][t] -= 1;
}

function afterDraftStep(ns, p) {
  if (ns.done[0] && ns.done[1]) {
    ns.phase = 'play';
    ns.turn = 0;
    ns.positions[posKey(ns)] = 1;
    ns.history.push('配置が終わりました。対局開始！');
    return;
  }
  const other = 1 - p;
  ns.turn = ns.done[other] ? p : other;
}

// ---------- 状態の見せ方 ----------
export const canActOutOfTurn = () => false;
export const scoreOf = (s, seat) => {
  const n = PIECE_ORDER.reduce((a, t) => a + (s.hands[seat][t] || 0), 0);
  return `持ち駒 ${n}`;
};

export function phaseText(s, you) {
  if (s.result) return null;
  if (s.phase === 'draft') {
    if (you !== s.turn) return null;
    const placed = s.board.some((row) => row.some((st) => st.some((x) => x.o === you && x.t === '帥')));
    return placed ? 'あなたの配置の番：駒を1つ置くか「配置完了」' : 'あなたの配置の番：まず帥を自陣に置いてください';
  }
  if (you !== s.turn) return null;
  return s.check ? '王手！ 帥を守ってください' : 'あなたの番です';
}

const COLS = '９８７６５４３２１';
const ROWS = '一二三四五六七八九';
export const squareName = (r, c) => COLS[c] + ROWS[r];

const clone = (s) => ({
  ...s, board: s.board.map((row) => row.map((st) => st.slice())), hands: [{ ...s.hands[0] }, { ...s.hands[1] }],
  done: s.done.slice(), positions: { ...s.positions }, history: s.history.slice(),
});

function finishPlayMove(ns, s, m, captured) {
  const p = s.turn;
  const mark = p === 0 ? '▲' : '△';
  let note;
  if (m.drop) note = `${mark}${squareName(...m.to)}${m.drop}新`;
  else {
    const piece = top(ns.board[m.to[0]][m.to[1]]).t;
    note = `${mark}${squareName(...m.from)}${piece}→${squareName(...m.to)}`;
    if (m.kind === 'capture') note += `（取 ${captured.map((x) => x.t).join('')}）`;
    if (m.kind === 'tsuke') note += m.betray ? `ツケ・寝返り（${captured[0].t}）` : 'ツケ';
  }
  ns.turn = 1 - p;
  ns.lastMove = { from: m.from || null, to: m.to, drop: !!m.drop };
  ns.check = inCheck(ns.board, ns.turn);
  if (ns.check) note += ' 王手';
  ns.history.push(note);
  const key = posKey(ns);
  ns.positions[key] = (ns.positions[key] || 0) + 1;
  if (captured.some((x) => x.t === '帥')) { ns.result = { winner: p, reason: '帥を取った' }; return ns; }
  const replies = legalMoves(ns);
  if (!replies.length) ns.result = ns.check ? { winner: p, reason: '詰み' } : { winner: null, reason: '指せる手がない' };
  else if (ns.positions[key] >= 4) ns.result = { winner: null, reason: '同一局面4回' };
  else if (onlyMarshals(ns)) ns.result = { winner: null, reason: '帥だけになった' };
  return ns;
}

function onlyMarshals(s) {
  const pieces = s.board.flat().flat();
  const hands = s.hands.every((h) => PIECE_ORDER.every((t) => !h[t]));
  return hands && pieces.every((x) => x.t === '帥');
}

const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

export function applyMove(s, mv, seat) {
  if (s.result) throw new Error('対局は終了しています');
  mv = mv || {};
  if (s.turn !== seat) throw new Error('あなたの番ではありません');
  const ns = clone(s);

  if (s.phase === 'draft') {
    if (mv.autoSetup) {
      // おすすめ配置: 空いている所に型どおり置いて配置完了
      for (const [t, r0, c0] of TEMPLATE) {
        const [r, c] = seat === 0 ? [r0, c0] : [8 - r0, 8 - c0];
        if (!ns.hands[seat][t] || ns.board[r][c].length) continue;
        if (!draftTargets(ns, seat, t).some(([a, b]) => a === r && b === c)) continue;
        ns.board[r][c].push({ o: seat, t });
        ns.hands[seat][t] -= 1;
      }
      if (!ns.board.some((row) => row.some((st) => st.some((x) => x.o === seat && x.t === '帥')))) throw new Error('帥を置ける場所がありません');
      ns.done[seat] = true;
      ns.history.push(`${sideNames[seat]}がおすすめ配置で配置完了`);
      afterDraftStep(ns, seat);
      return ns;
    }
    if (mv.done) {
      if (!ns.board.some((row) => row.some((st) => st.some((x) => x.o === seat && x.t === '帥')))) throw new Error('先に帥を置いてください');
      ns.done[seat] = true;
      ns.history.push(`${sideNames[seat]}が配置完了`);
      afterDraftStep(ns, seat);
      return ns;
    }
    if (mv.place) {
      const [r, c] = mv.to || [];
      draftPlace(ns, seat, mv.place, r, c);
      ns.history.push(`${seat === 0 ? '▲' : '△'}${squareName(r, c)}${mv.place}（配置）`);
      afterDraftStep(ns, seat);
      return ns;
    }
    throw new Error('配置中です');
  }

  const legal = legalMoves(s);
  const m = legal.find((x) => (mv.drop ? x.drop === mv.drop && same(x.to, mv.to)
    : !x.drop && same(x.from, mv.from) && same(x.to, mv.to) && x.kind === mv.kind && !!x.betray === !!mv.betray));
  if (!m) throw new Error(inCheck(s.board, seat) ? '王手を防ぐ手を指してください' : 'その手は指せません');
  const { board, hands, captured } = apply(s, m);
  ns.board = board;
  ns.hands = hands;
  return finishPlayMove(ns, s, m, captured);
}

// ---------- CPU ----------
function material(s, p) {
  let v = 0;
  for (const row of s.board) for (const st of row) st.forEach((x, i) => {
    const w = VALUES[x.t] * (1 + 0.15 * i);
    v += x.o === p ? w : -w;
  });
  for (const t of PIECE_ORDER) v += 0.8 * VALUES[t] * ((s.hands[p][t] || 0) - (s.hands[1 - p][t] || 0));
  return v;
}

// 相手が次に取れる一番大きい駒の価値（ざっくりした読み）
function worstReply(state) {
  let worst = 0;
  const p = state.turn;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const st = state.board[r][c];
    if (!st.length || top(st).o !== p) continue;
    for (const { to } of reachable(state.board, r, c)) {
      const dst = state.board[to[0]][to[1]];
      if (!dst.length || top(dst).o === p || dst.length > st.length) continue;
      const v = dst.filter((x) => x.o !== p).reduce((a, x) => a + VALUES[x.t], 0);
      worst = Math.max(worst, v);
    }
  }
  return worst;
}

// 相手の一番よい返し（盤上の駒の動きだけ）を読んだあとの駒得
function replyValue(next, seat) {
  let worst = Infinity;
  for (const r of pseudoMoves(next)) {
    if (r.drop) continue;
    const after = apply(next, r);
    if (after.captured.some((x) => x.t === '帥')) return -10000;
    const v = material({ ...next, board: after.board, hands: after.hands }, seat);
    if (v < worst) worst = v;
  }
  return worst === Infinity ? material(next, seat) : worst;
}

export function aiMove(s, seat, rng) {
  const rand = rng ? () => (rng(1000) - 1) / 1000 : Math.random;
  if (s.phase === 'draft') return { autoSetup: true };
  let best = null, bestScore = -Infinity;
  for (const m of legalMoves(s)) {
    const { board, hands, captured } = apply(s, m);
    const next = { ...s, board, hands, turn: 1 - seat };
    let score;
    if (captured.some((x) => x.t === '帥')) score = 100000;
    else if (inCheck(board, 1 - seat) && !legalMoves({ ...next, result: null, phase: 'play' }).length) score = 100000; // 詰み
    else {
      // 相手の返しを読む（読みの安全のため、1手読みの駒得との平均もとる）
      score = 0.75 * replyValue(next, seat) + 0.25 * (material(next, seat) - 0.9 * worstReply(next));
      if (inCheck(board, 1 - seat)) score += 0.5;
      if (m.drop) score -= 0.3; // 持ち駒は少し温存
      else if (s.board[m.from[0]][m.from[1]].at(-1).t === '帥' && !inCheck(s.board, seat)) score -= 0.4; // 帥はむやみに動かさない
    }
    score += rand() * 0.2;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best ? { from: best.from, to: best.to, kind: best.kind, betray: best.betray, drop: best.drop } : null;
}
