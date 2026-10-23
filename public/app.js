import * as chess from './games/chess.js';
import * as shogi from './games/shogi.js';
import * as gobblet from './games/gobblet.js';
import * as gomoku from './games/gomoku.js';
import * as othello from './games/othello.js';
import * as wordbasket from './games/wordbasket.js';
import * as catchoco from './games/catchoco.js';
import * as uno from './games/uno.js';
import * as werewolf from './games/werewolf.js';
import * as ito from './games/ito.js';
import * as daifugo from './games/daifugo.js';
import * as poker from './games/poker.js';
import * as blokus from './games/blokus.js';
import * as paint from './games/paint.js';
import * as skull from './games/skull.js';
import * as gungi from './games/gungi.js';
import * as towerbattle from './games/towerbattle.js';
import * as hitblow from './games/hitblow.js';
import * as dotsboxes from './games/dotsboxes.js';
import * as asasore from './games/asasore.js';
import * as geister from './games/geister.js';
import * as mancala from './games/mancala.js';
import * as connect4 from './games/connect4.js';

const GAMES = { chess, shogi, gobblet, gomoku, othello, wordbasket, catchoco, uno, werewolf, ito, daifugo, poker, blokus, paint, skull, gungi, towerbattle, hitblow, dotsboxes, asasore, geister, mancala, connect4 };
const GAME_INFO = {
  chess: { icon: '♞', desc: '8×8の盤でキングを詰ませる西洋の定番。' },
  shogi: { icon: '☖', desc: '取った駒を使える日本の将棋。成り・持ち駒あり。' },
  gobblet: { icon: '◉', desc: '大きいコマで小さいコマをかぶせる三目並べ。' },
  gomoku: { icon: '⚫', desc: '15×15の盤で縦・横・斜めに5つ並べたら勝ち。' },
  othello: { icon: '◐', desc: '相手の石をはさんで裏返す。最後に多い方が勝ち。' },
  wordbasket: { icon: '🧺', desc: '場の文字で始まり手札の文字で終わる言葉を早い者勝ちで。2〜6人。' },
  catchoco: { icon: '🐈‍⬛', desc: '手持ちのアイテムでピンチを切り抜ける大喜利。チーム戦・2〜6人。' },
  uno: { icon: '🃏', desc: '色か数字を合わせてカードを出し、先に手札をなくそう。2〜6人。' },
  werewolf: { icon: '🐺', desc: '夜は1回だけ。話し合いで人狼を見つけて処刑しよう。3〜6人。' },
  ito: { icon: '🔢', desc: '数字を言葉で表して、みんなで小さい順に並べる協力ゲーム。2〜10人。' },
  daifugo: { icon: '👑', desc: '強いカードを出して先に手札をなくそう。8切り・革命あり。' },
  poker: { icon: '♠', desc: 'テキサスホールデム。チップを賭けて役で勝負。' },
  blokus: { icon: '🟦', desc: '角どうしをつなげてピースを置き、陣地を広げよう。2〜4人。' },
  geister: { icon: '👻', desc: '良いおばけと悪いおばけの正体を隠して戦う、かけひきのゲーム。CPU対戦あり。' },
  mancala: { icon: '🥣', desc: '穴に石をまいて、自分のゴールにたくさん集める。CPU対戦あり。' },
  connect4: { icon: '🔴', desc: '上からコマを落として、縦横ななめに4つ並べたら勝ち。CPU対戦あり。' },
  hitblow: { icon: '🔢', desc: '相手の秘密の数を、ヒットとブローのヒントで当てる推理ゲーム。CPU対戦あり。' },
  dotsboxes: { icon: '▦', desc: '点と点を線でつなぎ、四角を閉じたらもらえる陣取り。2〜4人。' },
  asasore: { icon: '🌅', desc: '親が書きそうな答えを当てる！ お題に全員で答える心理ゲーム。3〜8人。' },
  towerbattle: { icon: '🦒', desc: '順番に動物を島に積み上げる。落とした人は脱落、最後まで残った人の勝ち。2〜8人。' },
  paint: { icon: '🎨', desc: '直線と円しか描けないお絵かき（フリーハンドも可）でお題を当てっこ。2〜8人。' },
  gungi: { icon: '軍', desc: '駒を最大3段まで積み上げる立体将棋。入門〜上級・CPU対戦あり。' },
  skull: { icon: '💀', desc: '花とドクロを伏せて置き、ドクロを避けて何枚めくれるか宣言するブラフゲーム。3〜6人。' },
};

const $ = (s) => document.querySelector(s);
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動く */ } },
};
const uid = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
// タブごとに別のプレイヤーとして扱い、リロードしても席が戻るよう sessionStorage に保存
const CLIENT_ID = (() => {
  try {
    let id = sessionStorage.getItem('clientId');
    if (!id) { id = uid(); sessionStorage.setItem('clientId', id); }
    return id;
  } catch { return uid(); }
})();

// ---------- 通信 ----------
let ws = null;
let view = null;       // 現在の部屋の状態
let lobby = { rooms: [], online: 0 };
let sel = null;        // 選択中の駒
let selKey = '';
let serverOffset = 0; // サーバーの時刻 − 手元の時刻

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    $('#conn').className = 'conn on';
    send({ type: 'hello', clientId: CLIENT_ID, name: myName() });
    const code = location.hash.slice(1);
    if (code) send({ type: 'join', code });
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'lobby') {
      lobby = m;
      if (!view) render();
    } else if (m.type === 'room') {
      if (!GAMES[m.game]) { toast('アプリが更新されました。ページを再読み込みしてください'); return; }
      if (m.serverTime) serverOffset = m.serverTime - Date.now();
      const key = `${m.code}:${m.gameNo}:${m.state ? m.state.history.length : -1}`;
      if (key !== selKey) { sel = null; selKey = key; }
      view = m;
      if (location.hash.slice(1) !== m.code) history.replaceState(null, '', '#' + m.code);
      render();
    } else if (m.type === 'kicked') {
      toast('部屋から外されました');
    } else if (m.type === 'left') {
      view = null;
      history.replaceState(null, '', location.pathname);
      render();
    } else if (m.type === 'error') {
      toast(m.message);
      if (wbPending) { restoreWordInput(); }
      if (m.code === 'NO_ROOM') {
        view = null;
        history.replaceState(null, '', location.pathname);
        render();
      }
    }
  };
  ws.onclose = () => {
    $('#conn').className = 'conn off';
    setTimeout(connect, 1500);
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  else toast('サーバーに接続中です…');
}

const myName = () => store.get('name', '') || '名無し';

// ---------- 共通UI ----------
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
}

function choose(title, options) {
  return new Promise((resolve) => {
    const modal = $('#modal');
    $('#modal-title').textContent = title;
    const box = $('#modal-options');
    box.replaceChildren();
    const done = (v) => { modal.hidden = true; modal.onclick = null; resolve(v); };
    for (const [value, label] of options) {
      const b = h('button', 'btn', label);
      b.onclick = (e) => { e.stopPropagation(); done(value); };
      box.append(b);
    }
    modal.onclick = (e) => { if (e.target === modal) done(null); };
    modal.hidden = false;
  });
}

function sendMove(move) {
  sel = null;
  // 感想戦中は本番の手ではなく、感想戦の盤に指す
  send(view && view.review ? { type: 'review', move } : { type: 'move', move });
  render();
}

// ---------- ロビー ----------
function renderLobby() {
  const cards = $('#game-cards');
  if (!cards.childElementCount) {
    // 2人用と多人数用に分けて、小さめのカードを何列かに並べる
    const groups = [['2人で対戦', h('div', 'cards')], ['みんなで遊ぶ', h('div', 'cards')]];
    for (const [title, grid] of groups) cards.append(h('h2', 'cards-title', title), grid);
    for (const [key, g] of Object.entries(GAMES)) {
      const multi = (g.maxPlayers || 2) > 2;
      const card = h('div', 'card game-' + key);
      const head = h('div', 'card-head');
      // 長い名前は語の切れ目で折り返す（​ は改行してよい位置）
      const shortTitle = g.title.replace(/(ゴブレット|ワンナイト|ワード|＆)/, '$1​');
      head.append(h('span', 'card-icon', GAME_INFO[key].icon), h('h3', null, shortTitle),
        h('span', 'card-players', multi ? `${g.minPlayers}〜${g.maxPlayers}人` : '2人'));
      card.append(head, h('p', 'muted', GAME_INFO[key].desc));
      groups[multi ? 1 : 0][1].append(card);
      let getOptions = () => ({});
      if (key === 'gomoku') {
        const toggle = h('label', 'option-toggle');
        const cb = h('input');
        cb.type = 'checkbox';
        cb.checked = store.get('gomokuRenju', '0') === '1';
        cb.onchange = () => store.set('gomokuRenju', cb.checked ? '1' : '0');
        toggle.append(cb, h('span', null, '禁じ手あり'));
        toggle.title = '黒の三三・四四・長連を禁止';
        card.append(toggle);
        getOptions = () => ({ renju: cb.checked });
      }
      if (key === 'gungi') {
        const label = h('label', 'option-toggle');
        const select = h('select', 'size-select');
        for (const [k, m] of Object.entries(gungi.MODES)) { const o = h('option', null, m.name); o.value = k; select.append(o); }
        select.value = store.get('gungiMode', 'intro');
        select.onchange = () => store.set('gungiMode', select.value);
        label.append(h('span', null, 'モード'), select);
        const cpuLabel = h('label', 'option-toggle');
        const cpu = h('input');
        cpu.type = 'checkbox';
        cpu.checked = store.get('gungiCpu', '0') === '1';
        cpu.onchange = () => store.set('gungiCpu', cpu.checked ? '1' : '0');
        cpuLabel.append(cpu, h('span', null, 'CPUと対戦'));
        card.append(label, cpuLabel);
        getOptions = () => ({ mode: select.value, cpu: cpu.checked });
      }
      if (key === 'daifugo') {
        // ルールの細かい設定（開いて選ぶ）。選んだものは次も使えるよう覚えておく
        let saved = {};
        try { saved = JSON.parse(store.get('daifugoRules', '{}')) || {}; } catch { saved = {}; }
        const rules = daifugo.normalizeOptions(saved);
        const box = h('div', 'df-rules');
        const btn = h('button', 'btn small df-rules-btn', '⚙ ルール設定');
        btn.type = 'button';
        const desc = h('div', 'muted small df-rules-now');
        const refresh = () => { desc.textContent = daifugo.variantName(rules); store.set('daifugoRules', JSON.stringify(rules)); };
        btn.onclick = () => openDaifugoRules(rules, refresh);
        box.append(btn, desc);
        card.append(box);
        refresh();
        getOptions = () => ({ ...rules });
      }
      if (key === 'geister' || key === 'connect4' || key === 'mancala') {
        let seeds = null;
        if (key === 'mancala') {
          const label = h('label', 'option-toggle');
          seeds = h('select', 'size-select');
          for (const n of mancala.SEED_OPTIONS) { const o = h('option', null, `石${n}個`); o.value = String(n); seeds.append(o); }
          seeds.value = store.get('mcSeeds', '4');
          seeds.onchange = () => store.set('mcSeeds', seeds.value);
          label.append(h('span', null, '穴の石'), seeds);
          card.append(label);
        }
        const cpuLabel = h('label', 'option-toggle');
        const cpu = h('input');
        cpu.type = 'checkbox';
        cpu.checked = store.get(key + 'Cpu', '0') === '1';
        cpu.onchange = () => store.set(key + 'Cpu', cpu.checked ? '1' : '0');
        cpuLabel.append(cpu, h('span', null, 'CPUと対戦'));
        card.append(cpuLabel);
        getOptions = () => ({ cpu: cpu.checked, ...(seeds ? { seeds: Number(seeds.value) } : {}) });
      }
      if (key === 'hitblow') {
        const label = h('label', 'option-toggle');
        const select = h('select', 'size-select');
        for (const n of hitblow.DIGIT_OPTIONS) { const o = h('option', null, `${n}けた`); o.value = String(n); select.append(o); }
        select.value = store.get('hbDigits', '3');
        select.onchange = () => store.set('hbDigits', select.value);
        label.append(h('span', null, 'けた数'), select);
        const cpuLabel = h('label', 'option-toggle');
        const cpu = h('input');
        cpu.type = 'checkbox';
        cpu.checked = store.get('hbCpu', '0') === '1';
        cpu.onchange = () => store.set('hbCpu', cpu.checked ? '1' : '0');
        cpuLabel.append(cpu, h('span', null, 'CPUと対戦'));
        card.append(label, cpuLabel);
        getOptions = () => ({ digits: Number(select.value), cpu: cpu.checked });
      }
      if (key === 'dotsboxes') {
        const label = h('label', 'option-toggle');
        const select = h('select', 'size-select');
        for (const n of dotsboxes.SIZES) { const o = h('option', null, `${n}×${n}マス`); o.value = String(n); select.append(o); }
        select.value = store.get('dbSize', '4');
        select.onchange = () => store.set('dbSize', select.value);
        label.append(h('span', null, '大きさ'), select);
        card.append(label);
        getOptions = () => ({ size: Number(select.value) });
      }
      if (key === 'asasore') {
        const mk = (labelText, storeKey, values, fmt, def) => {
          const label = h('label', 'option-toggle');
          const select = h('select', 'size-select');
          for (const n of values) { const o = h('option', null, fmt(n)); o.value = String(n); select.append(o); }
          select.value = store.get(storeKey, String(def));
          select.onchange = () => store.set(storeKey, select.value);
          label.append(h('span', null, labelText), select);
          card.append(label);
          return select;
        };
        const turns = mk('親の回数', 'asTurns', [1, 2, 3], (n) => `1人${n}回`, 1);
        const secs = mk('書く時間', 'asSeconds', [60, 90, 120, 0], (n) => (n ? `${n}秒` : 'なし'), 90);
        getOptions = () => ({ turns: Number(turns.value), seconds: Number(secs.value) });
      }
      if (key === 'towerbattle') {
        const label = h('label', 'option-toggle');
        const select = h('select', 'size-select');
        for (const n of [15, 30, 60]) { const o = h('option', null, `${n}秒`); o.value = String(n); select.append(o); }
        select.value = store.get('towerSeconds', '30');
        select.onchange = () => store.set('towerSeconds', select.value);
        label.append(h('span', null, '持ち時間'), select);
        card.append(label);
        getOptions = () => ({ seconds: Number(select.value) });
      }
      if (key === 'paint') {
        const mk = (labelText, storeKey, values, fmt, def) => {
          const label = h('label', 'option-toggle');
          const select = h('select', 'size-select');
          for (const n of values) { const o = h('option', null, fmt(n)); o.value = String(n); select.append(o); }
          select.value = store.get(storeKey, String(def));
          select.onchange = () => store.set(storeKey, select.value);
          label.append(h('span', null, labelText), select);
          card.append(label);
          return select;
        };
        const painterSel = mk('描く人', 'paintPainter', Object.keys(paint.PAINTER_MODES), (m) => paint.PAINTER_MODES[m], 'rotate');
        const turnsLabel = (n) => (painterSel.value === 'fixed' ? `${n * paint.FIXED_ROUNDS_PER_TURN}問` : `1人${n}回`);
        const turns = mk('描く回数', 'paintTurns', [1, 2, 3], turnsLabel, 1);
        const secs = mk('制限時間', 'paintSeconds', [60, 90, 120], (n) => `${n}秒`, 90);
        const mode = mk('描き方', 'paintMode', Object.keys(paint.MODES), (m) => paint.MODES[m], 'ponkotsu');
        painterSel.title = '固定にすると、部屋を作った人（ホスト）がずっと描きます';
        painterSel.addEventListener('change', () => { [...turns.options].forEach((o) => { o.textContent = turnsLabel(Number(o.value)); }); });
        const gal = h('button', 'btn small', '🖼 過去のイラスト');
        gal.onclick = () => openPaintGallery();
        card.append(gal);
        getOptions = () => ({ turns: Number(turns.value), seconds: Number(secs.value), mode: mode.value, painter: painterSel.value });
      }
      const row = h('div', 'side-pick');
      const sides = (g.maxPlayers || 2) > 2 ? [[null, '']] : [[null, 'おまかせ'], [0, g.sideNames[0]], [1, g.sideNames[1]]];
      for (const [side, label] of sides) {
        const b = h('button', side === null ? 'btn primary' : 'btn', side === null ? '部屋を作る' : label);
        b.title = side === null ? ((g.maxPlayers || 2) > 2 ? `${g.minPlayers}〜${g.maxPlayers}人で遊べます` : '手番はランダムに決まります') : `${label}（${side === 0 ? '先手' : '後手'}）で部屋を作る`;
        b.onclick = () => send({ type: 'create', game: key, side, options: getOptions() });
        row.append(b);
      }
      card.append(row);
    }
  }
  $('#online').textContent = lobby.online ? `・${lobby.online}人が接続中` : '';
  const list = $('#room-list');
  list.replaceChildren();
  if (!lobby.rooms.length) list.append(h('li', 'empty muted', 'まだ部屋はありません。上のボタンから作成できます。'));
  const statusLabel = { waiting: '募集中', playing: '対局中', finished: '終局' };
  for (const r of lobby.rooms) {
    if (!GAMES[r.game]) continue; // 古いページでは知らないゲームを表示しない
    const li = h('li', 'room-item');
    li.append(
      h('span', 'badge ' + r.status, statusLabel[r.status]),
      h('span', 'room-game', GAMES[r.game].title + (r.variant ? `（${r.variant}）` : '')),
      h('span', 'room-players', r.multi
        ? `${r.players.filter(Boolean).join('・')}（${r.players.filter(Boolean).length}人）`
        : r.players.map((p) => p || '（空席）').join(' vs ')),
      h('code', 'muted', r.code),
    );
    const b = h('button', r.status === 'waiting' ? 'btn primary small' : 'btn small', r.status === 'waiting' ? '参加' : '観戦');
    b.onclick = () => send({ type: 'join', code: r.code, spectate: r.status !== 'waiting' });
    li.append(b);
    list.append(li);
  }
}

// ---------- 部屋 ----------
function canAct(v) {
  return v.you >= 0 && v.ready && !v.state.result &&
    (v.state.turn === v.you || !!GAMES[v.game].canActOutOfTurn?.(v.state));
}

function renderPlayer(el, v, seat) {
  const g = GAMES[v.game], p = v.seats[seat], s = v.state;
  el.replaceChildren();
  el.className = 'player' + (s && !s.result && v.ready && s.turn === seat ? ' to-move' : '');
  el.append(h('span', `side-chip ${v.game}-side${seat}`, g.sideNames[seat]));
  const pn = h('span', p ? 'pname' : 'muted', p ? p.name : '対戦相手を待っています…');
  pn.dataset.seat = String(seat);
  el.append(pn);
  if (p && seat === v.hostSeat) el.append(h('span', 'host-tag', 'ホスト'));
  if (p && seat === v.you) el.append(h('span', 'you-tag', 'あなた'));
  if (p) el.append(h('span', 'dot ' + (p.online ? 'on' : 'off'), ''));
  if (!s) return;
  if (g.scoreOf) el.append(h('span', 'score', `${g.scoreOf(s, seat)}`));
  if (s.result && s.result.winner === seat) el.append(h('span', 'win-tag', '勝ち'));
}

function statusText(v) {
  const g = GAMES[v.game], s = v.state;
  const nameOf = (seat) => (v.multi ? `${v.seats[seat]?.name || '?'} さん` : g.sideNames[seat]);
  const named = (t) => (v.multi ? t.replace(/(?:P|プレイヤー)(\d+)/g, (all, n) => v.seats[n - 1]?.name || all) : t);
  if (!v.ready) {
    if (!v.multi) return ['wait', '対戦相手を待っています。招待リンクを送りましょう。'];
    const n = v.seats.filter(Boolean).length;
    if (v.you >= 0 && v.you === v.hostSeat) return ['wait', `参加者 ${n}人。${v.minPlayers}人以上そろったら「ゲーム開始」を押してください。`];
    return ['wait', `参加者 ${n}人。ホストの開始を待っています…`];
  }
  if (s.result && v.review) {
    const r = v.review, rs = r.state;
    const where = r.branch ? `${r.ply}手目から変化 ${r.branch}手` : r.ply === r.total ? '終局の局面' : r.ply === 0 ? '開始局面' : `${r.ply}手目`;
    const next = rs.result ? '（この局面で終局）' : `・${g.sideNames[rs.turn]}の番`;
    return ['mine', `感想戦：${where}${next}`];
  }
  if (s.result) {
    if (s.result.winners) {
      // チーム戦
      if (!s.result.winners.length) return ['end', s.result.allLose ? named(s.result.reason) : `引き分け（${named(s.result.reason)}）`];
      const team = g.TEAM_NAMES?.[s.result.team] || '';
      const who = v.you >= 0 ? (s.result.winners.includes(v.you) ? `${team}（あなたのチーム）の勝ち！` : `${team}の勝ち。あなたのチームの負け`) : `${team}の勝ち`;
      return ['end', `${who}（${named(s.result.reason)}）`];
    }
    if (s.result.winner == null) return ['end', `引き分け（${named(s.result.reason)}）`];
    const who = v.you === s.result.winner ? 'あなたの勝ち！' : v.you >= 0 && !v.multi ? 'あなたの負け' : `${nameOf(s.result.winner)}の勝ち`;
    return ['end', `${who}（${named(s.result.reason)}）`];
  }
  const phase = g.phaseText?.(s, v.you);
  if (phase) return [v.you >= 0 ? 'mine' : 'spec', phase];
  const check = s.check ? (v.game === 'shogi' ? '王手！ ' : 'チェック！ ') : !v.multi && String(s.history.at(-1) || '').endsWith('パス') ? `${g.sideNames[1 - s.turn]}はパス。 ` : '';
  if (v.you < 0) return ['spec', `${check}${v.multi ? nameOf(s.turn) : g.sideNames[s.turn]}の番です（観戦中）`];
  return s.turn === v.you ? ['mine', `${check}あなたの番です`] : ['theirs', `${check}${v.multi ? nameOf(s.turn) + 'の番です' : '相手の番です'}`];
}

function renderRoom() {
  const v = view, g = GAMES[v.game], bottom = v.you === 1 ? 1 : 0;
  $('#room-title').textContent = g.title + (v.variant ? ` · ${v.variant}` : '') + (v.gameNo > 1 && !g.lobbyReturn ? `（第${v.gameNo}局）` : '');
  $('#room-code').textContent = v.code;
  $('#player-top').hidden = $('#player-bottom').hidden = v.multi;
  if (!v.multi) {
    renderPlayer($('#player-top'), v, 1 - bottom);
    renderPlayer($('#player-bottom'), v, bottom);
  }
  const [cls, text] = statusText(v);
  const st = $('#status');
  st.className = 'status ' + cls;
  st.textContent = text;

  // 操作ボタン
  const ctl = $('#controls');
  ctl.replaceChildren();
  if (v.you >= 0 && !v.ready && v.multi && v.you === v.hostSeat) {
    const start = h('button', 'btn primary', 'ゲーム開始');
    start.disabled = v.seats.filter(Boolean).length < v.minPlayers;
    start.onclick = () => send({ type: 'start' });
    ctl.append(start);
  }
  if (v.you >= 0 && v.ready) {
    const s = v.state, opp = 1 - v.you;
    if (!s.result) {
      if (v.multi) {
        // 多人数ゲームに引き分け提案はない
      } else if (v.drawOffer === opp) {
        ctl.append(h('span', 'offer', '相手が引き分けを提案しています'));
        const yes = h('button', 'btn primary', '受ける'); yes.onclick = () => send({ type: 'acceptDraw' });
        const no = h('button', 'btn', '断る'); no.onclick = () => send({ type: 'declineDraw' });
        ctl.append(yes, no);
      } else {
        const draw = h('button', 'btn', v.drawOffer === v.you ? '引き分け提案中…' : '引き分けを提案');
        draw.disabled = v.drawOffer === v.you;
        draw.onclick = () => send({ type: 'offerDraw' });
        ctl.append(draw);
      }
      if (!g.noResign) {
        const resign = h('button', 'btn danger', '投了');
        resign.disabled = !!(v.multi && s.out && s.out[v.you]);
        resign.onclick = async () => { if (await choose('本当に投了しますか？', [['yes', '投了する'], [null, 'キャンセル']])) send({ type: 'resign' }); };
        ctl.append(resign);
      }
    } else if (v.multi) {
      const want = v.rematch.filter(Boolean).length;
      const again = h('button', 'btn primary', v.rematch[v.you] ? `ほかの人を待っています…（${want}/${v.rematch.length}）` : `もう一度遊ぶ（${want}/${v.rematch.length}人が希望）`);
      again.disabled = v.rematch[v.you];
      again.onclick = () => send({ type: 'rematch' });
      ctl.append(again);
    } else {
      if (g.reviewable) renderReviewControls(ctl, v);
      const again = h('button', 'btn primary', v.rematch[v.you] ? '相手の返事を待っています…' : v.rematch[opp] ? '再戦を受ける' : '再戦する（先後入れ替え）');
      again.disabled = v.rematch[v.you];
      again.onclick = () => send({ type: 'rematch' });
      if (v.rematch[opp] && !v.rematch[v.you]) ctl.append(h('span', 'offer', '相手が再戦を希望しています'));
      ctl.append(again);
    }
  }

  // 棋譜（ゲームによっては「ログ」）
  $('#history-title').textContent = g.logTitle || '棋譜';
  const hist = $('#history');
  const withNames = (m) => (v.multi ? m.replace(/(?:P|プレイヤー)(\d+)/g, (all, n) => v.seats[n - 1]?.name || all) : m);
  hist.replaceChildren(...(v.state ? v.state.history : []).map((m, i) => h('li', null, `${i + 1}. ${withNames(m)}`)));
  if (v.review) {
    // 感想戦: 今の手を目立たせ、手をクリックするとその局面へ。変化は本譜の下に出す
    const r = v.review;
    [...hist.children].forEach((li, i) => {
      li.classList.add('review-move');
      if (i === r.ply - 1) li.classList.add(r.branch ? 'review-base' : 'review-now');
      if (v.you >= 0) li.onclick = () => send({ type: 'review', action: 'goto', ply: i + 1 });
    });
    r.state.history.slice(r.ply).forEach((m, k) => {
      const li = h('li', 'review-branch' + (k === r.branch - 1 ? ' review-now' : ''), `変化 ${r.ply + k + 1}. ${m}`);
      hist.append(li);
    });
    const now = hist.querySelector('.review-now') || hist.querySelector('.review-base');
    if (now) now.scrollIntoView({ block: 'nearest' });
  } else hist.scrollTop = hist.scrollHeight;

  // チャット
  $('#spectators').textContent = v.spectators ? `・観戦 ${v.spectators}人` : '';
  const log = $('#chat-log');
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
  log.replaceChildren(...v.chat.map((c) => {
    const li = h('li', c.system ? 'system' : '');
    if (!c.system) li.append(h('b', c.seat >= 0 ? `${v.game}-side${c.seat}-text` : 'muted', c.name), ' ');
    li.append(c.text);
    return li;
  }));
  if (atBottom) log.scrollTop = log.scrollHeight;
  nicoFeed(v);
  document.body.classList.toggle('is-host', v.you >= 0 && v.you === v.hostSeat);
  $('#quick-chat-btn').hidden = !$('#quick-chat').hidden;

  if (v.state && v.review) RENDERERS[v.game]($('#board'), { ...v, state: v.review.state, reviewing: true }, v.you >= 0 && !v.review.state.result);
  else if (v.state) RENDERERS[v.game]($('#board'), v, canAct(v));
  else renderWaiting($('#board'), v);
}

// 感想戦のボタン（⏮ ◀ ▶ ⏭・本譜に戻る・終わる）
function renderReviewControls(ctl, v) {
  const r = v.review;
  const go = (msg) => send({ type: 'review', ...msg });
  if (!r) {
    const start = h('button', 'btn', '感想戦をする');
    start.title = '局面を戻したり、別の手を試したりできます（相手と同じ盤を見ます）';
    start.onclick = () => go({ action: 'start' });
    ctl.append(start);
    return;
  }
  const btn = (label, title, disabled, msg) => {
    const b = h('button', 'btn small review-nav', label);
    b.title = title;
    b.disabled = disabled;
    b.onclick = () => go(msg);
    return b;
  };
  ctl.append(
    btn('⏮', '開始局面へ', r.ply === 0 && !r.branch, { action: 'goto', ply: 0 }),
    btn('◀', '1手戻る', r.ply === 0 && !r.branch, { action: 'back' }),
    btn('▶', '本譜を1手進める', !!r.branch || r.ply >= r.total, { action: 'goto', ply: r.ply + 1 }),
    btn('⏭', '終局の局面へ', r.ply === r.total && !r.branch, { action: 'goto', ply: r.total }),
  );
  if (r.branch) {
    const back = h('button', 'btn small', '本譜に戻る');
    back.onclick = () => go({ action: 'goto', ply: r.ply });
    ctl.append(back);
  }
  const end = h('button', 'btn small ghost', '感想戦を終わる');
  end.onclick = () => go({ action: 'end' });
  ctl.append(end);
  ctl.append(h('span', 'muted small review-help', '盤で駒を動かすと別の手（変化）を試せます。棋譜の手をクリックするとその局面へ。'));
}

// 多人数ゲームの開始前の待合室
function renderWaiting(el, v) {
  const box = h('div', 'waiting-room');
  box.append(h('h3', null, `参加者（${v.seats.filter(Boolean).length}/${v.seats.length}）`));
  const ul = h('ul', 'waiting-list');
  const host = v.you >= 0 && v.you === v.hostSeat;
  v.seats.forEach((p, i) => {
    if (!p) return;
    const li = h('li', null, p.name);
    if (i === v.hostSeat) li.append(' ', h('span', 'host-tag', 'ホスト'));
    if (i === v.you) li.append(' ', h('span', 'you-tag', 'あなた'));
    li.append(h('span', 'dot ' + (p.online ? 'on' : 'off')));
    if (host && i !== v.you) {
      const kick = h('button', 'btn small ghost', '外す');
      kick.onclick = async () => {
        if (await choose(`${p.name} を外しますか？`, [['yes', '外す'], [null, 'キャンセル']])) send({ type: 'kick', seat: i });
      };
      li.append(kick);
    }
    ul.append(li);
  });
  box.append(ul);
  if (v.you < 0 && v.seats.some((p) => !p)) {
    const join = h('button', 'btn primary', 'この部屋に参加する');
    join.onclick = () => send({ type: 'join', code: v.code });
    box.append(join);
  }
  box.append(h('p', 'muted small', '招待リンクを送って友だちを呼びましょう。開始後に入った人は観戦になります。'));
  if (v.game === 'ito') renderItoSettings(box, v);
  el.replaceChildren(box);
}

function render() {
  $('#lobby').hidden = !!view;
  $('#room').hidden = !view;
  if (view) renderRoom();
  else {
    renderLobby();
    $('#quick-chat').hidden = $('#quick-chat-btn').hidden = true;
    $('#nico').replaceChildren();
  }
}

// ---------- チェス ----------
const CHESS_GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

function renderChess(el, v, act) {
  const s = v.state, flip = v.you === 1;
  const legal = act ? chess.legalMoves(s) : [];
  const targets = sel ? legal.filter((m) => eq(m.from, sel.from)) : [];
  const king = s.check ? chess.findKing(s.board, s.turn === 0 ? 'w' : 'b') : null;
  const board = h('div', 'board chess-board' + (act ? ' active' : ''));
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const r = flip ? 7 - i : i, c = flip ? 7 - j : j, here = [r, c];
    const cell = h('div', 'sq ' + ((r + c) % 2 ? 'dark' : 'light'));
    if (s.lastMove && (eq(s.lastMove.from, here) || eq(s.lastMove.to, here))) cell.classList.add('last');
    if (sel && eq(sel.from, here)) cell.classList.add('sel');
    if (eq(king, here)) cell.classList.add('check');
    const p = s.board[r][c];
    if (p) cell.append(h('span', 'cp ' + (p[0] === 'w' ? 'white' : 'black'), CHESS_GLYPH[p[1]] + '︎'));
    const t = targets.find((m) => eq(m.to, here));
    if (t) cell.append(h('span', p || t.ep ? 'hint cap' : 'hint dot'));
    if (j === 0) cell.append(h('span', 'coord rank', String(8 - r)));
    if (i === 7) cell.append(h('span', 'coord file', 'abcdefgh'[c]));
    cell.onclick = () => clickChess(here, legal);
    board.append(cell);
  }
  el.replaceChildren(board);
}

async function clickChess(here, legal) {
  if (sel) {
    const ms = legal.filter((m) => eq(m.from, sel.from) && eq(m.to, here));
    if (ms.length) {
      let promo;
      if (ms[0].promo) {
        promo = await choose('昇格する駒を選んでください', ['Q', 'R', 'B', 'N'].map((k) =>
          [k, `${CHESS_GLYPH[k]}︎ ${{ Q: 'クイーン', R: 'ルーク', B: 'ビショップ', N: 'ナイト' }[k]}`]));
        if (!promo) return;
      }
      sendMove({ from: sel.from, to: here, promo });
      return;
    }
  }
  sel = legal.some((m) => eq(m.from, here)) && !(sel && eq(sel.from, here)) ? { from: here } : null;
  render();
}

// ---------- 将棋 ----------
const SHOGI_CHAR = {
  K: '玉', R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩',
  '+R': '龍', '+B': '馬', '+S': '全', '+N': '圭', '+L': '杏', '+P': 'と',
};

function koma(p, me) {
  const ch = p.t === 'K' && p.o === 1 ? '王' : SHOGI_CHAR[p.t];
  return h('span', 'koma' + (p.o !== me ? ' opp' : '') + (p.t[0] === '+' ? ' promoted' : ''), ch);
}

function renderShogi(el, v, act) {
  const s = v.state, me = v.you === 1 ? 1 : 0, flip = me === 1;
  const legal = act ? shogi.legalMoves(s) : [];
  const isSelMove = (m) => (sel.drop ? m.drop === sel.drop : !m.drop && eq(m.from, sel.from));
  const targets = sel ? legal.filter(isSelMove) : [];
  const king = s.check ? shogi.kingPos(s.board, s.turn) : null;

  const actor = v.reviewing ? s.turn : me; // 感想戦では手番の側を動かせる
  const handEl = (owner) => {
    const box = h('div', 'hand' + (owner === me ? ' mine' : ' theirs'));
    box.append(h('span', 'hand-label', shogi.sideNames[owner]));
    const pieces = h('div', 'hand-pieces');
    let any = false;
    for (const t of shogi.HAND_ORDER) {
      const n = s.hands[owner][t];
      if (!n) continue;
      any = true;
      const b = h('button', 'hand-piece');
      b.append(koma({ o: owner, t }, me));
      if (n > 1) b.append(h('span', 'count', String(n)));
      const usable = owner === actor && legal.some((m) => m.drop === t);
      b.disabled = !usable;
      if (sel && sel.drop === t && owner === actor) b.classList.add('sel');
      b.onclick = () => { sel = sel && sel.drop === t ? null : { drop: t }; render(); };
      pieces.append(b);
    }
    if (!any) pieces.append(h('span', 'muted small', 'なし'));
    box.append(pieces);
    return box;
  };

  const grid = h('div', 'board shogi-board' + (act ? ' active' : ''));
  for (let j = 0; j < 9; j++) grid.append(h('span', 'lbl', String(9 - (flip ? 8 - j : j))));
  grid.append(h('span', 'lbl'));
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const r = flip ? 8 - i : i, c = flip ? 8 - j : j, here = [r, c];
      const cell = h('div', 'sq');
      if (s.lastMove && eq(s.lastMove.to, here)) cell.classList.add('last');
      if (s.lastMove && eq(s.lastMove.from, here)) cell.classList.add('last-from');
      if (sel && sel.from && eq(sel.from, here)) cell.classList.add('sel');
      if (eq(king, here)) cell.classList.add('check');
      if ([2, 5].includes(i) && [2, 5].includes(j)) cell.classList.add('star');
      const p = s.board[r][c];
      if (p) cell.append(koma(p, me));
      if (targets.some((m) => eq(m.to, here))) cell.append(h('span', p ? 'hint cap' : 'hint dot'));
      cell.onclick = () => clickShogi(here, legal, isSelMove);
      grid.append(cell);
    }
    grid.append(h('span', 'lbl', '一二三四五六七八九'[flip ? 8 - i : i]));
  }
  const wrap = h('div', 'shogi-wrap');
  wrap.append(handEl(1 - me), grid, handEl(me));
  el.replaceChildren(wrap);
}

async function clickShogi(here, legal, isSelMove) {
  if (sel) {
    const ms = legal.filter((m) => isSelMove(m) && eq(m.to, here));
    if (ms.length) {
      if (sel.drop) { sendMove({ drop: sel.drop, to: here }); return; }
      let promote = ms[0].promote;
      if (ms.length > 1) {
        const ans = await choose('成りますか？', [['y', '成る'], ['n', '成らない']]);
        if (!ans) return;
        promote = ans === 'y';
      }
      sendMove({ from: sel.from, to: here, promote });
      return;
    }
  }
  const mine = legal.some((m) => !m.drop && eq(m.from, here));
  sel = mine && !(sel && sel.from && eq(sel.from, here)) ? { from: here } : null;
  render();
}

// ---------- ゴブレットゴブラーズ ----------
function gob(p, extra = '') {
  const e = h('span', `gob o${p.o} s${p.s} ${extra}`);
  e.append(h('span', 'eyes'), h('span', 'gob-size', gobblet.SIZE_NAMES[p.s])); // 大中小を文字でも出す
  return e;
}

function renderGobblet(el, v, act) {
  const s = v.state, me = v.you === 1 ? 1 : 0, flip = me === 1;
  const legal = act ? gobblet.legalMoves(s) : [];
  const isSelMove = (m) => (sel.from != null ? m.from === sel.from : m.from == null && m.size === sel.size);
  const targets = sel ? legal.filter(isSelMove) : [];

  const handEl = (owner) => {
    const box = h('div', 'gob-hand' + (owner === me ? ' mine' : ' theirs'));
    // 大きさごとに1つにまとめて「大 ×2」のように残りの数を出す
    for (const size of [3, 2, 1]) {
      const n = s.hands[owner][size];
      if (!n) continue;
      const b = h('button', 'gob-slot');
      b.append(gob({ o: owner, s: size }), h('span', 'gob-count', `${gobblet.SIZE_NAMES[size]} ×${n}`));
      b.disabled = !(owner === me && legal.some((m) => m.size === size));
      if (owner === me && sel && sel.size === size) b.classList.add('sel');
      b.title = `${gobblet.SIZE_NAMES[size]}（残り${n}個）`;
      b.onclick = () => { sel = sel && sel.size === size ? null : { size }; render(); };
      box.append(b);
    }
    if (!box.childElementCount) box.append(h('span', 'muted small', '手持ちなし'));
    return box;
  };

  const grid = h('div', 'board gob-board' + (act ? ' active' : ''));
  for (let k = 0; k < 9; k++) {
    const i = flip ? 8 - k : k, cell = s.board[i];
    const sq = h('div', 'sq');
    if (s.lastMove && (s.lastMove.to === i || s.lastMove.from === i)) sq.classList.add(s.lastMove.to === i ? 'last' : 'last-from');
    if (s.winLine && s.winLine.includes(i)) sq.classList.add('win');
    if (sel && sel.from === i) sq.classList.add('sel');
    const t = gobblet.top(cell);
    if (t) sq.append(gob(t));
    if (cell.length > 1) sq.append(h('span', 'under', `下に${cell.length - 1}`));
    if (targets.some((m) => m.to === i)) sq.append(h('span', t ? 'hint cap' : 'hint dot'));
    sq.onclick = () => {
      const ms = sel ? legal.filter((m) => isSelMove(m) && m.to === i) : [];
      if (ms.length) { sendMove(sel.from != null ? { from: sel.from, to: i } : { size: sel.size, to: i }); return; }
      const mine = legal.some((m) => m.from === i);
      sel = mine && !(sel && sel.from === i) ? { from: i } : null;
      render();
    };
    grid.append(sq);
  }
  const wrap = h('div', 'gob-wrap');
  wrap.append(handEl(1 - me), grid, handEl(me));
  el.replaceChildren(wrap);
}

// ---------- 五目並べ ----------
const GOMOKU_STARS = ['3,3', '3,11', '7,7', '11,3', '11,11'];

function renderGomoku(el, v, act) {
  const s = v.state, N = gomoku.SIZE;
  const forbidden = gomoku.forbiddenPoints(s);
  const board = h('div', 'board gomoku-board' + (act ? ` active turn${v.you}` : ''));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const here = [r, c], stone = s.board[r][c];
    const cell = h('div', 'sq');
    if (GOMOKU_STARS.includes(`${r},${c}`)) cell.append(h('span', 'star'));
    if (stone !== null) {
      const st = h('span', 'stone s' + stone);
      if (s.lastMove && eq(s.lastMove.to, here)) st.classList.add('last');
      if (s.winLine && s.winLine.some((p) => eq(p, here))) st.classList.add('win');
      cell.append(st);
    } else if (forbidden.some((p) => eq(p, here))) {
      cell.append(h('span', 'forbid', '×'));
      cell.title = '禁じ手';
      if (act) cell.onclick = () => toast('禁じ手です（三三・四四・長連）');
    } else if (act) {
      cell.classList.add('empty');
      cell.onclick = () => sendMove({ to: here });
    }
    if (c === 0) cell.append(h('span', 'coord rank', String(N - r)));
    if (r === N - 1) cell.append(h('span', 'coord file', 'ABCDEFGHIJKLMNO'[c]));
    board.append(cell);
  }
  board.append(gomokuLines(N));
  el.replaceChildren(board);
}

function gomokuLines(n) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gomoku-lines');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  for (let i = 0; i < n; i++) {
    for (const [x1, y1, x2, y2] of [[0.5, i + 0.5, n - 0.5, i + 0.5], [i + 0.5, 0.5, i + 0.5, n - 0.5]]) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      svg.append(l);
    }
  }
  return svg;
}

// ---------- オセロ ----------
let othelloAnimKey = '';

function renderOthello(el, v, act) {
  const s = v.state, N = othello.SIZE;
  const animKey = `${v.code}:${v.gameNo}:${s.history.length}`;
  const animate = animKey !== othelloAnimKey;
  othelloAnimKey = animKey;
  const legal = act ? othello.legalMoves(s) : [];
  const board = h('div', 'board othello-board' + (act ? ' active' : ''));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const here = [r, c], stone = s.board[r][c];
    const cell = h('div', 'sq');
    if (stone !== null) {
      const d = h('span', 'disc d' + stone);
      if (s.lastMove && eq(s.lastMove.to, here)) d.classList.add('last');
      if (animate && s.flipped.some((p) => eq(p, here))) d.classList.add('flip');
      cell.append(d);
    } else if (legal.some((m) => eq(m.to, here))) {
      cell.append(h('span', 'hint dot'));
      cell.onclick = () => sendMove({ to: here });
    }
    if (c === 0) cell.append(h('span', 'coord rank', String(r + 1)));
    if (r === N - 1) cell.append(h('span', 'coord file', 'abcdefgh'[c]));
    board.append(cell);
  }
  el.replaceChildren(board);
}

// ---------- ワードバスケット ----------
// 入力欄の文字やフォーカスが消えないよう、骨組みは作り直さず中身だけ更新する
let wb = null;          // 骨組みの要素
let wbSelCard = null;   // 選んだ手札のカード id（null なら自動）
let wbPending = '';     // 送信中の言葉（エラー時に入力欄へ戻す）

function wbCard(card, extra = '') {
  const e = h('span', `wb-card ${card.t} ${extra}`);
  e.append(h('span', 'wb-card-text', wordbasket.cardLabel(card)));
  return e;
}

function restoreWordInput() {
  if (wb && !wb.input.value) wb.input.value = wbPending;
  wbPending = '';
  updateWordHint();
}

function updateWordHint() {
  if (!wb || !view || view.game !== 'wordbasket' || !view.state) return;
  const v = view, s = v.state, text = wb.input.value.trim();
  wb.hint.className = 'wb-hint';
  if (!text || v.you < 0 || !s.hands[v.you]) { wb.hint.textContent = ''; return; }
  try {
    const hand = s.hands[v.you];
    const idx = wbSelCard == null ? null : hand.findIndex((c) => c.id === wbSelCard);
    const r = wordbasket.checkWord(s, v.you, text, idx == null || idx < 0 ? null : idx);
    wb.hint.textContent = `OK：「${wordbasket.cardLabel(r.card)}」のカードで出せます`;
    wb.hint.classList.add('ok');
  } catch (e) {
    wb.hint.textContent = e.message;
    wb.hint.classList.add('ng');
  }
}

function buildWordBasket(el) {
  const root = h('div', 'wb');
  const players = h('div', 'wb-players');
  const field = h('div', 'wb-field');
  const last = h('div', 'wb-last');
  const form = h('form', 'wb-form');
  const input = h('input');
  input.maxLength = 20;
  input.autocomplete = 'off';
  input.setAttribute('lang', 'ja');
  const submit = h('button', 'btn primary', '出す');
  form.append(input, submit);
  const hint = h('div', 'wb-hint');
  const handTitle = h('div', 'wb-hand-title');
  const hand = h('div', 'wb-hand');
  const actions = h('div', 'wb-actions');
  const center = h('div', 'wb-center');
  center.append(field, last);
  root.append(players, center, form, hint, handTitle, hand, actions);
  input.addEventListener('input', updateWordHint);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const word = input.value.trim();
    if (!word || !view) return;
    const hand = view.state.hands[view.you] || [];
    const idx = hand.findIndex((c) => c.id === wbSelCard);
    wbPending = word;
    input.value = '';
    hint.textContent = '';
    send({ type: 'move', move: { word, card: idx >= 0 ? idx : undefined } });
  });
  el.replaceChildren(root);
  return { el, root, players, field, last, form, input, submit, hint, handTitle, hand, actions };
}

function renderWordBasket(el, v, act) {
  const s = v.state;
  if (!wb || wb.el !== el || !el.contains(wb.root)) wb = buildWordBasket(el);
  if (wbPending && s.used.includes(wordbasket.normalize(wbPending))) wbPending = '';
  const me = v.you;
  const myHand = me >= 0 ? s.hands[me] || [] : [];
  if (wbSelCard != null && !myHand.some((c) => c.id === wbSelCard)) wbSelCard = null;

  // 参加者
  wb.players.replaceChildren(...v.seats.map((p, i) => {
    const chip = h('div', 'wb-player' + (i === me ? ' me' : '') + (s.out[i] ? ' out' : '') + (s.result && s.result.winner === i ? ' winner' : ''));
    chip.append(h('span', 'pname', p ? p.name : '?'));
    if (p) chip.append(h('span', 'dot ' + (p.online ? 'on' : 'off')));
    chip.append(h('span', 'wb-count', s.out[i] ? '投了' : `${s.handCounts[i]}枚`));
    if (s.flipVotes.includes(i)) chip.append(h('span', 'wb-vote', '流す'));
    return chip;
  }));

  // 場のカード
  wb.field.replaceChildren(h('span', 'wb-field-label', '場'), wbCard(s.fieldCard, 'big'), h('span', 'wb-field-char', `「${s.field}」から始まる言葉`));

  // 直前の言葉とダメ出し
  wb.last.replaceChildren();
  const lastPlay = s.plays.at(-1);
  if (lastPlay) {
    const who = v.seats[lastPlay.seat]?.name || '?';
    const line = h('div', 'wb-last-line' + (lastPlay.challenged ? ' challenged' : ''));
    line.append(h('b', null, who), '：', h('span', 'wb-word', lastPlay.word), h('span', 'muted small', `（${wordbasket.cardLabel(lastPlay.card)}）`));
    if (lastPlay.challenged) line.append(h('span', 'wb-ng', 'ダメ出しで取り消し'));
    wb.last.append(line);
    const canChallenge = me >= 0 && !s.out[me] && s.challengeable === s.plays.length - 1 && lastPlay.seat !== me && (!s.result || s.result.byPlay);
    if (canChallenge) {
      const ng = h('button', 'btn danger small', 'ダメ！');
      ng.title = 'おかしな言葉なら取り消します。出した人はカードを戻して1枚引きます';
      ng.onclick = () => send({ type: 'move', move: { challenge: s.plays.length - 1 } });
      wb.last.append(ng);
    }
  }

  // 入力欄
  const playing = me >= 0 && !s.out[me] && !s.result && v.ready;
  wb.form.hidden = me < 0;
  wb.input.disabled = wb.submit.disabled = !playing;
  wb.input.placeholder = playing ? `「${s.field}」で始まる言葉（カタカナもOK）` : '';
  updateWordHint();

  // 手札
  wb.handTitle.textContent = me >= 0 ? `あなたの手札（${myHand.length}枚）・クリックで使うカードを指定（指定しなければ自動）` : '';
  wb.hand.replaceChildren(...myHand.map((card) => {
    const b = h('button', 'wb-hand-card' + (card.id === wbSelCard ? ' sel' : ''));
    b.append(wbCard(card));
    b.disabled = !playing;
    b.onclick = () => { wbSelCard = wbSelCard === card.id ? null : card.id; renderWordBasket(el, view, act); wb.input.focus(); };
    return b;
  }));
  // 終局後は全員の手札を公開
  if (s.result) {
    const reveal = h('div', 'wb-reveal');
    v.seats.forEach((p, i) => {
      if (i === me || !s.hands[i]) return;
      const row = h('div', 'wb-reveal-row');
      row.append(h('span', 'pname', p?.name || '?'), ...s.hands[i].map((c) => wbCard(c, 'small')));
      reveal.append(row);
    });
    if (reveal.childElementCount) wb.hand.append(reveal);
  }

  // 場を流す
  wb.actions.replaceChildren();
  if (playing) {
    const voted = s.flipVotes.includes(me);
    const activeCount = s.out.filter((o) => !o).length;
    const flip = h('button', 'btn small', voted ? `場を流す投票済み（${s.flipVotes.length}/${activeCount}）` : `誰も出せないので場を流す（${s.flipVotes.length}/${activeCount}）`);
    flip.disabled = voted;
    flip.onclick = () => send({ type: 'move', move: { flip: true } });
    const drawOne = h('button', 'btn small', '山札から1枚引く');
    drawOne.onclick = () => send({ type: 'move', move: { draw: true } });
    const reset = h('button', 'btn small', `手札リセット（${myHand.length}→${myHand.length + 1}枚）`);
    reset.title = '手札を全部捨てて、今より1枚多く引き直します';
    reset.onclick = async () => {
      if (await choose(`手札${myHand.length}枚を全部捨てて、${myHand.length + 1}枚引き直しますか？`, [['yes', 'リセットする'], [null, 'キャンセル']])) {
        send({ type: 'move', move: { resetHand: true } });
      }
    };
    wb.actions.append(drawOne, reset, flip, h('span', 'muted small', `山札 ${s.deckCount}枚`));
  }
}

// ---------- キャット＆チョコレート ----------
let cc = null;        // 骨組みの要素（入力中の文章を消さないため作り直さない）
let ccSel = [];       // 選んだアイテムの id
let ccTurnKey = '';

function ccItem(card, extra = '') {
  return h('span', 'cc-item ' + extra, card.name);
}

function buildCatChoco(el) {
  const root = h('div', 'cc');
  const players = h('div', 'cc-players');
  const event = h('div', 'cc-event');
  const stage = h('div', 'cc-stage');
  const form = h('form', 'cc-form');
  const text = h('textarea');
  text.maxLength = catchoco.MAX_TEXT;
  text.rows = 4;
  text.placeholder = '選んだアイテムを使って、どうやってピンチを切り抜けるか書いてください';
  const count = h('span', 'muted small');
  const submit = h('button', 'btn primary', 'この方法で解決！');
  const giveUp = h('button', 'btn', 'ギブアップ');
  giveUp.type = 'button';
  const row = h('div', 'cc-form-row');
  row.append(count, giveUp, submit);
  form.append(text, row);
  const handTitle = h('div', 'cc-hand-title');
  const hand = h('div', 'cc-hand');
  const log = h('div', 'cc-log');
  root.append(players, event, stage, form, handTitle, hand, log);
  text.addEventListener('input', () => { count.textContent = `${text.value.length}/${catchoco.MAX_TEXT}`; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = view.state, myHand = s.hands[view.you] || [];
    const items = ccSel.map((id) => myHand.findIndex((c) => c.id === id)).filter((i) => i >= 0);
    if (items.length !== s.event.count) { toast(`アイテムをちょうど${s.event.count}個選んでください`); return; }
    send({ type: 'move', move: { explain: { items, text: text.value } } });
  });
  giveUp.onclick = async () => {
    if (await choose('ギブアップしますか？（このイベントは失敗になります）', [['yes', 'ギブアップ'], [null, 'キャンセル']])) {
      send({ type: 'move', move: { giveUp: true } });
    }
  };
  el.replaceChildren(root);
  return { el, root, players, event, stage, form, text, count, submit, handTitle, hand, log };
}

function renderCatChoco(el, v) {
  const s = v.state, me = v.you;
  if (!cc || cc.el !== el || !el.contains(cc.root)) cc = buildCatChoco(el);
  const key = `${v.code}:${v.gameNo}:${s.turnNo}`;
  if (key !== ccTurnKey) { ccTurnKey = key; ccSel = []; cc.text.value = ''; cc.count.textContent = ''; }
  const name = (seat) => v.seats[seat]?.name || '?';
  const myTurn = me === s.turn && !s.result && s.phase === 'explain' && !s.out[me];
  const myHand = me >= 0 ? s.hands[me] || [] : [];
  ccSel = ccSel.filter((id) => myHand.some((c) => c.id === id));

  // 参加者
  cc.players.replaceChildren(...v.seats.map((p, i) => {
    const chip = h('div', 'wb-player' + (i === me ? ' me' : '') + (s.out[i] ? ' out' : '') + (!s.result && i === s.turn ? ' turn' : '') + (s.result && s.result.winners.includes(i) ? ' winner' : ''));
    chip.append(h('span', 'pname', p ? p.name : '?'));
    if (p) chip.append(h('span', 'dot ' + (p.online ? 'on' : 'off')));
    if (s.teams[i] !== null) chip.append(h('span', 'cc-team t' + s.teams[i], catchoco.TEAM_NAMES[s.teams[i]]));
    chip.append(h('span', 'wb-count', s.out[i] ? '離脱' : `獲得 ${s.won[i].length}`));
    if (!s.result && s.phase === 'vote' && i !== s.turn && s.votes[i] !== null) chip.append(h('span', 'wb-vote', '投票済み'));
    return chip;
  }));

  // イベント
  cc.event.replaceChildren();
  if (s.result) {
    const [a, b] = catchoco.teamScores(s);
    cc.event.append(h('div', 'cc-final', `${catchoco.TEAM_NAMES[0]} ${a} 対 ${catchoco.TEAM_NAMES[1]} ${b}`));
  } else {
    cc.event.append(
      h('div', 'cc-turn', `ターン ${s.turnNo + 1}/${s.totalTurns} ・ ${name(s.turn)} さんのピンチ`),
      h('div', 'cc-event-text', s.event.text),
      h('div', 'cc-event-count', `アイテムを ${s.event.count} 個使う`),
    );
  }

  // 解決方法と投票
  cc.stage.replaceChildren();
  if (!s.result && s.phase === 'explain' && !myTurn) {
    cc.stage.append(h('p', 'cc-wait', `${name(s.turn)} さんが解決方法を考えています…`));
  }
  if (!s.result && s.phase === 'vote') {
    const story = h('div', 'cc-story');
    story.append(h('div', 'cc-story-head', `${name(s.turn)} さんの解決方法`));
    const items = h('div', 'cc-items');
    items.append(...s.story.items.map((c) => ccItem(c, 'used')));
    story.append(items, h('p', 'cc-story-text', s.story.text));
    cc.stage.append(story);
    const voterCount = s.out.filter((o, i) => !o && i !== s.turn).length;
    const voted = s.votes.filter((x, i) => x !== null && i !== s.turn).length;
    const row = h('div', 'cc-vote');
    if (me >= 0 && me !== s.turn && !s.out[me] && s.votes[me] === null) {
      const ok = h('button', 'btn primary', '👍 成功');
      ok.onclick = () => send({ type: 'move', move: { vote: true } });
      const ng = h('button', 'btn danger', '👎 失敗');
      ng.onclick = () => send({ type: 'move', move: { vote: false } });
      row.append(ok, ng);
    } else if (me >= 0 && s.votes[me] !== null && me !== s.turn) {
      row.append(h('span', 'muted', `あなたは「${s.votes[me] ? '成功' : '失敗'}」に投票しました`));
    }
    row.append(h('span', 'muted small', `投票 ${voted}/${voterCount}`));
    cc.stage.append(row);
  }

  // 自分の番の入力欄
  cc.form.hidden = !myTurn;
  if (myTurn) cc.submit.textContent = `この方法で解決！（アイテム ${ccSel.length}/${s.event.count}）`;

  // 手札
  cc.handTitle.textContent = me >= 0 && !s.out[me] ? (myTurn ? `使うアイテムを ${s.event.count} 個選んでください` : 'あなたのアイテム') : '';
  cc.hand.replaceChildren(...(me >= 0 && !s.out[me] ? myHand : []).map((card) => {
    const b = h('button', 'cc-hand-card' + (ccSel.includes(card.id) ? ' sel' : ''));
    b.type = 'button';
    b.append(ccItem(card));
    b.disabled = !myTurn;
    b.onclick = () => {
      if (ccSel.includes(card.id)) ccSel = ccSel.filter((id) => id !== card.id);
      else if (ccSel.length < s.event.count) ccSel = [...ccSel, card.id];
      else toast(`アイテムは ${s.event.count} 個までです`);
      renderCatChoco(el, view);
    };
    return b;
  }));

  // これまでの結果（新しい順）
  cc.log.replaceChildren();
  if (s.log.length) cc.log.append(h('h3', null, 'これまでのピンチ'));
  for (const e of s.log.slice().reverse()) {
    const item = h('div', 'cc-log-item ' + (e.success ? 'success' : 'fail'));
    const head = h('div', 'cc-log-head');
    head.append(h('b', null, name(e.seat)), h('span', null, e.event.text),
      h('span', 'cc-badge', e.gaveUp ? 'ギブアップ' : e.success ? `成功 ${e.ok}-${e.ng}` : `失敗 ${e.ok}-${e.ng}`));
    item.append(head);
    if (e.items.length) {
      const items = h('div', 'cc-items');
      items.append(...e.items.map((c) => ccItem(c, 'small')));
      item.append(items);
    }
    if (e.text) item.append(h('p', 'cc-log-text', e.text));
    cc.log.append(item);
  }
}

// ---------- UNO ----------
const UNO_SYMBOL = { skip: '⊘', rev: '⇄', '+2': '+2', wild: 'W', '+4': '+4' };
let unoArmed = false; // 次に出すときに「UNO!」と言う

function unoCard(card, extra = '') {
  const e = h('span', `uno-card ${card.c ? 'c-' + card.c : 'wild'} ${extra}`);
  e.append(h('span', 'uno-oval'), h('span', 'uno-val', UNO_SYMBOL[card.v] || card.v));
  e.title = uno.cardName(card);
  return e;
}

async function playUno(card, armed) {
  let color;
  if (!card.c) {
    color = await choose('色を選んでください', uno.COLORS.map((c) => [c, uno.COLOR_NAMES[c]]));
    if (!color) return;
  }
  unoArmed = false;
  sendMove({ play: card.id, color, uno: armed || undefined });
}

function renderUno(el, v) {
  const s = v.state, me = v.you;
  const name = (seat) => v.seats[seat]?.name || '?';
  const myTurn = me >= 0 && s.turn === me && !s.result && !s.out[me];
  const playable = me >= 0 ? uno.playableIds(s, me) : [];
  const myHand = me >= 0 ? s.hands[me] || [] : [];
  if (myHand.length !== 2) unoArmed = false;

  const root = h('div', 'uno');

  // 参加者（手番の順）
  const players = h('div', 'uno-players');
  const order = [...Array(s.players).keys()];
  for (const i of order) {
    const chip = h('div', 'wb-player' + (i === me ? ' me' : '') + (s.out[i] ? ' out' : '') + (!s.result && i === s.turn ? ' turn' : '') + (s.result && s.result.winner === i ? ' winner' : ''));
    chip.append(h('span', 'pname', name(i)));
    if (v.seats[i]) chip.append(h('span', 'dot ' + (v.seats[i].online ? 'on' : 'off')));
    chip.append(h('span', 'wb-count', s.out[i] ? '投了' : `${s.handCounts[i]}枚`));
    if (!s.out[i] && s.handCounts[i] === 1) chip.append(h('span', 'uno-badge', 'UNO'));
    if (s.unoPending === i && me >= 0 && me !== i && !s.out[me]) {
      const c = h('button', 'btn danger small', 'UNO言ってない！');
      c.onclick = () => send({ type: 'move', move: { catchUno: i } });
      chip.append(c);
    }
    players.append(chip);
  }
  root.append(players);

  // 場
  const table = h('div', 'uno-table');
  const pile = h('button', 'uno-pile' + (myTurn && s.drawn == null ? ' active' : ''));
  pile.append(h('span', 'uno-back', 'UNO'), h('span', 'uno-pile-count', `山札 ${s.deckCount}`));
  pile.disabled = !(myTurn && s.drawn == null);
  pile.title = '山札から1枚引く';
  pile.onclick = () => sendMove({ draw: true });
  const discard = h('div', 'uno-discard');
  discard.append(unoCard(uno.top(s), 'big'));
  const info = h('div', 'uno-info');
  info.append(
    h('span', `uno-color-chip c-${s.color}`, `場の色：${uno.COLOR_NAMES[s.color]}`),
    h('span', 'uno-dir', s.direction === 1 ? '順番 ↻ 時計回り' : '順番 ↺ 反時計回り'),
  );
  table.append(pile, discard, info);
  root.append(table);

  // 直前の出来事
  const la = s.lastAction;
  if (la && !s.result) {
    const text = la.type === 'play' ? `${name(la.seat)} が ${uno.cardName(la.card)} を出しました`
      : la.type === 'draw' ? `${name(la.seat)} が1枚引きました`
      : la.type === 'pass' ? `${name(la.seat)} はパス`
      : la.type === 'caught' ? `${name(la.by)} が ${name(la.seat)} の UNO 言い忘れを指摘！ 2枚引きます`
      : `${name(la.seat)}：UNO!`;
    root.append(h('div', 'uno-last', text));
  }

  // 自分の操作
  if (me >= 0 && !s.out[me] && !s.result) {
    const bar = h('div', 'uno-actions');
    if (myTurn && myHand.length === 2 && playable.length) {
      const armBtn = h('button', 'btn uno-call' + (unoArmed ? ' armed' : ''), unoArmed ? 'UNO!（出すときに宣言します）' : 'UNO! と言う');
      armBtn.onclick = () => { unoArmed = !unoArmed; render(); };
      bar.append(armBtn);
    }
    if (s.unoPending === me) {
      const late = h('button', 'btn uno-call armed', 'UNO!（今すぐ宣言）');
      late.onclick = () => send({ type: 'move', move: { uno: true } });
      bar.append(late);
    }
    if (myTurn && s.drawn != null) {
      const pass = h('button', 'btn', 'パス');
      pass.onclick = () => sendMove({ pass: true });
      bar.append(pass);
    }
    if (bar.childElementCount) root.append(bar);
  }

  // 手札
  if (me >= 0 && !s.out[me]) {
    const hand = h('div', 'uno-hand');
    for (const card of myHand) {
      const ok = playable.includes(card.id);
      const b = h('button', 'uno-hand-card' + (ok ? ' playable' : '') + (s.drawn === card.id ? ' drawn' : ''));
      b.append(unoCard(card));
      b.disabled = !ok;
      b.onclick = () => playUno(card, unoArmed);
      hand.append(b);
    }
    root.append(hand);
  }

  // 終局後は全員の手札を公開
  if (s.result) {
    const reveal = h('div', 'wb-reveal');
    s.hands.forEach((cards, i) => {
      if (i === me || !cards || !cards.length) return;
      const row = h('div', 'wb-reveal-row');
      row.append(h('span', 'pname', name(i)), ...cards.map((c) => unoCard(c, 'small')));
      reveal.append(row);
    });
    if (reveal.childElementCount) root.append(reveal);
  }
  el.replaceChildren(root);
}

// ---------- ワンナイト人狼 ----------
let wwCenterSel = []; // 選んだ中央のカード
let wwKey = '';

function renderWerewolf(el, v) {
  const s = v.state, me = v.you;
  const name = (seat) => v.seats[seat]?.name || '?';
  const named = (text) => text.replace(/P(\d+)/g, (all, n) => v.seats[n - 1]?.name || all);
  const key = `${v.code}:${v.gameNo}:${s.phase}`;
  if (key !== wwKey) { wwKey = key; wwCenterSel = []; }
  const root = h('div', 'ww');
  const playing = me >= 0 && !s.out[me];
  const others = [...Array(s.players).keys()].filter((i) => i !== me && !s.out[i]);
  const counts = {};
  for (const r of werewolf.composition(s.players)) counts[r] = (counts[r] || 0) + 1;
  root.append(h('div', 'ww-comp', '役職: ' + Object.entries(counts).map(([r, n]) => werewolf.ROLES[r].name + (n > 1 ? `×${n}` : '')).join('・') + '（2枚は中央）'));

  // 参加者
  const players = h('div', 'uno-players');
  for (let i = 0; i < s.players; i++) {
    const chip = h('div', 'wb-player' + (i === me ? ' me' : '') + (s.out[i] ? ' out' : '') + (s.result && s.result.winners.includes(i) ? ' winner' : ''));
    chip.append(h('span', 'pname', name(i)));
    if (v.seats[i]) chip.append(h('span', 'dot ' + (v.seats[i].online ? 'on' : 'off')));
    if (!s.result && s.phase === 'night' && s.night[i].done) chip.append(h('span', 'wb-vote', '行動済み'));
    if (!s.result && s.phase === 'day' && s.votes[i] !== null) chip.append(h('span', 'wb-vote', '投票済み'));
    if (s.wolves && s.wolves.includes(i) && i !== me) chip.append(h('span', 'ww-wolf-tag', '人狼'));
    players.append(chip);
  }
  root.append(players);

  // 自分の役職
  if (playing && !s.result) {
    const role = werewolf.ROLES[s.roles[me]];
    const card = h('div', `ww-role team${role.team}`);
    card.append(h('div', 'ww-role-label', 'あなたの役職（夜のはじめ）'), h('div', 'ww-role-name', role.name), h('p', 'ww-role-desc', role.desc));
    root.append(card);
  }

  // 夜の行動
  if (playing && !s.result && s.phase === 'night' && !s.night[me].done) {
    const kind = werewolf.nightOptions(s, me);
    const panel = h('div', 'ww-panel');
    const centerButtons = (limit) => {
      const row = h('div', 'ww-center');
      for (let i = 0; i < 2; i++) {
        const b = h('button', 'ww-card-back' + (wwCenterSel.includes(i) ? ' sel' : ''), `中央 ${i + 1}`);
        b.onclick = () => {
          wwCenterSel = wwCenterSel.includes(i) ? wwCenterSel.filter((x) => x !== i) : [...wwCenterSel, i].slice(-limit);
          render();
        };
        row.append(b);
      }
      return row;
    };
    const playerButtons = (label, onPick) => {
      const row = h('div', 'ww-targets');
      for (const i of others) {
        const b = h('button', 'btn', `${name(i)}${label}`);
        b.onclick = () => onPick(i);
        row.append(b);
      }
      return row;
    };
    if (kind === 'seer') {
      panel.append(h('h3', null, '占う：1人のカードを見るか、中央のカードを2枚見る'));
      panel.append(playerButtons(' を占う', (i) => send({ type: 'move', move: { night: { look: i } } })));
      panel.append(centerButtons(2));
      const ok = h('button', 'btn primary', '選んだ中央2枚を見る');
      ok.disabled = wwCenterSel.length !== 2;
      ok.onclick = () => send({ type: 'move', move: { night: { center: wwCenterSel } } });
      const skip = h('button', 'btn', '占わない');
      skip.onclick = () => send({ type: 'move', move: { night: {} } });
      panel.append(ok, skip);
    } else if (kind === 'thief') {
      panel.append(h('h3', null, 'カードを交換する相手を選ぶ'));
      panel.append(playerButtons(' と交換', (i) => send({ type: 'move', move: { night: { swap: i } } })));
      const skip = h('button', 'btn', '交換しない');
      skip.onclick = () => send({ type: 'move', move: { night: {} } });
      panel.append(skip);
    } else if (kind === 'lonewolf') {
      panel.append(h('h3', null, '人狼はあなた1人です。中央のカードを1枚見られます'));
      panel.append(centerButtons(1));
      const ok = h('button', 'btn primary', wwCenterSel.length ? '選んだカードを見る' : '見ないで朝を待つ');
      ok.onclick = () => send({ type: 'move', move: { night: { center: wwCenterSel } } });
      panel.append(ok);
    } else {
      const ok = h('button', 'btn primary', '確認した（朝を待つ）');
      ok.onclick = () => send({ type: 'move', move: { night: {} } });
      panel.append(ok);
    }
    root.append(panel);
  }

  // 夜にわかったこと
  if (playing && !s.result && s.night[me].info.length) {
    const box = h('div', 'ww-info');
    box.append(h('h3', null, '夜にわかったこと'));
    for (const line of s.night[me].info) box.append(h('p', null, named(line)));
    root.append(box);
  }

  // 昼の投票
  if (!s.result && s.phase === 'day') {
    const panel = h('div', 'ww-panel');
    const voted = s.votes.filter((x) => x !== null).length, total = s.out.filter((o) => !o).length;
    panel.append(h('h3', null, `処刑する人に投票（${voted}/${total}）`));
    if (playing) {
      const row = h('div', 'ww-targets');
      for (const i of others) {
        const b = h('button', 'btn' + (s.votes[me] === i ? ' primary' : ''), name(i));
        b.onclick = () => send({ type: 'move', move: { vote: i } });
        row.append(b);
      }
      panel.append(row);
      panel.append(h('p', 'muted small', 'チャットで話し合いましょう。全員が投票した時点で結果が出ます（それまでは変更できます）。全員が別々の人に投票すると誰も処刑されません。'));
    }
    root.append(panel);
  }

  // 結果
  if (s.result) {
    const table = h('table', 'ww-result');
    const head = h('tr');
    for (const t of ['名前', '夜のはじめ', '夜明け', '得票', '']) head.append(h('th', null, t));
    table.append(head);
    for (let i = 0; i < s.players; i++) {
      const tr = h('tr', s.result.winners.includes(i) ? 'win' : '');
      const finalRole = werewolf.ROLES[s.final[i]];
      tr.append(
        h('td', null, name(i) + (i === me ? '（あなた）' : '')),
        h('td', null, werewolf.ROLES[s.roles[i]].name),
        h('td', `team${finalRole.team}`, finalRole.name),
        h('td', null, String(s.voteCount ? s.voteCount[i] : 0)),
        h('td', null, (s.executed.includes(i) ? '処刑 ' : '') + (s.result.winners.includes(i) ? '勝ち' : '')),
      );
      table.append(tr);
    }
    root.append(table);
    root.append(h('p', 'ww-centers', '中央のカード: ' + s.center.map((r) => werewolf.ROLES[r].name).join('・')));
    const log = h('div', 'ww-info');
    log.append(h('h3', null, '夜の行動'));
    for (let i = 0; i < s.players; i++) {
      for (const line of s.night[i].info) {
        if (line === '夜の行動はありません') continue;
        log.append(h('p', null, `${name(i)}（${werewolf.ROLES[s.roles[i]].name}）：${named(line)}`));
      }
    }
    root.append(log);
  }
  el.replaceChildren(root);
}

// ---------- ito ----------
// itogame の画面をこの形に移したもの。カードの DOM は使い回す（書き込み中の欄を作り直すと日本語変換が途切れるため）
let ito$ = null;            // 骨組みの要素
let itoDragging = false;
let itoPrevRevealed = 0;
let itoRoundKey = '';
const itoCardEls = new Map(); // id -> { el, sig }
const itoHintTimers = {};

function itoSendHint(cardId, text, delay = 350) {
  clearTimeout(itoHintTimers[cardId]);
  itoHintTimers[cardId] = setTimeout(() => {
    delete itoHintTimers[cardId];
    send({ type: 'move', move: { hint: { cardId, text } } });
  }, delay);
}

function buildIto(el) {
  const root = h('div', 'ito');
  root.innerHTML = `
    <section class="ito-panel ito-theme-panel">
      <div class="ito-label">お題 <span class="ito-round"></span></div>
      <div class="ito-theme"></div>
      <div class="ito-row ito-host-theme">
        <button class="btn small ito-reroll">別のお題にする</button>
        <input class="ito-custom" placeholder="自由にお題を入力" maxlength="60">
        <button class="btn small ito-custom-btn">設定</button>
      </div>
    </section>
    <section class="ito-panel">
      <div class="ito-instruction"></div>
      <div class="ito-scale"><span>← 小さい (1)</span><span>大きい (100) →</span></div>
      <div class="ito-line"></div>
      <div class="ito-arrange-bar">
        <button class="btn primary ito-ready">この順番でOK！</button>
        <div class="muted small ito-ready-info"></div>
        <button class="btn small ghost ito-force">全員を待たずに答え合わせ</button>
      </div>
      <div class="ito-result-bar">
        <h2 class="ito-result-title"></h2>
        <div class="ito-row ito-host-result">
          <button class="btn primary ito-next">次のラウンドへ</button>
          <button class="btn ito-lobby">ロビーに戻る</button>
        </div>
        <p class="muted ito-guest-result">ホストの操作を待っています…</p>
      </div>
    </section>
    <section class="ito-panel">
      <div class="ito-label">プレイヤー</div>
      <ul class="ito-players"></ul>
    </section>`;
  const q = (sel) => root.querySelector(sel);
  const x = {
    el, root, round: q('.ito-round'), theme: q('.ito-theme'), hostTheme: q('.ito-host-theme'),
    custom: q('.ito-custom'), instruction: q('.ito-instruction'), line: q('.ito-line'),
    arrangeBar: q('.ito-arrange-bar'), ready: q('.ito-ready'), readyInfo: q('.ito-ready-info'), force: q('.ito-force'),
    resultBar: q('.ito-result-bar'), resultTitle: q('.ito-result-title'), hostResult: q('.ito-host-result'),
    guestResult: q('.ito-guest-result'), players: q('.ito-players'), sortable: null,
  };
  q('.ito-reroll').onclick = () => send({ type: 'move', move: { reroll: true } });
  q('.ito-custom-btn').onclick = () => {
    send({ type: 'move', move: { customTheme: x.custom.value } });
    x.custom.value = '';
  };
  x.ready.onclick = async () => {
    const s = view.state, me = view.you;
    if (!s.ready[me]) {
      const blank = s.cards.some((c) => c.owner === me && !c.hint.trim());
      if (blank && !(await choose('まだカードに何も書いていません。このままOKにしますか？', [['yes', 'OKにする'], [null, 'キャンセル']]))) return;
    }
    send({ type: 'move', move: { ready: !s.ready[me] } });
  };
  x.force.onclick = async () => {
    if (await choose('全員のOKを待たずに答え合わせしますか？', [['yes', '答え合わせする'], [null, 'キャンセル']])) send({ type: 'move', move: { forceReveal: true } });
  };
  q('.ito-next').onclick = () => send({ type: 'move', move: { next: true } });
  q('.ito-lobby').onclick = () => send({ type: 'backToLobby' });

  // カードの並べ替え（ドラッグ＆ドロップ、スマホのタッチにも対応）
  if (window.Sortable) {
    x.sortable = window.Sortable.create(x.line, {
      animation: 150,
      filter: 'textarea',
      preventOnFilter: false,
      delay: 120,
      delayOnTouchOnly: true,
      onStart: () => { itoDragging = true; },
      onEnd: (evt) => {
        itoDragging = false;
        if (evt.oldIndex !== evt.newIndex) send({ type: 'move', move: { move: { cardId: evt.item.dataset.id, to: evt.newIndex } } });
        else render();
      },
    });
  }
  itoCardEls.clear();
  el.replaceChildren(root);
  return x;
}

function itoUpdateCard(c, i, s, v) {
  const me = v.you;
  const mine = c.owner === me;
  const open = i < s.revealed;
  const editable = mine && s.phase === 'arrange';
  const ownerName = v.seats[c.owner]?.name || '(退出)';
  const sig = JSON.stringify([ownerName, c.value, open, c.ok, editable, editable ? '' : c.hint, s.phase === 'arrange']);

  let entry = itoCardEls.get(c.id);
  if (!entry) {
    entry = { el: document.createElement('div'), sig: null };
    entry.el.dataset.id = c.id;
    itoCardEls.set(c.id, entry);
  }
  const el = entry.el;
  if (entry.sig !== sig) {
    entry.sig = sig;
    el.className = 'icard ' + (open ? `open ${c.ok ? 'ok' : 'ng'}` : mine ? 'front' : 'back');
    if (s.phase === 'arrange') el.classList.add('draggable');
    if (open && i >= itoPrevRevealed) el.classList.add('flip');
    el.replaceChildren(h('div', 'owner', mine ? 'あなた' : ownerName), h('div', 'num', c.value ?? '?'));
    if (editable) {
      const ta = h('textarea');
      ta.maxLength = 30;
      ta.placeholder = 'ここに書き込む\n(お題に沿った言葉)';
      ta.value = c.hint;
      ta.dataset.card = c.id;
      ta.addEventListener('compositionstart', () => { ta.composing = true; });
      ta.addEventListener('compositionend', () => { ta.composing = false; itoSendHint(c.id, ta.value); });
      ta.addEventListener('input', (e) => {
        if (e.isComposing || ta.composing) return; // 変換中は送らない
        itoSendHint(c.id, ta.value);
      });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); ta.blur(); }
      });
      ta.addEventListener('blur', () => itoSendHint(c.id, ta.value, 0));
      el.append(ta);
    } else {
      el.append(h('div', 'words' + (c.hint ? '' : ' empty'), c.hint || '（まだ書いていません）'));
    }
    if (open) el.append(h('div', 'mark', c.ok ? '✔' : '✘'));
  }
  // 自分が触っていない時だけサーバーの内容を反映
  const ta = el.querySelector('textarea');
  if (ta && document.activeElement !== ta && !itoHintTimers[c.id] && ta.value !== c.hint) ta.value = c.hint;
  return el;
}

function renderIto(el, v) {
  if (itoDragging) return; // ドラッグ中は並びを動かさない（終わったら描き直す）
  const s = v.state, me = v.you;
  if (!ito$ || ito$.el !== el || !el.contains(ito$.root)) ito$ = buildIto(el);
  const x = ito$;
  const host = me >= 0 && me === v.hostSeat;
  const roundKey = `${v.code}:${v.gameNo}:${s.round}`;
  if (roundKey !== itoRoundKey) { itoRoundKey = roundKey; itoPrevRevealed = 0; }

  // お題
  x.theme.textContent = s.theme || '';
  x.round.textContent = s.round ? `（第${s.round}ラウンド・成功 ${s.wins}回）` : '';
  x.hostTheme.hidden = !(host && s.phase === 'arrange');

  // 説明
  const instr = {
    arrange: '① 自分のカード（オレンジ）に、お題に沿って自分の数字の大きさを表す言葉を書き込もう。<br>'
      + '② みんなの言葉を見ながら、カードをドラッグして<b>左から小さい順</b>に並べ替えよう（誰のカードでも動かせます）。<br>'
      + '③ 並びに納得したら「この順番でOK！」。全員OKで答え合わせ！',
    reveal: '答え合わせ中… 左から1枚ずつめくります',
  };
  x.instruction.innerHTML = instr[s.phase] || '';
  x.instruction.hidden = !instr[s.phase];

  // カードを並び順どおりに配置（既存の DOM は作り直さず、位置だけ合わせる）
  const active = document.activeElement;
  const ids = new Set(s.cards.map((c) => c.id));
  for (const [id, entry] of itoCardEls) {
    if (!ids.has(id)) { entry.el.remove(); itoCardEls.delete(id); }
  }
  s.cards.forEach((c, i) => {
    const card = itoUpdateCard(c, i, s, v);
    if (x.line.children[i] !== card) x.line.insertBefore(card, x.line.children[i] || null);
  });
  while (x.line.children.length > s.cards.length) x.line.lastChild.remove();
  if (active && active.dataset && active.dataset.card && document.activeElement !== active && active.isConnected) active.focus();
  if (x.sortable) x.sortable.option('disabled', s.phase !== 'arrange' || me < 0 || s.out[me]);
  itoPrevRevealed = s.revealed;

  // OK ボタン
  const playing = me >= 0 && !s.out[me];
  x.arrangeBar.hidden = s.phase !== 'arrange';
  x.ready.hidden = !playing;
  if (playing) {
    x.ready.textContent = s.ready[me] ? 'OK済み（押すと取り消し）' : 'この順番でOK！';
    x.ready.classList.toggle('done', s.ready[me]);
  }
  const activeSeats = v.seats.map((p, i) => i).filter((i) => !s.out[i] && v.seats[i]?.online);
  const waiting = activeSeats.filter((i) => !s.ready[i]).map((i) => v.seats[i].name);
  x.readyInfo.textContent = `OK ${activeSeats.length - waiting.length} / ${activeSeats.length}人` + (waiting.length ? `（待ち: ${waiting.join('、')}）` : '');
  x.force.hidden = !host;

  // 結果
  x.resultBar.hidden = s.phase !== 'result';
  if (s.phase === 'result') {
    const miss = s.cards.filter((c) => !c.ok).length;
    x.resultTitle.textContent = s.outcome === 'success' ? '大成功！ 全部小さい順に並んでいました 🎉' : `残念… 順番ミスが ${miss} 枚ありました`;
    x.resultTitle.className = 'ito-result-title ' + s.outcome;
    x.hostResult.hidden = !host;
    x.guestResult.hidden = host;
  }

  // プレイヤー
  x.players.replaceChildren(...v.seats.map((p, i) => {
    const li = h('li');
    if (!p) return li;
    li.append(h('span', p.online && !s.out[i] ? '' : 'offline', p.name));
    if (i === v.hostSeat) li.append(h('span', 'ito-badge', 'ホスト'));
    if (i === me) li.append(h('span', 'ito-badge me', 'あなた'));
    if (s.phase === 'arrange' && s.ready[i]) li.append(h('span', 'ito-badge ready', 'OK'));
    if (s.out[i]) li.append(h('span', 'muted small', '(退出)'));
    else if (!p.online) li.append(h('span', 'muted small', '(切断)'));
    if (host && i !== me && !s.out[i]) {
      const kick = h('button', 'btn small ghost ito-kick', '外す');
      kick.onclick = async () => {
        if (await choose(`${p.name} を外しますか？`, [['yes', '外す'], [null, 'キャンセル']])) send({ type: 'kick', seat: i });
      };
      li.append(kick);
    }
    return li;
  }));
}

// ito の開始前の設定（ホストだけ変更できる）
function renderItoSettings(box, v) {
  const host = v.you >= 0 && v.you === v.hostSeat;
  const opts = ito.normalizeOptions(v.options);
  const rules = h('ol', 'ito-rules');
  rules.innerHTML = '<li>1〜100 の数字カードが配られます。数字は<b>自分にしか見えません</b>。</li>'
    + '<li>お題に沿って、自分の数字の大きさを表す言葉をカードに<b>書き込みます</b>。<br><span class="muted">例: お題「動物の強さ」で 95 → 「ライオン」、5 → 「アリ」</span></li>'
    + '<li>他の人には、カードの裏面と書き込んだ言葉だけが見えます。</li>'
    + '<li>言葉を手がかりに、みんなでカードを<b>ドラッグして小さい順に並べ替え</b>ます。</li>'
    + '<li>全員が「この順番でOK」を押したら答え合わせ！</li>';
  const cardsLabel = h('label', 'ito-setting', '1人あたりのカード枚数 ');
  const cards = h('input');
  cards.type = 'number';
  cards.min = 1;
  cards.max = ito.MAX_CARDS;
  cards.value = opts.cardsPerPlayer;
  cards.disabled = !host;
  cards.onchange = () => send({ type: 'setOptions', options: { cardsPerPlayer: cards.value } });
  cardsLabel.append(cards);
  box.append(
    h('h3', null, 'みんなで協力して、カードを小さい順に並べよう'), rules,
    h('div', 'ito-label', `お題は全部で${ito.THEME_COUNT}個（「〜な人」のお題は、共通の知り合いの名前を書いてもOK）`), cardsLabel,
  );
  if (!host) box.append(h('p', 'muted small', '設定はホストが変更できます'));
}

// ---------- トランプの絵（大富豪・ポーカー共通） ----------
function playingCard(card, extra = '') {
  if (!card || card === 'back') return h('span', 'pcard back ' + extra);
  if (card.s === 'j') return h('span', 'pcard joker ' + extra, 'JOKER');
  const red = card.s === 'h' || card.s === 'd';
  const e = h('span', `pcard ${red ? 'red' : 'black'} ${extra}`);
  e.append(h('span', 'pc-rank', daifugo.rankLabel(card.r)), h('span', 'pc-suit', daifugo.SUIT_MARK[card.s]));
  return e;
}
// ポーカーのカードは 2〜14（A=14）。大富豪は 3〜15（2=15）
const pokerCard = (card, extra = '') => {
  if (!card || card === 'hidden') return h('span', 'pcard back ' + extra);
  const red = card.s === 'h' || card.s === 'd';
  const e = h('span', `pcard ${red ? 'red' : 'black'} ${extra}`);
  e.append(h('span', 'pc-rank', poker.rankLabel(card.r)), h('span', 'pc-suit', poker.SUIT_MARK[card.s]));
  return e;
};

// ---------- 大富豪 ----------
let dfSel = [];
let dfKey = '';

let dfBomb = [];
// 前に描いたときの様子（何が変わったかを見せるため）
let dfPrev = null;
let dfFx = { ghostField: null, gone: [], fresh: {}, events: [], timer: null };
const DF_GHOST_MS = 1600, DF_HAND_MS = 3000, DF_EVENT_MS = 1900;
// 履歴のうち、目立たせて知らせる出来事
const DF_EVENT_WORDS = ['8切り', '場が流れました', '革命', '11バック', 'しばり', '5飛ばし', '7渡し', '10捨て', '12ボンバー', '都落ち', '反則上がり', '上がり'];

function dfSchedule() {
  // 一番早く消える効果の時刻に描き直す
  clearTimeout(dfFx.timer);
  const now = Date.now();
  const times = [dfFx.ghostField && dfFx.ghostField.until, ...dfFx.gone.map((g) => g.until), ...Object.values(dfFx.fresh), dfFx.events[0] && dfFx.events[0].until]
    .filter((t) => t && t > now);
  if (times.length) dfFx.timer = setTimeout(() => { if (view && view.game === 'daifugo') render(); }, Math.min(...times) - now + 20);
}

// 前の状態と比べて、場が流れた・手札が増えた／減った・出来事を見つける
function dfTrack(v, named) {
  const s = v.state, me = v.you, now = Date.now();
  const roundKey = `${v.code}:${v.gameNo}:${s.round}`;
  const hand = me >= 0 && s.hands[me] ? s.hands[me] : [];
  const prev = dfPrev;
  dfPrev = { roundKey, hand, field: s.field, histLen: s.history.length, phase: s.phase };
  if (!prev || prev.roundKey !== roundKey) {
    // 新しいラウンド（配り直し）: 比べない。交換でもらったカードだけ目立たせる
    dfFx = { ghostField: null, gone: [], fresh: {}, events: [], timer: dfFx.timer };
    for (const e of s.exchange || []) if (e.from === me && e.received) for (const id of e.received) dfFx.fresh[id] = now + DF_HAND_MS * 2;
    return;
  }
  // 場が流れた: 前に出ていたカードを少しの間残して見せる
  if (prev.field && !s.field) {
    const lines = s.history.slice(prev.histLen).join(' ');
    dfFx.ghostField = { cards: prev.field.cards, by: prev.field.by, until: now + DF_GHOST_MS, label: lines.includes('8切り') ? '8切り！ 場が流れます' : '場が流れました' };
  } else if (s.field) dfFx.ghostField = null;
  // 手札の変化（自分で出したカードは場に行くので除く）
  const nowIds = new Set(hand.map((c) => c.id));
  const prevIds = new Set(prev.hand.map((c) => c.id));
  const played = new Set(s.lastPlay && s.lastPlay.by === me ? s.lastPlay.cards.map((c) => c.id) : []);
  const why = s.history.slice(prev.histLen).join(' ');
  const lostLabel = why.includes('12ボンバー') ? '12ボンバーで捨てた' : why.includes('7渡し') ? '7渡しで渡した' : why.includes('10捨て') ? '10捨てで捨てた' : '交換で渡した';
  const gone = prev.hand.filter((c) => !nowIds.has(c.id) && !played.has(c.id));
  if (gone.length) dfFx.gone.push({ cards: gone, label: lostLabel, until: now + DF_HAND_MS });
  for (const c of hand) if (!prevIds.has(c.id)) dfFx.fresh[c.id] = now + DF_HAND_MS;
  // 出来事のお知らせ（新しく増えた履歴から）
  for (const line of s.history.slice(prev.histLen)) {
    if (DF_EVENT_WORDS.some((w) => line.includes(w))) {
      const start = Math.max(now, dfFx.events.length ? dfFx.events[dfFx.events.length - 1].until : now);
      dfFx.events.push({ text: named(line), start, until: start + DF_EVENT_MS });
    }
  }
}

// 7渡しの相手（次に手番が回る人）
function dfNextSeat(s, from) {
  for (let k = 1; k <= s.players; k++) {
    const p = (from + k) % s.players;
    if (!s.out[p] && s.handCounts[p] > 0 && !s.finished.includes(p) && !(s.penalty || []).includes(p)) return p;
  }
  return from;
}

function renderDaifugo(el, v) {
  const s = v.state, me = v.you;
  const name = (seat) => v.seats[seat]?.name || '?';
  const named = (t) => t.replace(/P(\d+)/g, (all, n) => v.seats[n - 1]?.name || all);
  dfTrack(v, named);
  const now = Date.now();
  dfFx.gone = dfFx.gone.filter((g) => g.until > now);
  dfFx.events = dfFx.events.filter((e) => e.until > now);
  for (const id of Object.keys(dfFx.fresh)) if (dfFx.fresh[id] <= now) delete dfFx.fresh[id];
  if (dfFx.ghostField && dfFx.ghostField.until <= now) dfFx.ghostField = null;
  const key = `${v.code}:${v.gameNo}:${s.round}:${s.phase}:${s.turnNo}`;
  if (key !== dfKey) { dfKey = key; dfSel = []; dfBomb = []; }
  const myHand = me >= 0 && s.hands[me] ? s.hands[me] : [];
  dfSel = dfSel.filter((id) => myHand.some((c) => c.id === id));
  const host = me >= 0 && me === v.hostSeat;
  const prevTitle = (p) => {
    if (!s.lastRanks) return null;
    const order = s.lastRanks.filter((q) => !s.out[q]);
    const i = order.indexOf(p);
    return i >= 0 ? daifugo.titleOf(i, order.length) : null;
  };
  const root = h('div', 'df');

  // 参加者
  const players = h('div', 'uno-players');
  for (let i = 0; i < s.players; i++) {
    const chip = h('div', 'wb-player' + (i === me ? ' me' : '') + (s.out[i] ? ' out' : '') + (s.phase === 'play' && i === s.turn ? ' turn' : ''));
    chip.append(h('span', 'pname', name(i)));
    if (v.seats[i]) chip.append(h('span', 'dot ' + (v.seats[i].online ? 'on' : 'off')));
    const t = s.phase === 'result' ? null : prevTitle(i);
    if (t) chip.append(h('span', 'df-title', t));
    const fin = s.finished.indexOf(i);
    chip.append(h('span', 'wb-count', s.out[i] ? '投了' : fin >= 0 ? `${fin + 1}位` : `${s.handCounts[i]}枚`));
    if (s.phase === 'play' && s.passed[i]) chip.append(h('span', 'wb-vote', 'パス'));
    chip.append(h('span', 'muted small', `${s.points[i]}pt`));
    players.append(chip);
  }
  root.append(players);

  // 場
  const rev = daifugo.reversed(s);
  const table = h('div', 'df-table' + (rev ? ' rev' : ''));
  if (s.revolution) table.append(h('div', 'df-rev', s.jback ? '革命中・11バック中（強さは元どおり）' : '革命中（強さが逆）'));
  else if (s.jback) table.append(h('div', 'df-rev', '11バック中（場が流れるまで強さが逆）'));
  if (s.lock) table.append(h('div', 'df-rev df-lock', `しばり中：${daifugo.SUIT_ORDER_LABEL(s.lock)} しか出せません`));
  if (s.phase === 'result') {
    const order = s.lastRanks.filter((q) => !s.out[q]);
    const list = h('ol', 'df-ranking');
    order.forEach((p, i) => list.append(h('li', null, `${daifugo.titleOf(i, order.length)}：${name(p)}`)));
    table.append(h('div', 'df-field-label', `第${s.round}ラウンドの結果`), list);
  } else if (s.field) {
    const cards = h('div', 'df-cards');
    cards.append(...daifugo.sortHand(s.field.cards).map((c) => playingCard(c, 'big')));
    table.append(h('div', 'df-field-label', `${name(s.field.by)} が出したカード`), cards);
  } else if (s.phase === 'play' && dfFx.ghostField) {
    // 流れた直後: さっきまでのカードを薄くして見せる
    const g = dfFx.ghostField;
    const cards = h('div', 'df-cards df-cleared');
    cards.style.animationDelay = `-${now - (g.until - DF_GHOST_MS)}ms`; // 描き直しても続きから
    cards.append(...daifugo.sortHand(g.cards).map((c) => playingCard(c, 'big')));
    table.append(h('div', 'df-field-label df-flow', g.label), cards);
  } else if (s.phase === 'play') {
    table.append(h('div', 'df-field-label', `場は空いています（親：${name(s.turn)}）`));
  } else {
    table.append(h('div', 'df-field-label', 'カード交換中…'));
  }
  // 出来事のお知らせ（順番に1つずつ大きく出す）
  const ev = dfFx.events.find((e) => e.start <= now);
  if (ev) {
    const b = h('div', 'df-event', ev.text);
    b.style.animationDuration = `${DF_EVENT_MS}ms`;
    b.style.animationDelay = `-${now - ev.start}ms`;
    table.append(b);
  }
  root.append(table);

  // 手札から消えたカード（12ボンバー・7渡し・10捨て・交換）
  for (const g of dfFx.gone) {
    const row = h('div', 'df-gone');
    row.style.animationDelay = `-${now - (g.until - DF_HAND_MS)}ms`;
    row.append(h('span', 'df-gone-label', `${g.label}カード`));
    const cards = h('div', 'df-cards');
    cards.append(...daifugo.sortHand(g.cards).map((c) => playingCard(c)));
    row.append(cards);
    root.append(row);
  }

  // 操作
  const bar = h('div', 'df-actions');
  const hint = h('div', 'wb-hint');
  const pend = s.phase === 'play' && s.pending && me === s.pending.by ? s.pending.effects[0] : null;
  if (pend && pend.type !== 'bomber') {
    // 7渡し・10捨て: 手札から選んで決める
    const need = Math.min(pend.count, myHand.length);
    const label = pend.type === 'seven' ? `${name(dfNextSeat(s, me))} に渡す（${dfSel.length}/${need}枚）` : `捨てる（${dfSel.length}/${need}枚）`;
    const go = h('button', 'btn primary', label);
    go.disabled = dfSel.length !== need;
    go.onclick = () => sendMove(pend.type === 'seven' ? { give7: dfSel } : { discard10: dfSel });
    bar.append(go);
    hint.textContent = pend.type === 'seven' ? '7渡し：次の人に渡すカードを選んでください' : '10捨て：捨てるカードを選んでください';
  } else if (pend) {
    // 12ボンバー: 数字を選ぶ
    const ranks = h('div', 'df-bomb');
    for (let r = 3; r <= 16; r++) {
      const b = h('button', 'btn small' + (dfBomb.includes(r) ? ' primary' : ''), daifugo.rankLabel(r));
      b.onclick = () => {
        dfBomb = dfBomb.includes(r) ? dfBomb.filter((x) => x !== r) : [...dfBomb, r].slice(-pend.count);
        render();
      };
      ranks.append(b);
    }
    const go = h('button', 'btn primary', `この数字を全員捨てる（${dfBomb.length}/${pend.count}）`);
    go.disabled = dfBomb.length !== pend.count;
    go.onclick = () => { const r = dfBomb; dfBomb = []; sendMove({ bomb: r }); };
    bar.append(ranks, go);
    hint.textContent = '12ボンバー：選んだ数字のカードを、全員（自分も）手札から捨てます';
  } else if (s.phase === 'play' && me === s.turn && !s.out[me] && !s.pending) {
    const play = h('button', 'btn primary', dfSel.length ? `出す（${dfSel.length}枚）` : '出す');
    let ok = false;
    if (dfSel.length) {
      try { daifugo.checkPlay(s, me, dfSel); ok = true; hint.textContent = '出せます'; hint.classList.add('ok'); }
      catch (e) { hint.textContent = e.message; hint.classList.add('ng'); }
    }
    play.disabled = !ok;
    play.onclick = () => sendMove({ play: dfSel });
    bar.append(play);
    if (s.field) {
      const pass = h('button', 'btn', 'パス');
      pass.onclick = () => sendMove({ pass: true });
      bar.append(pass);
    }
  }
  const ex = s.phase === 'exchange' && s.exchange.find((e) => e.from === me && !e.done);
  if (ex) {
    const give = h('button', 'btn primary', `${name(ex.to)} に渡す（${dfSel.length}/${ex.count}枚）`);
    give.disabled = dfSel.length !== ex.count;
    give.onclick = () => sendMove({ give: dfSel });
    bar.append(give);
  }
  if (s.phase === 'result') {
    if (host) {
      const next = h('button', 'btn primary', s.options && s.options.exchange === false ? '次のラウンドへ' : '次のラウンドへ（カード交換あり）');
      next.onclick = () => sendMove({ next: true });
      bar.append(next);
    } else bar.append(h('span', 'muted', 'ホストが次のラウンドを始めるのを待っています…'));
  }
  if (dfSel.length) {
    const clear = h('button', 'btn small ghost', '選択を解除');
    clear.onclick = () => { dfSel = []; render(); };
    bar.append(clear);
  }
  if (bar.childElementCount) root.append(bar);
  root.append(hint);

  // 手札
  if (me >= 0 && !s.out[me]) {
    const canSelect = (s.phase === 'play' && me === s.turn) || !!ex;
    const hand = h('div', 'df-hand');
    for (const c of myHand) {
      const fresh = dfFx.fresh[c.id];
      const b = h('button', 'df-card-btn' + (dfSel.includes(c.id) ? ' sel' : '') + (fresh ? ' df-new' : ''));
      b.append(playingCard(c));
      if (fresh) {
        b.append(h('span', 'df-new-tag', 'NEW'));
        b.firstChild.style.animationDelay = `-${Math.max(0, now - (fresh - DF_HAND_MS))}ms`;
      }
      b.disabled = !canSelect;
      b.onclick = () => {
        dfSel = dfSel.includes(c.id) ? dfSel.filter((x) => x !== c.id) : [...dfSel, c.id];
        render();
      };
      hand.append(b);
    }
    root.append(h('div', 'cc-hand-title', `あなたの手札（${myHand.length}枚）・カードを選んで「出す」`), hand);
  }
  el.replaceChildren(root);
  dfSchedule();
}

// ---------- ポーカー ----------
let pkRaise = null;
let pkKey = '';

function renderPoker(el, v) {
  const s = v.state, me = v.you;
  const name = (seat) => v.seats[seat]?.name || '?';
  const key = `${v.code}:${v.gameNo}:${s.handNo}:${s.phase}:${s.currentBet}`;
  const opt = me >= 0 ? poker.options(s, me) : null;
  if (key !== pkKey) { pkKey = key; pkRaise = opt ? opt.minRaiseTo : null; }
  const root = h('div', 'pk');

  // 場
  const table = h('div', 'pk-table');
  const board = h('div', 'pk-board');
  for (let i = 0; i < 5; i++) board.append(s.board[i] ? pokerCard(s.board[i], 'big') : h('span', 'pcard empty big'));
  const phaseName = { preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー', showdown: 'ショーダウン' }[s.phase];
  const streetBets = s.bets.reduce((a, b) => a + b, 0);
  table.append(h('div', 'pk-info', `ハンド${s.handNo}・${phaseName}`), board,
    h('div', 'pk-pot', `ポット ${s.phase === 'showdown' ? s.showdown?.pots?.reduce((a, p) => a + p.amount, 0) ?? '' : s.pot}`),
    h('div', 'muted small pk-blinds', `ブラインド ${poker.SMALL_BLIND}/${poker.BIG_BLIND}` + (streetBets ? `・このラウンドの賭け ${streetBets}` : '')));
  root.append(table);

  // 参加者
  const seats = h('div', 'pk-seats');
  for (let i = 0; i < s.players; i++) {
    const p = v.seats[i];
    const box = h('div', 'pk-seat' + (i === me ? ' me' : '') + (s.turn === i ? ' turn' : '') + (s.folded[i] || s.out[i] ? ' folded' : '')
      + (s.showdown && s.showdown.won[i] ? ' won' : ''));
    const head = h('div', 'pk-seat-head');
    head.append(h('span', 'pname', p ? p.name : '?'));
    if (i === s.button) head.append(h('span', 'pk-chip-d', 'D'));
    if (i === s.sb && s.phase === 'preflop') head.append(h('span', 'pk-tag', 'SB'));
    if (i === s.bb && s.phase === 'preflop') head.append(h('span', 'pk-tag', 'BB'));
    box.append(head, h('div', 'pk-stack', s.out[i] ? (s.out[i] === 'bust' ? '脱落' : '退席') : `${s.stacks[i]}`));
    const status = s.out[i] ? '' : s.folded[i] ? 'フォールド' : s.allIn[i] ? 'オールイン' : s.bets[i] ? `賭け ${s.bets[i]}` : '';
    if (status) box.append(h('div', 'pk-status', status));
    const hole = s.holes[i];
    if (hole && i !== me && !s.folded[i]) {
      const cards = h('div', 'pk-hole');
      cards.append(...(hole === 'hidden' ? [pokerCard(null, 'small'), pokerCard(null, 'small')] : hole.map((c) => pokerCard(c, 'small'))));
      box.append(cards);
    }
    if (s.showdown) {
      const sh = s.showdown.hands[i];
      if (sh) box.append(h('div', 'pk-hand-name', sh.name));
      if (s.showdown.won[i]) box.append(h('div', 'pk-won', `+${s.showdown.won[i]}`));
    }
    if (s.lastAction && s.lastAction.seat === i && s.phase !== 'showdown') box.append(h('div', 'muted small', s.lastAction.text));
    seats.append(box);
  }
  root.append(seats);

  // 自分の手札と操作
  if (me >= 0 && s.holes[me] && s.holes[me] !== 'hidden') {
    const mine = h('div', 'pk-mine');
    const cards = h('div', 'pk-hole');
    cards.append(...s.holes[me].map((c) => pokerCard(c, 'big')));
    mine.append(cards);
    if (s.board.length >= 3) mine.append(h('div', 'pk-hand-name', `今の役：${poker.bestHand([...s.holes[me], ...s.board]).name}`));
    root.append(mine);
  }
  if (opt) {
    const bar = h('div', 'pk-actions');
    const fold = h('button', 'btn danger', 'フォールド');
    fold.onclick = () => sendMove({ fold: true });
    bar.append(fold);
    if (opt.canCheck) {
      const check = h('button', 'btn', 'チェック');
      check.onclick = () => sendMove({ check: true });
      bar.append(check);
    } else {
      const call = h('button', 'btn primary', opt.toCall >= s.stacks[me] ? `オールインでコール ${opt.toCall}` : `コール ${opt.toCall}`);
      call.onclick = () => sendMove({ call: true });
      bar.append(call);
    }
    root.append(bar);
    if (opt.canRaise) {
      const raise = h('div', 'pk-raise');
      const range = h('input');
      range.type = 'range';
      range.min = opt.minRaiseTo;
      range.max = opt.maxRaiseTo;
      range.step = 10;
      const num = h('input');
      num.type = 'number';
      num.min = opt.minRaiseTo;
      num.max = opt.maxRaiseTo;
      const clamp = (x) => Math.max(opt.minRaiseTo, Math.min(opt.maxRaiseTo, Math.round(Number(x) || 0)));
      pkRaise = clamp(pkRaise ?? opt.minRaiseTo);
      range.value = num.value = pkRaise;
      const go = h('button', 'btn primary');
      const label = () => { go.textContent = pkRaise >= opt.maxRaiseTo ? `オールイン ${pkRaise}` : `${s.currentBet ? 'レイズ' : 'ベット'} ${pkRaise}`; };
      label();
      range.oninput = () => { pkRaise = clamp(range.value); num.value = pkRaise; label(); };
      num.onchange = () => { pkRaise = clamp(num.value); range.value = num.value = pkRaise; label(); };
      go.onclick = () => sendMove({ raise: pkRaise });
      const quick = h('div', 'pk-quick');
      const pot = s.pot;
      for (const [txt, val] of [['最小', opt.minRaiseTo], ['ポット½', s.currentBet + Math.floor(pot / 2)], ['ポット', s.currentBet + pot], ['オールイン', opt.maxRaiseTo]]) {
        const b = h('button', 'btn small', txt);
        b.onclick = () => { pkRaise = clamp(val); range.value = num.value = pkRaise; label(); };
        quick.append(b);
      }
      raise.append(range, num, go);
      root.append(quick, raise);
    }
  }
  if (s.phase === 'showdown' && !s.result) root.append(h('p', 'muted small pk-next', 'まもなく次のハンドを配ります…'));
  el.replaceChildren(root);
}

// ---------- ブロックス ----------
let bkSel = null;     // { piece, t }
let bkHover = null;   // [r, c]
let bkKey = '';

function bkPreview(s, cell) {
  if (!bkSel || !cell) return null;
  const shape = blokus.orient(blokus.PIECES[bkSel.piece], bkSel.t);
  const h2 = Math.max(...shape.map((x) => x[0])), w2 = Math.max(...shape.map((x) => x[1]));
  const r = cell[0] - Math.floor(h2 / 2), c = cell[1] - Math.floor(w2 / 2);
  const cells = blokus.placeCells(bkSel.piece, bkSel.t, r, c);
  return { r, c, cells, error: blokus.placementError(s, s.color, cells) };
}

function bkPieceEl(cells, color, extra = '') {
  const maxR = Math.max(...cells.map((x) => x[0])), maxC = Math.max(...cells.map((x) => x[1]));
  const g = h('span', 'bk-piece ' + extra);
  g.style.gridTemplateColumns = `repeat(${maxC + 1}, 1fr)`;
  g.style.gridTemplateRows = `repeat(${maxR + 1}, 1fr)`;
  for (const [r, c] of cells) {
    const sq = h('span', 'bk-sq c' + color);
    sq.style.gridRow = r + 1;
    sq.style.gridColumn = c + 1;
    g.append(sq);
  }
  return g;
}

function renderBlokus(el, v) {
  const s = v.state, me = v.you;
  const name = (seat) => v.seats[seat]?.name || '?';
  const myTurn = me >= 0 && !s.result && blokus.ownerOf(s.players, s.color) === me;
  const key = `${v.code}:${v.gameNo}:${s.history.length}`;
  if (key !== bkKey) { bkKey = key; if (!myTurn || (bkSel && !s.remaining[s.color][bkSel.piece])) bkSel = null; }
  const root = h('div', 'bk');

  // 点数と手番
  const info = h('div', 'uno-players');
  for (let p = 0; p < s.players; p++) {
    const chip = h('div', 'wb-player' + (p === me ? ' me' : '') + (s.out[p] ? ' out' : '') + (!s.result && blokus.ownerOf(s.players, s.color) === p ? ' turn' : '')
      + (s.result && (s.result.winner === p) ? ' winner' : ''));
    for (const c of blokus.colorsOf(s.players, p)) chip.append(h('span', `bk-dot c${c}` + (s.done[c] ? ' done' : '')));
    chip.append(h('span', 'pname', name(p)), h('span', 'wb-count', blokus.scoreOf(s, p)));
    info.append(chip);
  }
  root.append(info);
  if (!s.result) root.append(h('div', 'bk-turn', `${blokus.COLOR_NAMES[s.color]}の番（${name(blokus.ownerOf(s.players, s.color))}）`));

  // 盤
  const board = h('div', 'bk-board' + (myTurn && bkSel ? ' placing' : ''));
  const cellEls = [];
  for (let r = 0; r < blokus.SIZE; r++) for (let c = 0; c < blokus.SIZE; c++) {
    const col = s.board[r][c];
    const cell = h('div', 'bk-cell' + (col !== null ? ` c${col}` : ''));
    const corner = blokus.CORNERS.findIndex(([cr, cc]) => cr === r && cc === c);
    if (corner >= 0 && col === null && !s.placedAny[corner] && !s.done[corner]) cell.classList.add('start', 'sc' + corner);
    if (s.lastMove && s.lastMove.cells.some(([lr, lc]) => lr === r && lc === c)) cell.classList.add('last');
    cellEls.push(cell);
    board.append(cell);
  }
  const showPreview = () => {
    for (const e of cellEls) e.classList.remove('pv', 'ok', 'ng', 'c' + s.color + '-pv');
    const pv = myTurn ? bkPreview(s, bkHover) : null;
    if (!pv) return;
    for (const [r, c] of pv.cells) {
      if (r < 0 || r >= blokus.SIZE || c < 0 || c >= blokus.SIZE) continue;
      const e = cellEls[r * blokus.SIZE + c];
      e.classList.add('pv', pv.error ? 'ng' : 'ok');
      if (!pv.error) e.classList.add('c' + s.color + '-pv');
    }
  };
  cellEls.forEach((cell, i) => {
    const here = [Math.floor(i / blokus.SIZE), i % blokus.SIZE];
    cell.onmouseenter = () => { bkHover = here; showPreview(); };
    cell.onclick = () => {
      if (!myTurn || !bkSel) return;
      // タッチ操作: 1回目のタップで位置を決め、同じマスをもう一度タップで置く
      if (!bkHover || bkHover[0] !== here[0] || bkHover[1] !== here[1]) { bkHover = here; showPreview(); return; }
      const pv = bkPreview(s, here);
      if (pv.error) { toast(pv.error); return; }
      const sel = bkSel;
      bkSel = null;
      bkHover = null;
      send({ type: 'move', move: { piece: sel.piece, t: sel.t, r: pv.r, c: pv.c } });
    };
  });
  board.onmouseleave = () => { bkHover = null; showPreview(); };
  root.append(board);
  showPreview();

  // ピース選び
  if (me >= 0 && !s.out[me]) {
    const tools = h('div', 'bk-tools');
    if (myTurn) {
      const rot = h('button', 'btn small', '回転 (R)');
      rot.onclick = () => bkTransform('rotate');
      const flip = h('button', 'btn small', '反転 (F)');
      flip.onclick = () => bkTransform('flip');
      tools.append(rot, flip, h('span', 'muted small', bkSel ? '盤の上で置きたい場所をクリック（スマホは同じ場所を2回タップ）' : '下からピースを選んでください'));
    }
    root.append(tools);
    for (const color of blokus.colorsOf(s.players, me)) {
      const tray = h('div', 'bk-tray' + (myTurn && color === s.color ? ' active' : ''));
      tray.append(h('div', 'cc-hand-title', `${blokus.COLOR_NAMES[color]}のピース（残り${s.remaining[color].filter(Boolean).length}個）`));
      const list = h('div', 'bk-tray-list');
      blokus.PIECES.forEach((cells, i) => {
        if (!s.remaining[color][i]) return;
        const active = myTurn && color === s.color;
        const selected = active && bkSel && bkSel.piece === i;
        const b = h('button', 'bk-tray-btn' + (selected ? ' sel' : ''));
        b.append(bkPieceEl(selected ? blokus.orient(cells, bkSel.t) : cells, color));
        b.disabled = !active;
        b.onclick = () => { bkSel = selected ? null : { piece: i, t: 0 }; render(); };
        list.append(b);
      });
      tray.append(list);
      root.append(tray);
    }
  }
  el.replaceChildren(root);
}

function bkTransform(kind) {
  if (!bkSel) return;
  const t = bkSel.t;
  bkSel = { ...bkSel, t: kind === 'rotate' ? (t >= 4 ? 4 + ((t + 1) % 4) : (t + 1) % 4) : (t >= 4 ? t - 4 : t + 4) };
  render();
}

document.addEventListener('keydown', (e) => {
  if (!view || view.game !== 'blokus' || !bkSel) return;
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === 'r' || e.key === 'R') bkTransform('rotate');
  if (e.key === 'f' || e.key === 'F') bkTransform('flip');
});

// ---------- みんなでポンコツペイント ----------
// 入力欄を消さないよう骨組みは作り直さず、中身だけ更新する
let pt = null;
let ptTool = 'line';
let ptDrag = null; // 描いている途中の図形
const PT_ERASER_WIDTH = 36;

function ptDrawShapes(ctx, shapes, preview) {
  ctx.clearRect(0, 0, paint.WIDTH, paint.HEIGHT);
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, paint.WIDTH, paint.HEIGHT);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  const draw = (sh, color) => {
    // 消しゴムは背景の色で太くなぞる
    ctx.strokeStyle = sh.type === 'erase' ? '#fffdf7' : color;
    ctx.lineWidth = sh.type === 'erase' ? PT_ERASER_WIDTH : 7;
    ctx.beginPath();
    if (sh.type === 'path' || sh.type === 'erase') {
      ctx.moveTo(sh.pts[0][0], sh.pts[0][1]);
      for (const [px, py] of sh.pts.slice(1)) ctx.lineTo(px, py);
    } else if (sh.type === 'line') { ctx.moveTo(sh.x1, sh.y1); ctx.lineTo(sh.x2, sh.y2); }
    else ctx.arc(sh.x1, sh.y1, Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1), 0, Math.PI * 2);
    ctx.stroke();
  };
  for (const sh of shapes) draw(sh, '#1d1d1d');
  if (preview) draw(preview, '#e4572e');
}

function ptCanvasPoint(e) {
  const r = pt.canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * (paint.WIDTH / r.width), (e.clientY - r.top) * (paint.HEIGHT / r.height)];
}

function buildPaint(el) {
  const root = h('div', 'pt');
  root.innerHTML = `
    <div class="pt-head">
      <div class="pt-round"></div>
      <div class="pt-theme"></div>
      <div class="pt-timer"></div>
      <button class="btn small pt-gallery-btn" type="button">🖼 過去のイラスト</button>
    </div>
    <div class="pt-choose"></div>
    <div class="pt-canvas-wrap"><canvas width="${paint.WIDTH}" height="${paint.HEIGHT}"></canvas><div class="pt-reveal"></div></div>
    <div class="pt-tools">
      <button class="btn small pt-tool" data-tool="pen">✎ ペン</button>
      <button class="btn small pt-tool" data-tool="line">／ 直線</button>
      <button class="btn small pt-tool" data-tool="circle">◯ 円</button>
      <button class="btn small pt-tool" data-tool="eraser">🧽 消しゴム</button>
      <button class="btn small pt-undo">1つ戻す</button>
      <button class="btn small pt-clear">全部消す</button>
      <button class="btn small danger pt-giveup">ギブアップ</button>
      <span class="muted small pt-help"></span>
    </div>
    <form class="pt-guess row"><input maxlength="30" autocomplete="off" placeholder="答えを入力（ひらがな・カタカナ・漢字OK）"><button class="btn primary">答える</button></form>
    <div class="uno-players pt-scores"></div>
    <ul class="pt-feed"></ul>`;
  const q = (sel) => root.querySelector(sel);
  const x = {
    el, root, round: q('.pt-round'), theme: q('.pt-theme'), timer: q('.pt-timer'), choose: q('.pt-choose'),
    canvas: q('canvas'), reveal: q('.pt-reveal'), tools: q('.pt-tools'), guess: q('.pt-guess'), input: q('.pt-guess input'),
    scores: q('.pt-scores'), feed: q('.pt-feed'),
  };
  x.ctx = x.canvas.getContext('2d');
  root.querySelectorAll('.pt-tool').forEach((b) => { b.onclick = () => { ptTool = b.dataset.tool; renderPaint(el, view); }; });
  q('.pt-gallery-btn').onclick = () => openPaintGallery();
  q('.pt-undo').onclick = () => send({ type: 'move', move: { undo: true } });
  q('.pt-clear').onclick = async () => {
    if (await choose('全部消しますか？', [['yes', '消す'], [null, 'キャンセル']])) send({ type: 'move', move: { clear: true } });
  };
  q('.pt-giveup').onclick = async () => {
    if (await choose('ギブアップして答えを発表しますか？', [['yes', 'ギブアップ'], [null, 'キャンセル']])) send({ type: 'move', move: { giveUp: true } });
  };
  x.guess.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = x.input.value.trim();
    if (text) send({ type: 'move', move: { guess: text } });
    x.input.value = '';
  });
  // 描く人のドラッグ
  const canDraw = () => view && view.state && view.state.phase === 'draw' && view.you === view.state.painter;
  // 長押しのメニュー（コピーなど）や文字の選択が出ないようにする
  x.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  x.root.querySelector('.pt-canvas-wrap').addEventListener('selectstart', (e) => e.preventDefault());
  x.canvas.addEventListener('pointerdown', (e) => {
    if (!canDraw()) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    try { x.canvas.setPointerCapture(e.pointerId); } catch { /* 取れなくても描ける */ }
    const [px, py] = ptCanvasPoint(e);
    ptDrag = ptTool === 'pen' ? { type: 'path', pts: [[px, py]] } : ptTool === 'eraser' ? { type: 'erase', pts: [[px, py]] }
      : { type: ptTool, x1: px, y1: py, x2: px, y2: py };
  });
  x.canvas.addEventListener('pointermove', (e) => {
    if (!ptDrag) return;
    const [px, py] = ptCanvasPoint(e);
    if (ptDrag.pts) {
      const last = ptDrag.pts[ptDrag.pts.length - 1];
      if (Math.hypot(px - last[0], py - last[1]) >= 3) ptDrag.pts.push([px, py]); // 近すぎる点は省く
    } else [ptDrag.x2, ptDrag.y2] = [px, py];
    ptDrawShapes(x.ctx, view.state.shapes, ptDrag);
  });
  const finish = () => {
    if (!ptDrag) return;
    const sh = ptDrag;
    ptDrag = null;
    if (sh.pts) {
      let pts = sh.pts;
      if (pts.length === 1) pts = [pts[0], [pts[0][0] + 1, pts[0][1]]]; // 点を打っただけのとき
      // 点が多すぎるときは間引く
      if (pts.length > paint.MAX_PATH_POINTS) {
        const step = pts.length / paint.MAX_PATH_POINTS;
        pts = Array.from({ length: paint.MAX_PATH_POINTS }, (_, i) => pts[Math.min(pts.length - 1, Math.round(i * step))]);
      }
      send({ type: 'move', move: { shape: { type: sh.type, pts: pts.map(([px, py]) => [Math.round(px), Math.round(py)]) } } });
    } else if (Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1) >= 6) send({ type: 'move', move: { shape: sh } });
    ptDrawShapes(x.ctx, view.state.shapes, null);
  };
  x.canvas.addEventListener('pointerup', finish);
  x.canvas.addEventListener('pointercancel', () => { ptDrag = null; ptDrawShapes(x.ctx, view.state.shapes, null); });
  el.replaceChildren(root);
  return x;
}

function ptUpdateTimer() {
  if (!pt || !view || view.game !== 'paint' || !view.state || !view.state.endsAt) { if (pt) pt.timer.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((view.state.endsAt - (Date.now() + serverOffset)) / 1000));
  pt.timer.textContent = `${left}秒`;
  pt.timer.classList.toggle('hurry', view.state.phase === 'draw' && left <= 10);
}
setInterval(ptUpdateTimer, 250);

function renderPaint(el, v) {
  const s = v.state, me = v.you;
  if (!pt || pt.el !== el || !el.contains(pt.root)) pt = buildPaint(el);
  const name = (seat) => v.seats[seat]?.name || '?';
  const painter = me >= 0 && me === s.painter;

  pt.round.textContent = s.phase === 'end' ? '結果' : `第${s.round}/${s.totalRounds}ラウンド・描く人：${name(s.painter)}`;
  if (s.phase === 'end') pt.theme.textContent = '';
  else if (s.theme) pt.theme.textContent = painter ? `お題：${s.theme}` : s.phase === 'reveal' ? `答え：${s.theme}` : `正解：${s.theme}`;
  else pt.theme.textContent = s.phase === 'draw' ? `お題：${'○'.repeat(s.themeLength)}（${s.themeLength}文字）` : '';
  ptUpdateTimer();

  // お題選び
  pt.choose.replaceChildren();
  if (s.phase === 'choose') {
    if (painter) {
      pt.choose.append(h('span', 'muted', '描くお題を選んでください：'));
      s.choices.forEach((c, i) => {
        const b = h('button', 'btn primary', c);
        const tag = s.choiceTags && s.choiceTags[i];
        if (tag) b.append(h('span', 'pt-tag ' + tag, paint.TAG_NAMES[tag]));
        b.onclick = () => send({ type: 'move', move: { pick: i } });
        pt.choose.append(b);
      });
    } else pt.choose.append(h('span', 'muted', `${name(s.painter)} さんがお題を選んでいます…`));
  }

  // 絵
  if (!ptDrag) ptDrawShapes(pt.ctx, s.shapes, null);
  pt.canvas.classList.toggle('drawing', s.phase === 'draw' && painter);
  pt.reveal.hidden = s.phase !== 'reveal';
  if (s.phase === 'reveal') {
    pt.reveal.replaceChildren(h('div', null, `答え：${s.theme}`));
    if (s.penalty) pt.reveal.append(h('div', 'pt-penalty', `誰もわからず… ${name(s.painter)} さん -${s.penalty}点`));
  }

  // 道具
  pt.tools.hidden = !(s.phase === 'draw' && painter);
  const free = s.options.mode === 'free';
  const modeKey = `${v.code}:${v.gameNo}`;
  if (pt.modeKey !== modeKey) { pt.modeKey = modeKey; ptTool = free ? 'pen' : 'line'; }
  if (!free && ptTool === 'pen') ptTool = 'line';
  pt.tools.querySelector('[data-tool="pen"]').hidden = !free;
  pt.tools.querySelector('.pt-help').textContent = ptTool === 'eraser' ? 'ドラッグでなぞった所を消す' : ptTool === 'pen' ? 'ドラッグで自由に描く' : ptTool === 'line' ? 'ドラッグで描く（始点→終点）' : 'ドラッグで描く（中心→半径）';
  pt.tools.querySelectorAll('.pt-tool').forEach((b) => b.classList.toggle('primary', b.dataset.tool === ptTool));

  // 答える欄
  pt.guess.hidden = !(s.phase === 'draw' && me >= 0 && !painter && !s.out[me] && !s.correct.includes(me));

  // 点数
  pt.scores.replaceChildren(...v.seats.map((p, i) => {
    const chip = h('div', 'wb-player' + (i === me ? ' me' : '') + (s.out[i] ? ' out' : '') + (i === s.painter && s.phase !== 'end' ? ' turn' : '')
      + (s.result && s.result.winner === i ? ' winner' : ''));
    chip.append(h('span', 'pname', p ? p.name : '?'));
    if (i === s.painter && s.phase !== 'end') chip.append(h('span', 'wb-vote', '描く人'));
    if (s.correct.includes(i)) chip.append(h('span', 'pt-ok', '正解'));
    chip.append(h('span', 'wb-count', `${s.scores[i]}点`));
    return chip;
  }));

  // 答えの一覧（新しい順）
  pt.feed.replaceChildren(...s.feed.slice().reverse().map((f) => {
    const li = h('li', f.correct ? 'correct' : '');
    li.append(h('b', null, name(f.seat)), '：', f.correct ? (f.text ? `${f.text} …正解！` : '正解！') : f.text);
    return li;
  }));
}

// 過去のイラスト（サーバーに2日間保存された絵）
function ptTimeAgo(t) {
  const m = Math.max(0, Math.floor((Date.now() + serverOffset - t) / 60000));
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  const hr = Math.floor(m / 60);
  return hr < 24 ? `${hr}時間前` : `${Math.floor(hr / 24)}日前`;
}

function ptArtCard(e) {
  const card = h('div', 'pt-gal-card');
  const cv = h('canvas');
  cv.width = paint.WIDTH;
  cv.height = paint.HEIGHT;
  ptDrawShapes(cv.getContext('2d'), e.shapes, null);
  const title = h('div', 'pt-gal-theme', e.theme);
  if (e.tag) title.append(h('span', 'pt-tag ' + e.tag, paint.TAG_NAMES[e.tag]));
  const result = e.correct.length ? `正解 ${e.correct.length}/${e.guessers}人（${e.correct.join('・')}）` : '誰もわからず';
  card.append(cv, title, h('div', 'muted small', `🎨 ${e.painter}・${ptTimeAgo(e.at)}${e.mode === 'free' ? '・フリーハンド' : ''}`), h('div', 'muted small', result));
  card.onclick = () => card.classList.toggle('big');
  card.title = 'クリックで大きく表示';
  return card;
}

async function openPaintGallery() {
  const overlay = h('div', 'modal pt-gal');
  const box = h('div', 'modal-box pt-gal-box');
  const head = h('div', 'pt-gal-head');
  const close = h('button', 'btn small', '閉じる');
  head.append(h('h3', null, '過去のイラスト'), close);
  const note = h('p', 'muted small', '答え発表まで進んだ絵が新しい順に並びます（2日たつと消えます）。絵をクリックすると大きく表示します。');
  const grid = h('div', 'pt-gal-grid');
  const more = h('button', 'btn', 'もっと見る');
  more.hidden = true;
  box.append(head, note, grid, more);
  overlay.append(box);
  const done = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') done(); };
  close.onclick = done;
  overlay.onclick = (e) => { if (e.target === overlay) done(); };
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  let before = '';
  const load = async () => {
    more.disabled = true;
    try {
      const res = await fetch(`/api/paint-gallery?limit=12${before ? `&before=${before}` : ''}`);
      const data = await res.json();
      grid.append(...data.items.map(ptArtCard));
      if (data.items.length) before = String(data.items[data.items.length - 1].at);
      if (!grid.childElementCount) grid.append(h('p', 'muted', 'まだイラストはありません。'));
      more.hidden = !data.more;
    } catch {
      toast('イラストを読み込めませんでした');
    }
    more.disabled = false;
  };
  more.onclick = load;
  await load();
}

// ---------- どうぶつタワーバトル ----------
// 骨組みは作り直さず、canvas は requestAnimationFrame で毎フレーム描く（落ちる様子のコマを再生する）
let tb = null;
let tbAim = { x: 0, angle: 0 };
let tbAimKey = '';
let tbAimSent = 0;
let tbAimTimer = null;
const TB_CANVAS = { w: 640, h: 800 };

function tbDrawAnimal(ctx, t, x, y, a, alpha = 1) {
  const sh = towerbattle.SHAPES[t];
  if (!sh) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = sh.color;
  ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  for (const p of sh.parts) {
    ctx.beginPath();
    if (p.type === 'rect') ctx.rect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    else if (p.type === 'circle') ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    else { ctx.moveTo(p.pts[0][0], p.pts[0][1]); for (const q of p.pts.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath(); }
    ctx.fill();
    ctx.stroke();
  }
  // 目
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(sh.eye[0], sh.eye[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1d1d1d';
  ctx.beginPath(); ctx.arc(sh.eye[0] + 1.5, sh.eye[1], 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 見える範囲（塔が高くなったら引いて全体が入るようにする）
function tbCamera(s) {
  const spawnY = s.top - towerbattle.DROP_GAP;
  const bottom = 170;
  const needH = bottom - (spawnY - 150);
  const worldH = Math.max(660, needH);
  const worldW = worldH * (TB_CANVAS.w / TB_CANVAS.h);
  return { scale: TB_CANVAS.w / worldW, left: -worldW / 2, top: bottom - worldH, spawnY };
}

function tbDraw() {
  if (!tb || !view || view.game !== 'towerbattle' || !view.state || !document.body.contains(tb.root)) { tb && (tb.raf = null); return; }
  tb.raf = requestAnimationFrame(tbDraw);
  tbRotStep();
  const s = view.state, ctx = tb.ctx;
  const cam = tbCamera(s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 空と海
  const sky = ctx.createLinearGradient(0, 0, 0, TB_CANVAS.h);
  sky.addColorStop(0, '#8fd3f4');
  sky.addColorStop(1, '#e6f7ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, TB_CANVAS.w, TB_CANVAS.h);
  ctx.setTransform(cam.scale, 0, 0, cam.scale, -cam.left * cam.scale, -cam.top * cam.scale);
  const W = TB_CANVAS.w / cam.scale;
  ctx.fillStyle = '#3d8fd1';
  ctx.fillRect(cam.left, 120, W, 400);
  ctx.fillStyle = 'rgba(255, 255, 255, .35)';
  for (let i = 0; i < 8; i++) ctx.fillRect(cam.left + i * (W / 8) + 20, 140 + (i % 2) * 30, W / 16, 4);
  // 島
  const I = towerbattle.ISLAND;
  ctx.fillStyle = '#7a5a3a';
  ctx.beginPath();
  ctx.moveTo(-I.w / 2, 0); ctx.lineTo(I.w / 2, 0); ctx.lineTo(I.w / 2 - 30, 130); ctx.lineTo(-I.w / 2 + 30, 130); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6bbf59';
  ctx.fillRect(-I.w / 2, -2, I.w, 14);

  // 動物（落ちている最中はコマを再生、それ以外は止まった位置）
  const d = s.drop;
  let playing = false;
  if (d) {
    const k = Math.floor((Date.now() + serverOffset - d.startAt) / towerbattle.FRAME_MS);
    if (k < d.frames.length) {
      const f = d.frames[Math.max(0, k)];
      d.bodies.forEach((t, i) => tbDrawAnimal(ctx, t, f[i][0], f[i][1], f[i][2]));
      playing = true;
    }
  }
  if (!playing) for (const p of s.pieces) tbDrawAnimal(ctx, p.t, p.x, p.y, p.a);

  // ねらい中の動物（自分のはその場の位置、ほかの人のはサーバーから来た位置）
  if (s.phase === 'aim' && !s.result) {
    const mine = view.you === s.turn;
    const aim = mine ? tbAim : s.aim;
    ctx.strokeStyle = 'rgba(0, 0, 0, .25)';
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(aim.x, cam.spawnY); ctx.lineTo(aim.x, 0); ctx.stroke();
    ctx.setLineDash([]);
    tbDrawAnimal(ctx, s.current, aim.x, cam.spawnY, (aim.angle * Math.PI) / 180, mine ? 1 : 0.75);
  }
  // 残り時間
  if (s.phase === 'aim' && s.endsAt) {
    const left = Math.max(0, Math.ceil((s.endsAt - (Date.now() + serverOffset)) / 1000));
    tb.timer.textContent = `${left}秒`;
    tb.timer.classList.toggle('hurry', left <= 5);
  } else tb.timer.textContent = '';
}

function tbSendAim(force) {
  const send1 = () => { tbAimSent = Date.now(); tbAimTimer = null; send({ type: 'move', move: { aim: tbAim } }); };
  clearTimeout(tbAimTimer);
  if (force || Date.now() - tbAimSent > 150) send1();
  else tbAimTimer = setTimeout(send1, 150);
}

function tbMyTurn() {
  return view && view.state && view.state.phase === 'aim' && !view.state.result && view.you === view.state.turn;
}

function tbMove(dx, rot) {
  if (!tbMyTurn()) return;
  const R = towerbattle.AIM_RANGE;
  tbAim = { x: Math.max(-R, Math.min(R, tbAim.x + dx)), angle: (((tbAim.angle + rot) % 360) + 360) % 360 };
  tbSendAim();
}

// 長押しの回転（1秒で TB_ROT_SPEED 度。描くたびに進める）
const TB_ROT_SPEED = 90;
let tbRot = { dir: 0, last: 0 };
function tbRotStart(dir) {
  if (!tbMyTurn() || tbRot.dir === dir) return;
  tbRot = { dir, last: performance.now() };
}
function tbRotStop(dir) {
  if (tbRot.dir !== dir) return;
  tbRotStep();
  tbRot = { dir: 0, last: 0 };
  tbSendAim(true);
}
function tbRotStep() {
  if (!tbRot.dir) return;
  if (!tbMyTurn()) { tbRot = { dir: 0, last: 0 }; return; }
  const now = performance.now();
  const da = (tbRot.dir * TB_ROT_SPEED * (now - tbRot.last)) / 1000;
  tbRot.last = now;
  tbAim = { x: tbAim.x, angle: (((tbAim.angle + da) % 360) + 360) % 360 };
  tbSendAim();
}
document.addEventListener('keyup', (e) => {
  if (e.key === 'z' || e.key === 'Z') tbRotStop(-1);
  if (e.key === 'x' || e.key === 'X') tbRotStop(1);
});
window.addEventListener('blur', () => { if (tbRot.dir) tbRotStop(tbRot.dir); });

function tbDrop() {
  if (!tbMyTurn()) return;
  if (tbRot.dir) { tbRotStep(); tbRot = { dir: 0, last: 0 }; }
  clearTimeout(tbAimTimer);
  send({ type: 'move', move: { drop: { x: tbAim.x, angle: Math.round(tbAim.angle) } } });
}

function buildTower(el) {
  const root = h('div', 'tb');
  root.innerHTML = `
    <div class="tb-head">
      <div class="tb-who"></div>
      <div class="tb-next"></div>
      <div class="tb-timer"></div>
    </div>
    <div class="tb-canvas-wrap"><canvas width="${TB_CANVAS.w}" height="${TB_CANVAS.h}"></canvas><div class="tb-banner" hidden></div></div>
    <div class="tb-tools">
      <button class="btn tb-left" title="左へ（←キー）">◀</button>
      <button class="btn tb-rotl" title="押している間、左に回る（Zキー）">⟲ 長押し</button>
      <button class="btn primary tb-drop" title="落とす（スペースキー）">落とす</button>
      <button class="btn tb-rotr" title="押している間、右に回る（Xキー）">⟳ 長押し</button>
      <button class="btn tb-right" title="右へ（→キー）">▶</button>
    </div>
    <p class="muted small tb-help">盤の上をドラッグしても左右に動かせます。回転ボタンは押している間だけ回ります。キーボード: ← → で移動、Z / X を押している間回転、スペースで落とす。</p>
    <div class="uno-players tb-players"></div>`;
  const q = (sel) => root.querySelector(sel);
  const x = { el, root, canvas: q('canvas'), who: q('.tb-who'), next: q('.tb-next'), timer: q('.tb-timer'), banner: q('.tb-banner'), tools: q('.tb-tools'), help: q('.tb-help'), players: q('.tb-players') };
  x.ctx = x.canvas.getContext('2d');
  q('.tb-left').onclick = () => tbMove(-15, 0);
  q('.tb-right').onclick = () => tbMove(15, 0);
  // 回転ボタンは押している間ずっと回る（離すと止まる）
  for (const [sel, dir] of [['.tb-rotl', -1], ['.tb-rotr', 1]]) {
    const b = q(sel);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch { /* なくても動く */ }
      tbRotStart(dir);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => tbRotStop(dir));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  q('.tb-drop').onclick = tbDrop;
  // ドラッグで左右に動かす
  let dragging = false;
  const toWorldX = (e) => {
    const r = x.canvas.getBoundingClientRect();
    const cam = tbCamera(view.state);
    return ((e.clientX - r.left) * (TB_CANVAS.w / r.width)) / cam.scale + cam.left;
  };
  x.canvas.addEventListener('pointerdown', (e) => {
    if (!tbMyTurn()) return;
    dragging = true;
    try { x.canvas.setPointerCapture(e.pointerId); } catch { /* なくても動く */ }
    tbMove(Math.round(toWorldX(e)) - tbAim.x, 0);
  });
  x.canvas.addEventListener('pointermove', (e) => { if (dragging) tbMove(Math.round(toWorldX(e)) - tbAim.x, 0); });
  const stop = () => { dragging = false; };
  x.canvas.addEventListener('pointerup', stop);
  x.canvas.addEventListener('pointercancel', stop);
  x.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  el.replaceChildren(root);
  return x;
}

document.addEventListener('keydown', (e) => {
  if (!view || view.game !== 'towerbattle' || !tbMyTurn()) return;
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key;
  if (k === 'ArrowLeft') tbMove(e.shiftKey ? -2 : -10, 0);
  else if (k === 'ArrowRight') tbMove(e.shiftKey ? 2 : 10, 0);
  else if (k === 'z' || k === 'Z') tbRotStart(-1);
  else if (k === 'x' || k === 'X') tbRotStart(1);
  else if (k === ' ' || k === 'Enter') tbDrop();
  else return;
  e.preventDefault();
});

function renderTower(el, v) {
  const s = v.state, me = v.you;
  if (!tb || tb.el !== el || !el.contains(tb.root)) tb = buildTower(el);
  const name = (seat) => v.seats[seat]?.name || '?';
  // 手番が変わったら、ねらいを真ん中に戻す
  const key = `${v.code}:${v.gameNo}:${s.dropCount}:${s.turn}`;
  if (key !== tbAimKey) { tbAimKey = key; tbAim = { x: 0, angle: 0 }; }
  const mine = tbMyTurn();
  tb.who.textContent = s.result ? '結果' : s.phase === 'fell' ? `${name(s.fellBy)} さんが落としました` : s.phase === 'falling' ? `${name(s.drop ? s.drop.by : s.turn)} さんの${towerbattle.ANIMALS[s.drop ? s.drop.bodies.at(-1) : s.current].name}…` : mine ? `あなたの番：${towerbattle.ANIMALS[s.current].name}` : `${name(s.turn)} さんの番：${towerbattle.ANIMALS[s.current].name}`;
  tb.next.textContent = s.result ? '' : `つぎ：${towerbattle.ANIMALS[s.phase === 'falling' || s.phase === 'fell' ? s.current : s.next].name}`;
  tb.tools.hidden = !mine;
  tb.help.hidden = !mine;
  // 落としたときの知らせ
  const fell = s.phase === 'fell' && s.fellBy != null; // 揺れ終わってからサーバーが知らせる
  tb.banner.hidden = !fell && !s.result;
  if (s.result) tb.banner.textContent = s.result.winner != null ? `${name(s.result.winner)} さんの勝ち！` : '引き分け';
  else if (fell) tb.banner.textContent = `落ちた！ ${name(s.fellBy)} さんは脱落`;
  tb.players.replaceChildren(...v.seats.map((p, i) => {
    const chip = h('div', 'wb-player' + (i === me ? ' me' : '') + (s.out[i] ? ' out' : '') + (i === s.turn && !s.result ? ' turn' : '') + (s.result && s.result.winner === i ? ' winner' : ''));
    chip.append(h('span', 'pname', p ? p.name : '?'));
    if (s.out[i]) chip.append(h('span', 'wb-count', '脱落'));
    else if (i === s.turn && !s.result) chip.append(h('span', 'wb-vote', 'ばん'));
    return chip;
  }));
  if (!tb.raf) tb.raf = requestAnimationFrame(tbDraw);
}

// ---------- ヒット&ブロー ----------
// 数字は画面のボタンで入れる（スマホでも打ちやすく、描き直しても消えない）
let hbEntry = '';
let hbKey = '';

function renderHitBlow(el, v, act) {
  const s = v.state, me = v.you;
  const digits = s.options.digits;
  const opp = me === 1 ? 0 : 1, self = me === 1 ? 1 : 0;
  const key = `${v.code}:${v.gameNo}:${s.phase}:${s.guesses[0].length}:${s.guesses[1].length}`;
  if (key !== hbKey) { hbKey = key; hbEntry = ''; }
  const root = h('div', 'hb');

  // 自分の秘密の数
  const top = h('div', 'hb-secrets');
  const secretBox = (seat, mine) => {
    const box = h('div', 'hb-secret' + (mine ? ' mine' : ''));
    box.append(h('div', 'muted small', mine ? 'あなたの秘密の数' : `${v.seats[seat]?.name || '相手'} の秘密の数`));
    const val = s.secrets[seat];
    box.append(h('div', 'hb-digits', val && val !== 'set' ? val : val === 'set' ? '？'.repeat(digits) : '…'));
    return box;
  };
  if (me >= 0) top.append(secretBox(self, true), secretBox(opp, false));
  else top.append(secretBox(0, false), secretBox(1, false));
  root.append(top);

  // 入力（数字ボタン）
  const canSetup = me >= 0 && s.phase === 'setup' && !s.secrets[me];
  const canGuess = me >= 0 && s.phase === 'play' && act && s.turn === me && !s.result;
  if (canSetup || canGuess) {
    const pad = h('div', 'hb-pad');
    const shown = h('div', 'hb-entry');
    for (let i = 0; i < digits; i++) shown.append(h('span', 'hb-slot' + (hbEntry[i] ? ' on' : ''), hbEntry[i] || ''));
    pad.append(h('div', 'hb-pad-title', canSetup ? `秘密の数を決めよう（${digits}けた・同じ数字なし）` : '相手の数を予想しよう'), shown);
    const keys = h('div', 'hb-keys');
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      const b = h('button', 'btn hb-key', d);
      b.disabled = hbEntry.includes(d) || hbEntry.length >= digits;
      b.onclick = () => { hbEntry += d; render(); };
      keys.append(b);
    }
    const del = h('button', 'btn hb-key', '⌫');
    del.disabled = !hbEntry.length;
    del.onclick = () => { hbEntry = hbEntry.slice(0, -1); render(); };
    keys.append(del);
    const go = h('button', 'btn primary hb-go', canSetup ? 'この数に決める' : '予想する');
    go.disabled = hbEntry.length !== digits;
    go.onclick = () => { const x = hbEntry; hbEntry = ''; sendMove(canSetup ? { secret: x } : { guess: x }); };
    pad.append(keys, go);
    root.append(pad);
  }

  // 予想の一覧（自分・相手）
  const lists = h('div', 'hb-lists');
  const listOf = (seat, title) => {
    const box = h('div', 'hb-list');
    box.append(h('div', 'hb-list-title', title));
    const tbl = h('table', 'hb-table');
    const head = h('tr');
    head.append(h('th', null, '#'), h('th', null, '予想'), h('th', null, 'ヒット'), h('th', null, 'ブロー'));
    tbl.append(head);
    s.guesses[seat].forEach((g, i) => {
      const tr = h('tr', g.hit === digits ? 'hb-win' : '');
      tr.append(h('td', null, String(i + 1)), h('td', 'hb-num', g.guess), h('td', 'hb-hit', String(g.hit)), h('td', 'hb-blow', String(g.blow)));
      tbl.append(tr);
    });
    if (!s.guesses[seat].length) {
      const tr = h('tr');
      const td = h('td', 'muted small', 'まだありません');
      td.colSpan = 4;
      tr.append(td);
      tbl.append(tr);
    }
    box.append(tbl);
    return box;
  };
  if (me >= 0) lists.append(listOf(self, 'あなたの予想'), listOf(opp, '相手の予想'));
  else lists.append(listOf(0, `${v.seats[0]?.name || '先攻'} の予想`), listOf(1, `${v.seats[1]?.name || '後攻'} の予想`));
  root.append(lists);
  root.append(h('p', 'muted small hb-help', 'ヒット＝数字も場所も合っている　ブロー＝数字は合っているが場所がちがう'));
  el.replaceChildren(root);
}

// ---------- ドット&ボックス ----------
const DB_COLORS = ['#e4572e', '#2e86ab', '#3bb273', '#9b5de5'];

function renderDotsBoxes(el, v) {
  const s = v.state, me = v.you, n = s.n;
  const name = (seat) => v.seats[seat]?.name || '?';
  const myTurn = me >= 0 && !s.result && s.turn === me && !s.out[me];
  const root = h('div', 'db');
  // 参加者と点数
  const players = h('div', 'uno-players');
  for (let i = 0; i < s.players; i++) {
    const chip = h('div', 'wb-player' + (i === me ? ' me' : '') + (s.out[i] ? ' out' : '') + (i === s.turn && !s.result ? ' turn' : '') + (s.result && s.result.winner === i ? ' winner' : ''));
    chip.append(h('span', 'db-dot-color'), h('span', 'pname', name(i)), h('span', 'wb-count', `${s.scores[i]}個`));
    chip.firstChild.style.background = DB_COLORS[i];
    players.append(chip);
  }
  root.append(players);

  // 盤（SVG）。点の間隔 100、余白 30
  const G = 100, M = 30, W = n * G + M * 2;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
  svg.setAttribute('class', 'db-board' + (myTurn ? ' active' : ''));
  const el2 = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, val); return e; };
  // 取った四角
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const o = s.boxes[r][c];
    if (o == null) continue;
    const fresh = s.lastBoxes.some(([a, b]) => a === r && b === c);
    svg.append(el2('rect', { x: M + c * G + 6, y: M + r * G + 6, width: G - 12, height: G - 12, rx: 10, fill: DB_COLORS[o], opacity: fresh ? 0.75 : 0.45, class: fresh ? 'db-fresh' : '' }));
    const t = el2('text', { x: M + c * G + G / 2, y: M + r * G + G / 2 + 12, 'text-anchor': 'middle', 'font-size': 34, 'font-weight': 900, fill: '#fff' });
    t.textContent = (name(o) || '?').slice(0, 1);
    svg.append(t);
  }
  // 線
  const line = (k, r, c) => {
    const owner = (k === 'h' ? s.h : s.v)[r][c];
    const [x1, y1] = [M + c * G, M + r * G];
    const [x2, y2] = k === 'h' ? [x1 + G, y1] : [x1, y1 + G];
    const last = s.lastLine && s.lastLine.k === k && s.lastLine.r === r && s.lastLine.c === c;
    if (owner != null) {
      svg.append(el2('line', { x1, y1, x2, y2, stroke: DB_COLORS[owner], 'stroke-width': last ? 12 : 9, 'stroke-linecap': 'round', class: last ? 'db-last' : '' }));
      return;
    }
    const g = el2('g', { class: 'db-free' });
    g.append(el2('line', { x1, y1, x2, y2, class: 'db-ghost', 'stroke-width': 8, 'stroke-linecap': 'round' }));
    // 押しやすいよう、太い透明の当たり判定
    g.append(el2('line', { x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': 34, 'stroke-linecap': 'round' }));
    if (myTurn) {
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => sendMove({ line: [k, r, c] }));
    }
    svg.append(g);
  };
  for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) line('h', r, c);
  for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) line('v', r, c);
  // 点
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) svg.append(el2('circle', { cx: M + c * G, cy: M + r * G, r: 9, fill: '#333' }));
  root.append(svg);
  if (myTurn) {
    const hint = h('p', 'muted small db-hint', '点と点の間をタップして線を引こう。四角を閉じたらその四角がもらえて、もう1本引けます。');
    hint.style.borderLeft = `6px solid ${DB_COLORS[me]}`;
    root.append(hint);
  }
  el.replaceChildren(root);
}

// ---------- 朝からそれ正解 ----------
// 入力欄を消さないよう骨組みは作り直さず、中身だけ更新する
let as = null;

function buildAsasore(el) {
  const root = h('div', 'as');
  root.innerHTML = `
    <div class="as-head"><div class="as-round"></div><div class="as-timer"></div></div>
    <div class="as-theme-card"><div class="as-parent"></div><div class="as-theme"></div></div>
    <form class="as-form row"><input maxlength="30" autocomplete="off" placeholder="答えを書く（30文字まで）" enterkeyhint="send"><button class="btn primary">書く</button></form>
    <div class="as-mine muted"></div>
    <div class="as-answers"></div>
    <div class="as-tools"></div>
    <div class="uno-players as-players"></div>`;
  const q = (sel) => root.querySelector(sel);
  const x = { el, root, round: q('.as-round'), timer: q('.as-timer'), parent: q('.as-parent'), theme: q('.as-theme'), form: q('.as-form'),
    input: q('.as-form input'), mine: q('.as-mine'), answers: q('.as-answers'), tools: q('.as-tools'), players: q('.as-players') };
  x.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = x.input.value.trim();
    if (t) send({ type: 'move', move: { answer: t } });
    x.input.value = '';
    x.input.blur();
  });
  el.replaceChildren(root);
  return x;
}

function asUpdateTimer() {
  if (!as || !view || view.game !== 'asasore' || !view.state || !view.state.endsAt) { if (as) as.timer.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((view.state.endsAt - (Date.now() + serverOffset)) / 1000));
  as.timer.textContent = view.state.phase === 'write' ? `${left}秒` : '';
  as.timer.classList.toggle('hurry', left <= 10);
}
setInterval(asUpdateTimer, 250);

function renderAsasore(el, v) {
  const s = v.state, me = v.you;
  if (!as || as.el !== el || !el.contains(as.root)) as = buildAsasore(el);
  const name = (seat) => v.seats[seat]?.name || '?';
  const isParent = me >= 0 && me === s.parent;
  const judgeSeat = v.seats[s.parent]?.online === false && v.hostSeat >= 0 ? v.hostSeat : s.parent;
  const canJudge = me >= 0 && me === judgeSeat && s.phase === 'judge';
  as.round.textContent = s.phase === 'end' ? '結果' : `第${s.round}/${s.totalRounds}ラウンド`;
  as.parent.textContent = s.phase === 'end' ? '' : `親：${name(s.parent)}${isParent ? '（あなた）' : ''}`;
  as.theme.textContent = s.phase === 'end' ? 'おつかれさまでした！' : s.themeText;
  asUpdateTimer();

  // 書く欄
  const writing = s.phase === 'write' && me >= 0 && !s.out[me];
  as.form.hidden = !writing;
  as.input.placeholder = isParent ? '自分の答えを書く（30文字まで）' : '親が書きそうな答えを書く（30文字まで）';
  as.mine.textContent = writing && s.answers[me] ? `あなたの答え：「${s.answers[me]}」（書き直すときはもう一度書いて送ってください）` : '';

  // 答え
  as.answers.replaceChildren();
  if (s.phase !== 'write' && s.phase !== 'end') {
    const order = [s.parent, ...[...Array(s.players).keys()].filter((i) => i !== s.parent)];
    for (const i of order) {
      if (s.out[i]) continue;
      const card = h('div', 'as-answer' + (i === s.parent ? ' parent' : '') + (s.marks[i] ? ' ok' : ''));
      card.append(h('div', 'as-who', i === s.parent ? `親 ${name(i)}` : name(i)), h('div', 'as-text', s.answers[i] || '（書かなかった）'));
      if (i !== s.parent) {
        if (canJudge) {
          const b = h('button', 'btn small' + (s.marks[i] ? ' primary' : ''), s.marks[i] ? '正解！' : '正解にする');
          b.onclick = () => send({ type: 'move', move: { mark: i, on: !s.marks[i] } });
          card.append(b);
        } else if (s.marks[i]) card.append(h('span', 'as-badge', '正解！'));
      }
      as.answers.append(card);
    }
  }
  as.tools.replaceChildren();
  if (canJudge) {
    const ok = h('button', 'btn primary', `この判定で確定（正解 ${s.marks.filter(Boolean).length}人）`);
    ok.onclick = () => send({ type: 'move', move: { confirm: true } });
    as.tools.append(h('span', 'muted small', '同じ意味なら書き方がちがっても「正解」にしてOK。'), ok);
  }

  // 参加者
  as.players.replaceChildren(...v.seats.map((p, i) => {
    const chip = h('div', 'wb-player' + (i === me ? ' me' : '') + (s.out[i] ? ' out' : '') + (i === s.parent && s.phase !== 'end' ? ' turn' : '')
      + (s.result && s.result.winner === i ? ' winner' : ''));
    chip.append(h('span', 'pname', p ? p.name : '?'));
    if (i === s.parent && s.phase !== 'end') chip.append(h('span', 'wb-vote', '親'));
    if (s.phase === 'write' && s.answers[i]) chip.append(h('span', 'pt-ok', '書いた'));
    chip.append(h('span', 'wb-count', `${s.scores[i]}点`));
    return chip;
  }));
}

// ---------- ガイスター ----------
let gsSel = null;       // 動かすおばけ [r, c]
let gsLayout = null;    // 並べ中の青/赤（8つ）
let gsSwap = null;      // 並べ中に入れかえる1つ目
let gsKey = '';

function gsGhost(x, me, extra = '') {
  // 自分のおばけ・終わったあとは色を見せる。相手のおばけは紫の「？」
  const known = x.good != null;
  const cls = known ? (x.good ? 'good' : 'bad') : 'unknown';
  const e = h('span', `gs-ghost ${cls} ${x.o !== me ? 'opp' : ''} ${extra}`);
  e.append(h('span', 'gs-eyes'));
  if (!known) e.append(h('span', 'gs-q', '？'));
  return e;
}

function renderGeister(el, v, act) {
  const s = v.state, me = v.you === 1 ? 1 : 0, flip = me === 1;
  const key = `${v.code}:${v.gameNo}:${s.phase}:${s.moves}`;
  if (key !== gsKey) { gsKey = key; gsSel = null; }
  const root = h('div', 'gs');
  const setup = s.phase === 'setup' && v.you >= 0 && !s.layouts[v.you];
  if (s.phase !== 'setup') gsLayout = null;
  if (setup && !gsLayout) {
    gsLayout = [true, true, true, true, false, false, false, false].sort(() => Math.random() - 0.5);
    gsSwap = null;
  }
  const legal = act && s.phase === 'play' ? geister.legalMoves(s) : [];
  const targets = gsSel ? legal.filter((m) => m.to && m.from[0] === gsSel[0] && m.from[1] === gsSel[1]) : [];
  const canEscape = gsSel && legal.some((m) => m.escape && m.from[0] === gsSel[0] && m.from[1] === gsSel[1]);

  // 取ったおばけ
  const capRow = (seat) => {
    const box = h('div', 'gs-captured');
    box.append(h('span', 'muted small', `${seat === me ? 'あなた' : '相手'}が取った：`));
    const got = s.captured[seat];
    if (!got.length) box.append(h('span', 'muted small', 'なし'));
    for (const t of got) box.append(gsGhost({ o: 1 - seat, good: t === 'good' }, me, 'small'));
    return box;
  };
  if (v.you >= 0) root.append(capRow(1 - me));

  const board = h('div', 'board gs-board' + (act ? ' active' : ''));
  const N = geister.N;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const r = flip ? N - 1 - i : i, c = flip ? N - 1 - j : j, here = [r, c];
    const cell = h('div', 'sq gs-sq');
    // 出口（自分の出口は相手側の角）
    for (const p of [0, 1]) if (geister.EXITS[p].some(([a, b]) => a === r && b === c)) cell.classList.add(p === me ? 'exit-mine' : 'exit-theirs');
    if (s.lastMove && ((s.lastMove.to && eq(s.lastMove.to, here)) || eq(s.lastMove.from, here))) cell.classList.add('last');
    if (gsSel && eq(gsSel, here)) cell.classList.add('sel');
    let x = s.board[r][c];
    // 並べ中は、自分の置き場所に青/赤を出す
    const slot = setup ? geister.SLOTS[v.you].findIndex(([a, b]) => a === r && b === c) : -1;
    if (slot >= 0) {
      x = { o: v.you, good: gsLayout[slot] };
      if (gsSwap === slot) cell.classList.add('sel');
      cell.onclick = () => {
        if (gsSwap == null) gsSwap = slot;
        else { [gsLayout[gsSwap], gsLayout[slot]] = [gsLayout[slot], gsLayout[gsSwap]]; gsSwap = null; }
        render();
      };
    }
    if (x) cell.append(gsGhost(x, me));
    const t = targets.find((m) => eq(m.to, here));
    if (t) cell.append(h('span', t.capture ? 'hint cap' : 'hint dot'));
    if (s.phase === 'play') {
      cell.onclick = () => {
        if (gsSel && t) { const from = gsSel; gsSel = null; sendMove({ from, to: here }); return; }
        const mine = legal.some((m) => eq(m.from, here));
        gsSel = mine && !(gsSel && eq(gsSel, here)) ? here : null;
        render();
      };
    }
    board.append(cell);
  }
  root.append(board);
  if (v.you >= 0) root.append(capRow(me));

  const tools = h('div', 'gs-tools');
  if (setup) {
    tools.append(h('p', 'muted small', '自分のおばけを2つタップすると入れかわります。青＝良いおばけ（出口から逃がせる）、赤＝悪いおばけ（取らせると得）。'));
    const shuffle = h('button', 'btn', 'ランダムに並べる');
    shuffle.onclick = () => { gsLayout = gsLayout.slice().sort(() => Math.random() - 0.5); gsSwap = null; render(); };
    const ok = h('button', 'btn primary', 'この並びで決定');
    ok.onclick = () => { const l = gsLayout; sendMove({ layout: l }); };
    tools.append(shuffle, ok);
  } else if (s.phase === 'setup' && v.you >= 0) {
    tools.append(h('p', 'muted small', '相手が並べ終わるのを待っています…'));
  }
  if (canEscape) {
    const esc = h('button', 'btn primary', 'このおばけを出口から逃がす（勝ち！）');
    esc.onclick = () => { const from = gsSel; gsSel = null; sendMove({ from, escape: true }); };
    tools.append(esc);
  }
  if (s.phase === 'play') tools.append(h('p', 'muted small gs-help', '★の角が出口。青いおばけが出口のマスにいる番に、外へ逃がせます。'));
  root.append(tools);
  el.replaceChildren(root);
}

// ---------- マンカラ ----------
function renderMancala(el, v, act) {
  const s = v.state, me = v.you === 1 ? 1 : 0;
  const opp = 1 - me;
  const legal = act ? mancala.legalMoves(s) : [];
  const root = h('div', 'mc');
  const board = h('div', 'mc-board');
  const path = new Set(s.last ? s.last.path : []);
  const pit = (p, k) => {
    const i = mancala.pitIndex(p, k);
    const n = s.pits[i];
    const b = h('button', 'mc-pit' + (p === me ? ' mine' : '') + (path.has(i) ? ' sown' : '') + (s.last && s.last.last === i ? ' last' : '')
      + (s.last && s.last.from === i ? ' from' : ''));
    b.append(mcSeeds(n), h('span', 'mc-count', String(n)));
    const canPlay = p === me && legal.includes(k);
    b.disabled = !canPlay;
    if (canPlay) b.onclick = () => sendMove({ pit: k });
    return b;
  };
  // 上が相手（右から左へ並ぶ）、下が自分（左から右）。ゴールは自分が右、相手が左
  const store = (p) => {
    const i = mancala.storeOf(p);
    const e = h('div', 'mc-store' + (p === me ? ' mine' : '') + (s.last && s.last.last === i ? ' last' : ''));
    e.append(h('span', 'mc-store-label', p === me ? 'あなた' : '相手'), mcSeeds(s.pits[i]), h('span', 'mc-count big', String(s.pits[i])));
    return e;
  };
  const top = h('div', 'mc-row');
  for (let k = 5; k >= 0; k--) top.append(pit(opp, k));
  const bottom = h('div', 'mc-row');
  for (let k = 0; k < 6; k++) bottom.append(pit(me, k));
  const mid = h('div', 'mc-mid');
  mid.append(top, bottom);
  board.append(store(opp), mid, store(me));
  root.append(board);
  const msg = s.last && s.last.captured ? `${v.seats[s.last.by]?.name || ''} が${s.last.captured}個横取り！` : '';
  root.append(h('p', 'muted small mc-help', msg || '自分の穴（下の列）をタップすると、石を右へ（反時計回りに）1つずつまきます。最後の石が自分のゴールに入るともう1回。'));
  el.replaceChildren(root);
}

// 石を小さな丸で見せる（多いときは数字だけ）
function mcSeeds(n) {
  const box = h('span', 'mc-seeds');
  for (let i = 0; i < Math.min(n, 12); i++) box.append(h('span', 'mc-seed'));
  return box;
}

// ---------- 四目並べ ----------
function renderConnect4(el, v, act) {
  const s = v.state;
  const legal = act ? connect4.legalMoves(s) : [];
  const root = h('div', 'c4');
  const board = h('div', 'c4-board' + (act ? ' active' : ''));
  const win = new Set((s.winLine || []).map(([r, c]) => `${r},${c}`));
  for (let c = 0; c < connect4.COLS; c++) {
    const col = h('button', 'c4-col');
    col.disabled = !legal.includes(c);
    col.onclick = () => sendMove({ col: c });
    for (let r = 0; r < connect4.ROWS; r++) {
      const x = s.board[r][c];
      const cell = h('span', 'c4-cell');
      if (x != null) {
        const last = s.lastMove && s.lastMove.r === r && s.lastMove.c === c;
        const disc = h('span', `c4-disc p${x}` + (last ? ' drop' : '') + (win.has(`${r},${c}`) ? ' win' : ''));
        if (last) disc.style.setProperty('--fall', `${r + 1}`);
        cell.append(disc);
      }
      col.append(cell);
    }
    board.append(col);
  }
  root.append(board);
  if (act) root.append(h('p', 'muted small c4-help', '入れたい列をタップすると、いちばん下に落ちます。'));
  el.replaceChildren(root);
}

// ---------- スカル ----------
let skBid = null;
let skKey = '';
const SK_FACE = { flower: '🌹', skull: '💀', hidden: '' };

function renderSkull(el, v) {
  const s = v.state, me = v.you;
  const name = (seat) => v.seats[seat]?.name || '?';
  const playing = me >= 0 && !s.out[me] && !s.result;
  const total = skull.tableCount(s);
  const key = `${v.code}:${v.gameNo}:${s.history.length}`;
  const minBid = s.bid ? s.bid.n + 1 : 1;
  if (key !== skKey) { skKey = key; skBid = minBid; }
  const root = h('div', 'sk');

  // 宣言の状況
  const info = h('div', 'sk-info');
  info.append(h('span', null, `場のコースター ${total}枚`));
  if (s.bid) info.append(h('span', 'sk-bid', `宣言：${s.bid.n}枚（${name(s.bid.seat)}）`));
  if (s.phase === 'reveal') info.append(h('span', 'sk-bid', `めくった花 ${s.flowersFound}/${s.bid.n}`));
  root.append(info);

  // ラウンドの結果
  if (s.phase === 'roundEnd' && s.lastRound) {
    const lr = s.lastRound;
    const text = lr.success ? `${name(lr.challenger)} が挑戦成功！` : `${name(lr.challenger)} が ${name(lr.skullOwner)} のドクロを引いて失敗…`;
    const banner = h('div', 'sk-banner ' + (lr.success ? 'ok' : 'ng'), text);
    if (!lr.success && lr.challenger === me && s.lost[me]) banner.append(h('div', 'small', `あなたは ${s.lost[me] === 'skull' ? 'ドクロ' : '花'} を1枚失いました`));
    root.append(banner);
  }

  // 各プレイヤーの山
  const grid = h('div', 'sk-grid');
  for (let i = 0; i < s.players; i++) {
    const st = s.stacks[i];
    const canFlip = playing && s.phase === 'reveal' && me === s.challenger && i !== me && s.revealed[i] < st.length;
    const box = h(canFlip ? 'button' : 'div', 'sk-player' + (i === me ? ' me' : '') + (s.out[i] ? ' out' : '') + (s.turn === i ? ' turn' : '')
      + (canFlip ? ' flippable' : '') + (s.result && s.result.winner === i ? ' winner' : ''));
    const head = h('div', 'sk-head');
    head.append(h('span', 'pname', name(i)), h('span', 'sk-points', '★'.repeat(s.points[i]) + '☆'.repeat(Math.max(0, skull.WIN_POINTS - s.points[i]))));
    box.append(head);
    const owned = s.owned[i];
    const ownedCount = owned.count ?? owned.flower + owned.skull;
    const hand = s.hands[i];
    const handCount = hand.count ?? hand.flower + hand.skull;
    box.append(h('div', 'muted small', s.out[i] ? '脱落' : `持ち ${ownedCount}枚・手元 ${handCount}枚`));
    const stack = h('div', 'sk-stack');
    // 上の方を先頭に並べる
    st.slice().reverse().forEach((d, k) => {
      const shown = k < s.revealed[i];
      const disc = h('span', 'sk-disc' + (shown ? ' open ' + d : i === me ? ' mine ' + d : ' back'), shown || i === me ? SK_FACE[d] : '');
      stack.append(disc);
    });
    if (!st.length) stack.append(h('span', 'muted small', '—'));
    box.append(stack);
    const tags = h('div', 'sk-tags');
    if (s.phase === 'bid' && s.passed[i]) tags.append(h('span', 'wb-vote', 'パス'));
    if (s.bid && s.bid.seat === i && s.phase !== 'roundEnd') tags.append(h('span', 'sk-tag', `${s.bid.n}枚`));
    if (s.phase === 'place' && st.length) tags.append(h('span', 'wb-vote', '置いた'));
    box.append(tags);
    if (canFlip) box.onclick = () => sendMove({ flip: i });
    grid.append(box);
  }
  root.append(grid);

  // 自分の操作
  if (playing) {
    const bar = h('div', 'sk-actions');
    const hand = s.hands[me];
    const canPlace = (s.phase === 'place' && !s.stacks[me].length) || (s.phase === 'build' && s.turn === me);
    if (canPlace) {
      for (const type of ['flower', 'skull']) {
        const b = h('button', 'btn sk-place ' + type, `${SK_FACE[type]} ${type === 'skull' ? 'ドクロ' : '花'}を置く（${hand[type]}）`);
        b.disabled = !hand[type];
        b.onclick = () => sendMove({ place: type });
        bar.append(b);
      }
    }
    if ((s.phase === 'build' || s.phase === 'bid') && s.turn === me && minBid <= total) {
      const sel = h('select', 'size-select');
      for (let n = minBid; n <= total; n++) { const o = h('option', null, `${n}枚`); o.value = String(n); sel.append(o); }
      sel.value = String(Math.max(minBid, Math.min(total, skBid)));
      sel.onchange = () => { skBid = Number(sel.value); };
      const bid = h('button', 'btn primary', '宣言する');
      bid.onclick = () => sendMove({ bid: Number(sel.value) });
      bar.append(h('span', 'muted small', '何枚めくれるか：'), sel, bid);
    }
    if (s.phase === 'bid' && s.turn === me) {
      const pass = h('button', 'btn', 'パス');
      pass.onclick = () => sendMove({ pass: true });
      bar.append(pass);
    }
    if (s.phase === 'reveal' && s.challenger === me) bar.append(h('span', 'sk-hint', 'めくる人の山をクリック（上から1枚ずつ）'));
    if (bar.childElementCount) root.append(bar);
  }
  el.replaceChildren(root);
}

// ---------- 軍儀 ----------
let gnSel = null;     // { from: [r, c] } か { drop: 種類 }
let gnInfo = null;    // 詳しく見るマス [r, c]
let gnKey = '';
let gnHelp = false;   // 駒の動き一覧を開いているか

const gnSame = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

function gnPiece(p, me, extra = '') {
  return h('span', `gn-piece o${p.o} ${p.o !== me ? 'opp' : ''} ${p.t === '帥' ? 'marshal' : ''} ${extra}`, p.t);
}

// 駒の動きの図（段ごと）。中心が駒、前が上
function gnDiagram(type, tier, small = false, flipped = false) {
  const N = 11, C = 5;
  const box = h('div', 'gn-diagram' + (small ? ' small' : '') + (flipped ? ' flipped' : ''));
  const cells = Array.from({ length: N * N }, () => h('span', 'gn-dcell'));
  cells[C * N + C].classList.add('center');
  cells[C * N + C].textContent = type;
  for (const [dr, dc, k] of gungi.MOVES[type]) {
    const r = C + dr, c = C + dc;
    if (r < 0 || r >= N || c < 0 || c >= N) continue;
    const cell = cells[r * N + c];
    if (k === 'run') cell.classList.add('run');
    else if (k <= tier) cell.classList.add(gungi.JUMPERS.has(type) ? 'jump' : 'step', 't' + k);
  }
  box.append(...cells);
  return box;
}

function gnHelpPanel() {
  const wrap = h('div', 'gn-help');
  const head = h('div', 'gn-help-head');
  head.append(h('h3', null, '駒の動き一覧'));
  const close = h('button', 'btn small', '閉じる');
  close.onclick = () => { gnHelp = false; render(); };
  head.append(close);
  wrap.append(head);
  const legend = h('div', 'gn-legend');
  legend.innerHTML = '<span class="gn-dcell step t1"></span>動ける <span class="gn-dcell jump t1"></span>飛び越えて動ける（弓・砲・筒）'
    + ' <span class="gn-dcell run"></span>遮られるまでどこまでも　段が上がると、薄い色のマスまで届くようになります';
  wrap.append(legend);
  wrap.append(h('p', 'muted small', '・自分の段以下の高さの塔にだけ手を出せます（取る・ツケる）。・弓・砲・筒は間の駒を飛び越えられますが、自分より高い塔は飛び越えられません。・帥の上には重ねられません。'));
  const grid = h('div', 'gn-help-grid');
  for (const t of gungi.PIECE_ORDER) {
    const card = h('div', 'gn-help-card');
    card.append(h('div', 'gn-help-name', `${gungi.PIECE_NAMES[t]}　×${gungi.PIECE_COUNTS[t]}`));
    const row = h('div', 'gn-help-tiers');
    for (const tier of [1, 2, 3]) {
      const col = h('div', 'gn-help-tier');
      col.append(h('div', 'muted small', `${tier}段目`), gnDiagram(t, tier, true));
      row.append(col);
    }
    card.append(row);
    grid.append(card);
  }
  wrap.append(grid);
  return wrap;
}

function renderGungi(el, v, act) {
  const s = v.state, me = v.you === 1 ? 1 : 0, flip = me === 1;
  const mode = gungi.MODES[s.options.mode];
  const key = `${v.code}:${v.gameNo}:${s.history.length}`;
  if (key !== gnKey) { gnKey = key; gnSel = null; }
  const myTurn = act && s.turn === v.you;
  const legal = myTurn && s.phase === 'play' ? gungi.legalMoves(s) : [];
  const root = h('div', 'gn');

  // 上部: モード・操作
  const bar = h('div', 'gn-bar');
  bar.append(h('span', 'gn-mode', `${mode.name}（${mode.maxTier}段まで）`));
  const helpBtn = h('button', 'btn small', '駒の動き一覧');
  helpBtn.onclick = () => { gnHelp = !gnHelp; render(); };
  bar.append(helpBtn);
  root.append(bar);
  if (gnHelp) root.append(gnHelpPanel());

  // 行ける先
  let targets = [];
  if (gnSel && gnSel.from) targets = legal.filter((m) => !m.drop && gnSame(m.from, gnSel.from));
  else if (gnSel && gnSel.drop && s.phase === 'play') targets = legal.filter((m) => m.drop === gnSel.drop);
  // 指す駒を選んでいないときは、タップした駒（相手の駒・自分の番でないときの自分の駒）の動ける所を表示する。
  // 自分の番の自分の駒は、選んだときの「動かせる所」だけを出す（同じような表示を2つ出さない）
  const pvStack = !gnSel && gnInfo ? s.board[gnInfo[0]][gnInfo[1]] : [];
  const pvTop = pvStack.length ? pvStack[pvStack.length - 1] : null;
  const pvPiece = pvTop && !(myTurn && s.phase === 'play' && pvTop.o === v.you) ? pvTop : null;
  const preview = pvPiece ? gungi.pieceTargets(s, gnInfo[0], gnInfo[1]) : [];

  // 持ち駒
  const handEl = (owner) => {
    const box = h('div', 'gn-hand' + (owner === me ? ' mine' : ' theirs'));
    box.append(h('span', 'gn-hand-label', `${gungi.sideNames[owner]}の持ち駒`));
    const list = h('div', 'gn-hand-list');
    let any = false;
    for (const t of gungi.PIECE_ORDER) {
      const n = s.hands[owner][t];
      if (!n) continue;
      any = true;
      const b = h('button', 'gn-hand-btn' + (gnSel && gnSel.drop === t && owner === me ? ' sel' : ''));
      b.append(gnPiece({ o: owner, t }, me), h('span', 'gn-count', `×${n}`));
      const usable = owner === v.you && myTurn && legal.some((m) => m.drop === t);
      b.disabled = !usable;
      b.onclick = () => { gnSel = gnSel && gnSel.drop === t ? null : { drop: t }; render(); };
      list.append(b);
    }
    if (!any) list.append(h('span', 'muted small', 'なし'));
    box.append(list);
    return box;
  };

  // 盤
  const board = h('div', 'gn-board' + (myTurn ? ' active' : ''));
  const cols = '987654321', rows = '一二三四五六七八九';
  for (let j = 0; j < 9; j++) board.append(h('span', 'lbl', cols[flip ? 8 - j : j]));
  board.append(h('span', 'lbl'));
  const marshalChecked = s.check ? (() => {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const st = s.board[r][c];
      if (st.length && st[st.length - 1].o === s.turn && st[st.length - 1].t === '帥') return [r, c];
    }
    return null;
  })() : null;
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const r = flip ? 8 - i : i, c = flip ? 8 - j : j, here = [r, c];
      const st = s.board[r][c];
      const cell = h('div', 'gn-sq' + (st.length ? ` h${st.length}` : ''));
      if (s.lastMove && (gnSame(s.lastMove.to, here) || gnSame(s.lastMove.from, here))) cell.classList.add('last');
      if (gnSel && gnSel.from && gnSame(gnSel.from, here)) cell.classList.add('sel');
      if (gnInfo && gnSame(gnInfo, here)) cell.classList.add('info');
      if (gnSame(marshalChecked, here)) cell.classList.add('check');
      if (st.length) {
        const stack = h('div', 'gn-stack');
        // 下の段の駒は少しずらして見せる
        st.forEach((p, k) => {
          const isTop = k === st.length - 1;
          const e = gnPiece(p, me, isTop ? 'top' : 'under');
          e.style.setProperty('--k', String(k));
          stack.append(e);
        });
        cell.append(stack);
        if (st.length > 1) cell.append(h('span', 'gn-tier', `${st.length}段`));
      }
      const ts = targets.filter((m) => gnSame(m.to, here));
      if (ts.length) {
        const kinds = new Set(ts.map((m) => m.kind));
        const jump = ts.some((m) => m.jump);
        const cls = kinds.has('capture') ? 'cap' : kinds.has('tsuke') ? 'tsuke' : 'dot';
        cell.append(h('span', `gn-hint ${cls}${jump ? ' jump' : ''}`, kinds.has('tsuke') && !kinds.has('capture') ? '↑' : ''));
      } else {
        const pv = preview.find((x) => gnSame(x.to, here));
        if (pv) {
          const cls = pv.kinds.includes('capture') ? 'cap' : pv.kinds.includes('tsuke') ? 'tsuke' : 'dot';
          cell.append(h('span', `gn-hint pv ${cls}${pv.jump ? ' jump' : ''}${pvPiece.o !== me ? ' opp' : ''}`, cls === 'tsuke' ? '↑' : ''));
        }
      }
      cell.onclick = () => gnClick(here, ts, s, v, legal);
      board.append(cell);
    }
    board.append(h('span', 'lbl', rows[flip ? 8 - i : i]));
  }

  const main = h('div', 'gn-main');
  const left = h('div', 'gn-left');
  const note = h('div', 'gn-pv-note');
  if (pvPiece) {
    note.classList.add(pvPiece.o !== me ? 'opp' : 'mine');
    note.textContent = `${pvPiece.o !== me ? '相手' : '自分'}の${gungi.PIECE_NAMES[pvPiece.t]}（${pvStack.length}段目）が動ける所：${preview.length ? `${preview.length}マス` : 'なし'}`
      + (preview.some((x) => x.jump) ? '（点線の印は飛び越え）' : '');
  } else if (gnSel && gnSel.from && s.phase === 'play') {
    const st = s.board[gnSel.from[0]][gnSel.from[1]];
    note.classList.add('mine');
    note.textContent = `${gungi.PIECE_NAMES[st[st.length - 1].t]}（${st.length}段目）を動かす所を選んでください${targets.some((m) => m.jump) ? '（オレンジは飛び越え）' : ''}`;
  } else if (gnSel && gnSel.drop) {
    note.classList.add('mine');
    note.textContent = `${gungi.PIECE_NAMES[gnSel.drop]}を打つ所を選んでください`;
  } else note.textContent = myTurn && s.phase === 'play'
    ? '動かす駒をタップしてください（相手の駒をタップすると、その駒の動ける所が見られます）'
    : '駒をタップすると、動ける所を盤に表示します（相手の駒もOK）';
  left.append(handEl(1 - me), note, board, handEl(me));
  main.append(left, gnInfoPanel(s, me));
  root.append(main);
  el.replaceChildren(root);
}

// 選んだマスの塔の中身（下の駒も含めて、それぞれの動き）
function gnInfoPanel(s, me) {
  const panel = h('div', 'gn-info');
  if (!gnInfo) {
    panel.append(h('p', 'muted small', '盤のマスをクリックすると、その塔に積まれている駒と、それぞれの動きがここに出ます。'));
    return panel;
  }
  const [r, c] = gnInfo;
  const st = s.board[r][c];
  panel.append(h('div', 'gn-info-head', `${gungi.squareName(r, c)}の塔（${st.length}段）`));
  if (!st.length) { panel.append(h('p', 'muted small', '駒はありません')); return panel; }
  st.slice().reverse().forEach((p, idx) => {
    const tier = st.length - idx;
    const item = h('div', 'gn-info-item' + (idx === 0 ? ' top' : ''));
    const head = h('div', 'gn-info-row');
    head.append(gnPiece(p, me), h('span', null, `${tier}段目・${gungi.sideNames[p.o]}の${gungi.PIECE_NAMES[p.t]}`));
    item.append(head);
    item.append(h('div', 'muted small', idx === 0 ? 'いまの動き' : `上に駒があるので今は動けません（一番上になったら${tier}段目の動き）`));
    item.append(gnDiagram(p.t, tier, true, p.o !== me));
    panel.append(item);
  });
  return panel;
}

async function gnClick(here, ts, s, v, legal) {
  gnInfo = here;
  // 行き先をクリックしたとき
  if (gnSel && ts.length) {
    if (gnSel.drop) { sendMove({ drop: gnSel.drop, to: here }); return; }
    let m = ts[0];
    if (ts.length > 1) {
      const label = (x) => (x.kind === 'capture' ? '取る' : x.betray ? 'ツケて寝返らせる（謀）' : x.kind === 'tsuke' ? 'ツケる（上に重ねる）' : '動く');
      const pick = await choose('どうしますか？', ts.map((x, i) => [String(i), label(x)]));
      if (pick == null) return;
      m = ts[Number(pick)];
    }
    sendMove({ from: m.from, to: m.to, kind: m.kind, betray: m.betray || undefined });
    return;
  }
  // 自分の駒を選ぶ
  const st = s.board[here[0]][here[1]];
  const mine = st.length && st[st.length - 1].o === v.you && legal.some((m) => !m.drop && gnSame(m.from, here));
  gnSel = mine && !(gnSel && gnSel.from && gnSame(gnSel.from, here)) ? { from: here } : null;
  render();
}

const RENDERERS = { chess: renderChess, shogi: renderShogi, gobblet: renderGobblet, gomoku: renderGomoku, othello: renderOthello, wordbasket: renderWordBasket, catchoco: renderCatChoco, uno: renderUno, werewolf: renderWerewolf, ito: renderIto, daifugo: renderDaifugo, poker: renderPoker, blokus: renderBlokus, paint: renderPaint, skull: renderSkull, gungi: renderGungi, towerbattle: renderTower, hitblow: renderHitBlow, dotsboxes: renderDotsBoxes, asasore: renderAsasore, geister: renderGeister, mancala: renderMancala, connect4: renderConnect4 };

// ---------- イベント ----------
const nameInput = $('#name');
nameInput.value = store.get('name', '');
nameInput.addEventListener('change', () => {
  store.set('name', nameInput.value.trim());
  send({ type: 'setName', name: myName() });
});

$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#join-code').value.trim().toUpperCase();
  if (code) send({ type: 'join', code });
});

$('#leave').onclick = () => send({ type: 'leave' });
$('#brand').onclick = (e) => { e.preventDefault(); if (view) send({ type: 'leave' }); };

$('#copy-link').onclick = async () => {
  // LINE で送っても Safari / Chrome で開くよう openExternalBrowser=1 を付ける（ほかのブラウザでは何も起きない）
  const url = `${location.origin}/?openExternalBrowser=1#${view.code}`;
  try { await navigator.clipboard.writeText(url); toast('招待リンクをコピーしました'); }
  catch { await choose(`このリンクを相手に送ってください:\n${url}`, [['ok', '閉じる']]); }
};

// 大富豪のルール設定（画面の真ん中に ON/OFF の表を出す。変えたらすぐ反映）
function openDaifugoRules(rules, onChange) {
  const overlay = h('div', 'modal df-rules-modal');
  const box = h('div', 'modal-box df-rules-box');
  const head = h('div', 'df-rules-head');
  const close = h('button', 'btn primary small', '決定');
  head.append(h('h3', null, '大富豪のルール設定'), close);
  const list = h('div', 'df-rules-list');
  for (const [k, name, help] of daifugo.RULES) {
    const row = h('label', 'df-rule-row');
    const cb = h('input');
    cb.type = 'checkbox';
    cb.checked = rules[k];
    cb.onchange = () => { rules[k] = cb.checked; onChange(); };
    const text = h('span', 'df-rule-text');
    text.append(h('b', null, name), h('span', 'muted small', help));
    row.append(cb, text);
    list.append(row);
  }
  const jl = h('label', 'df-rule-row');
  const js = h('select', 'size-select');
  for (const n of daifugo.JOKER_COUNTS) { const o = h('option', null, `${n}枚`); o.value = String(n); js.append(o); }
  js.value = String(rules.jokers);
  js.onchange = () => { rules.jokers = Number(js.value); onChange(); };
  const jt = h('span', 'df-rule-text');
  jt.append(h('b', null, 'ジョーカーの枚数'), h('span', 'muted small', '2枚ならジョーカー2枚のペアも出せる'));
  jl.append(js, jt);
  list.append(jl);
  const reset = h('button', 'btn small ghost', 'ふつうのルールに戻す');
  reset.type = 'button';
  reset.onclick = () => {
    Object.assign(rules, daifugo.normalizeOptions({}));
    onChange();
    overlay.remove();
    openDaifugoRules(rules, onChange);
  };
  box.append(head, list, reset);
  overlay.append(box);
  const done = () => overlay.remove();
  close.onclick = done;
  overlay.onclick = (e) => { if (e.target === overlay) done(); };
  document.body.append(overlay);
}

// ---------- ニコニコ風に流れるチャット ----------
const nicoSeen = {};          // 部屋ごとに、もう流したコメントの番号
const nicoLanes = [];         // 行ごとに、次のコメントを出してよい時刻
const NICO_MS = 7000;
const nicoOn = () => store.get('nicoOn', '1') === '1';
function nicoRenderToggle() { $('#nico-toggle').textContent = nicoOn() ? 'コメントを流す：ON' : 'コメントを流す：OFF'; }
$('#nico-toggle').onclick = () => { store.set('nicoOn', nicoOn() ? '0' : '1'); nicoRenderToggle(); if (!nicoOn()) $('#nico').replaceChildren(); };
nicoRenderToggle();

function nicoFeed(v) {
  const key = `${v.code}`;
  const ids = v.chat.map((c) => c.id || 0);
  const max = ids.length ? Math.max(...ids) : 0;
  // 部屋に入ったときにすでにあったコメントは流さない
  if (nicoSeen[key] == null) { nicoSeen[key] = max; return; }
  const fresh = v.chat.filter((c) => (c.id || 0) > nicoSeen[key] && !c.system);
  nicoSeen[key] = Math.max(nicoSeen[key], max);
  if (nicoOn()) fresh.forEach(nicoShow);
}

function nicoShow(c) {
  const box = $('#nico');
  const laneH = 38, top0 = 64;
  const lanes = Math.max(3, Math.floor((window.innerHeight * 0.6 - top0) / laneH));
  const now = Date.now();
  // 空いている行（前のコメントが十分進んだ行）を上から探す。なければ一番早く空く行
  let lane = 0;
  for (let i = 0; i < lanes; i++) {
    if ((nicoLanes[i] || 0) <= now) { lane = i; break; }
    if ((nicoLanes[i] || 0) < (nicoLanes[lane] || 0)) lane = i;
  }
  const el = h('div', 'nico-msg');
  el.append(c.text);
  if (c.name) el.append(h('span', 'nico-name', c.name));
  el.style.top = `${top0 + lane * laneH}px`;
  el.style.animationDuration = `${NICO_MS}ms`;
  box.append(el);
  // 文字の長さに合わせて、次のコメントがぶつからない時刻を決める
  const w = el.getBoundingClientRect().width;
  nicoLanes[lane] = now + (NICO_MS * (w + 40)) / (window.innerWidth + w);
  el.addEventListener('animationend', () => el.remove());
}

// すぐ書けるチャット欄（右下の 💬）
$('#quick-chat-btn').onclick = () => {
  $('#quick-chat').hidden = false;
  $('#quick-chat-btn').hidden = true;
  $('#quick-chat-input').focus();
};
$('#quick-chat-close').onclick = () => { $('#quick-chat').hidden = true; $('#quick-chat-btn').hidden = !view; };
$('#quick-chat').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#quick-chat-input');
  if (input.value.trim()) send({ type: 'chat', text: input.value });
  input.value = '';
});

// ゲーム画面の長押しメニュー（コピーなど）を出さない（入力欄は今までどおり）
$('#board').addEventListener('contextmenu', (e) => {
  if (!/INPUT|TEXTAREA/.test(e.target.tagName)) e.preventDefault();
});

// ---------- ホストが名前をタップして追い出す ----------
$('#room').addEventListener('click', async (e) => {
  const v = view;
  if (!v || v.you < 0 || v.you !== v.hostSeat) return;
  const el = e.target.closest('.pname');
  if (!el) return;
  let seat = el.dataset.seat != null ? Number(el.dataset.seat) : -1;
  if (seat < 0) {
    // 名前の文字から席を探す（自分以外で同じ名前の人）
    const name = el.textContent.trim();
    seat = v.seats.findIndex((p, i) => p && i !== v.you && p.name === name);
  }
  const p = v.seats[seat];
  if (seat < 0 || seat === v.you || !p || p.bot || p.kicked) return;
  e.stopPropagation();
  const note = v.multi ? (v.ready && !v.state?.result ? '（ゲーム中なら、その人は脱落になります）' : '') : (v.ready ? '（対局はやり直しになり、新しい相手を待ちます）' : '');
  const ok = await choose(`${p.name} さんを部屋から追い出しますか？${note}\nこの部屋にはもう入れなくなります。`, [['yes', '追い出す'], [null, 'キャンセル']]);
  if (ok) send({ type: 'kick', seat });
}, true);

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  if (input.value.trim()) send({ type: 'chat', text: input.value });
  input.value = '';
});

window.addEventListener('hashchange', () => {
  const code = location.hash.slice(1).toUpperCase();
  if (code && (!view || view.code !== code)) send({ type: 'join', code });
});

render();
connect();
// 読み込めたので「時間がかかっています」のお知らせは出さない
window.__booted = true;
$('#boot').style.display = 'none';
