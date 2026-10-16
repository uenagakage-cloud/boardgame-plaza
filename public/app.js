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

const GAMES = { chess, shogi, gobblet, gomoku, othello, wordbasket, catchoco, uno, werewolf, ito, daifugo, poker, blokus, paint, skull };
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
  paint: { icon: '🎨', desc: '直線と円しか描けないお絵かき（フリーハンドも可）でお題を当てっこ。2〜8人。' },
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
  send({ type: 'move', move });
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
        const turns = mk('描く回数', 'paintTurns', [1, 2, 3], (n) => `1人${n}回`, 1);
        const secs = mk('制限時間', 'paintSeconds', [60, 90, 120], (n) => `${n}秒`, 90);
        const mode = mk('描き方', 'paintMode', Object.keys(paint.MODES), (m) => paint.MODES[m], 'ponkotsu');
        getOptions = () => ({ turns: Number(turns.value), seconds: Number(secs.value), mode: mode.value });
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
  el.append(h('span', 'pname', p ? p.name : '対戦相手を待っています…'));
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
  hist.scrollTop = hist.scrollHeight;

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

  if (v.state) RENDERERS[v.game]($('#board'), v, canAct(v));
  else renderWaiting($('#board'), v);
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
  else renderLobby();
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
      const usable = owner === me && legal.some((m) => m.drop === t);
      b.disabled = !usable;
      if (sel && sel.drop === t && owner === me) b.classList.add('sel');
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
  e.append(h('span', 'eyes'));
  return e;
}

function renderGobblet(el, v, act) {
  const s = v.state, me = v.you === 1 ? 1 : 0, flip = me === 1;
  const legal = act ? gobblet.legalMoves(s) : [];
  const isSelMove = (m) => (sel.from != null ? m.from === sel.from : m.from == null && m.size === sel.size);
  const targets = sel ? legal.filter(isSelMove) : [];

  const handEl = (owner) => {
    const box = h('div', 'gob-hand' + (owner === me ? ' mine' : ' theirs'));
    for (const size of [3, 2, 1]) {
      for (let k = 0; k < s.hands[owner][size]; k++) {
        const b = h('button', 'gob-slot');
        b.append(gob({ o: owner, s: size }));
        b.disabled = !(owner === me && legal.some((m) => m.size === size));
        if (owner === me && sel && sel.size === size && k === 0) b.classList.add('sel');
        b.title = gobblet.SIZE_NAMES[size];
        b.onclick = () => { sel = sel && sel.size === size ? null : { size }; render(); };
        box.append(b);
      }
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

function renderDaifugo(el, v) {
  const s = v.state, me = v.you;
  const name = (seat) => v.seats[seat]?.name || '?';
  const key = `${v.code}:${v.gameNo}:${s.round}:${s.phase}:${s.turnNo}`;
  if (key !== dfKey) { dfKey = key; dfSel = []; }
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
  const table = h('div', 'df-table' + (s.revolution ? ' rev' : ''));
  if (s.revolution) table.append(h('div', 'df-rev', '革命中（強さが逆）'));
  if (s.phase === 'result') {
    const order = s.lastRanks.filter((q) => !s.out[q]);
    const list = h('ol', 'df-ranking');
    order.forEach((p, i) => list.append(h('li', null, `${daifugo.titleOf(i, order.length)}：${name(p)}`)));
    table.append(h('div', 'df-field-label', `第${s.round}ラウンドの結果`), list);
  } else if (s.field) {
    const cards = h('div', 'df-cards');
    cards.append(...daifugo.sortHand(s.field.cards).map((c) => playingCard(c, 'big')));
    table.append(h('div', 'df-field-label', `${name(s.field.by)} が出したカード`), cards);
  } else if (s.phase === 'play') {
    table.append(h('div', 'df-field-label', `場は空いています（親：${name(s.turn)}）`));
  } else {
    table.append(h('div', 'df-field-label', 'カード交換中…'));
  }
  root.append(table);

  // 操作
  const bar = h('div', 'df-actions');
  const hint = h('div', 'wb-hint');
  if (s.phase === 'play' && me === s.turn && !s.out[me]) {
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
      const next = h('button', 'btn primary', '次のラウンドへ（カード交換あり）');
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
      const b = h('button', 'df-card-btn' + (dfSel.includes(c.id) ? ' sel' : ''));
      b.append(playingCard(c));
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

function ptDrawShapes(ctx, shapes, preview) {
  ctx.clearRect(0, 0, paint.WIDTH, paint.HEIGHT);
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, paint.WIDTH, paint.HEIGHT);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  const draw = (sh, color) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (sh.type === 'path') {
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
    </div>
    <div class="pt-choose"></div>
    <div class="pt-canvas-wrap"><canvas width="${paint.WIDTH}" height="${paint.HEIGHT}"></canvas><div class="pt-reveal"></div></div>
    <div class="pt-tools">
      <button class="btn small pt-tool" data-tool="pen">✎ ペン</button>
      <button class="btn small pt-tool" data-tool="line">／ 直線</button>
      <button class="btn small pt-tool" data-tool="circle">◯ 円</button>
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
  x.canvas.addEventListener('pointerdown', (e) => {
    if (!canDraw()) return;
    try { x.canvas.setPointerCapture(e.pointerId); } catch { /* 取れなくても描ける */ }
    const [px, py] = ptCanvasPoint(e);
    ptDrag = ptTool === 'pen' ? { type: 'path', pts: [[px, py]] } : { type: ptTool, x1: px, y1: py, x2: px, y2: py };
  });
  x.canvas.addEventListener('pointermove', (e) => {
    if (!ptDrag) return;
    const [px, py] = ptCanvasPoint(e);
    if (ptDrag.type === 'path') {
      const last = ptDrag.pts[ptDrag.pts.length - 1];
      if (Math.hypot(px - last[0], py - last[1]) >= 3) ptDrag.pts.push([px, py]); // 近すぎる点は省く
    } else [ptDrag.x2, ptDrag.y2] = [px, py];
    ptDrawShapes(x.ctx, view.state.shapes, ptDrag);
  });
  const finish = () => {
    if (!ptDrag) return;
    const sh = ptDrag;
    ptDrag = null;
    if (sh.type === 'path') {
      let pts = sh.pts;
      if (pts.length === 1) pts = [pts[0], [pts[0][0] + 1, pts[0][1]]]; // 点を打っただけのとき
      // 点が多すぎるときは間引く
      if (pts.length > paint.MAX_PATH_POINTS) {
        const step = pts.length / paint.MAX_PATH_POINTS;
        pts = Array.from({ length: paint.MAX_PATH_POINTS }, (_, i) => pts[Math.min(pts.length - 1, Math.round(i * step))]);
      }
      send({ type: 'move', move: { shape: { type: 'path', pts: pts.map(([px, py]) => [Math.round(px), Math.round(py)]) } } });
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
        b.onclick = () => send({ type: 'move', move: { pick: i } });
        pt.choose.append(b);
      });
    } else pt.choose.append(h('span', 'muted', `${name(s.painter)} さんがお題を選んでいます…`));
  }

  // 絵
  if (!ptDrag) ptDrawShapes(pt.ctx, s.shapes, null);
  pt.canvas.classList.toggle('drawing', s.phase === 'draw' && painter);
  pt.reveal.hidden = s.phase !== 'reveal';
  if (s.phase === 'reveal') pt.reveal.textContent = `答え：${s.theme}`;

  // 道具
  pt.tools.hidden = !(s.phase === 'draw' && painter);
  const free = s.options.mode === 'free';
  const modeKey = `${v.code}:${v.gameNo}`;
  if (pt.modeKey !== modeKey) { pt.modeKey = modeKey; ptTool = free ? 'pen' : 'line'; }
  if (!free && ptTool === 'pen') ptTool = 'line';
  pt.tools.querySelector('[data-tool="pen"]').hidden = !free;
  pt.tools.querySelector('.pt-help').textContent = ptTool === 'pen' ? 'ドラッグで自由に描く' : ptTool === 'line' ? 'ドラッグで描く（始点→終点）' : 'ドラッグで描く（中心→半径）';
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

const RENDERERS = { chess: renderChess, shogi: renderShogi, gobblet: renderGobblet, gomoku: renderGomoku, othello: renderOthello, wordbasket: renderWordBasket, catchoco: renderCatChoco, uno: renderUno, werewolf: renderWerewolf, ito: renderIto, daifugo: renderDaifugo, poker: renderPoker, blokus: renderBlokus, paint: renderPaint, skull: renderSkull };

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
  const url = `${location.origin}${location.pathname}#${view.code}`;
  try { await navigator.clipboard.writeText(url); toast('招待リンクをコピーしました'); }
  catch { await choose(`このリンクを相手に送ってください:\n${url}`, [['ok', '閉じる']]); }
};

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
