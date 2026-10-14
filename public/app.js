import * as chess from './games/chess.js';
import * as shogi from './games/shogi.js';
import * as gobblet from './games/gobblet.js';
import * as gomoku from './games/gomoku.js';
import * as othello from './games/othello.js';
import * as go from './games/go.js';
import * as backgammon from './games/backgammon.js';
import * as wordbasket from './games/wordbasket.js';
import * as catchoco from './games/catchoco.js';
import * as uno from './games/uno.js';
import * as werewolf from './games/werewolf.js';

const GAMES = { chess, shogi, gobblet, gomoku, othello, go, backgammon, wordbasket, catchoco, uno, werewolf };
const GAME_INFO = {
  chess: { icon: '♞', desc: '8×8の盤でキングを詰ませる西洋の定番。' },
  shogi: { icon: '☖', desc: '取った駒を使える日本の将棋。成り・持ち駒あり。' },
  gobblet: { icon: '◉', desc: '大きいコマで小さいコマをかぶせる三目並べ。' },
  gomoku: { icon: '⚫', desc: '15×15の盤で縦・横・斜めに5つ並べたら勝ち。' },
  othello: { icon: '◐', desc: '相手の石をはさんで裏返す。最後に多い方が勝ち。' },
  go: { icon: '◎', desc: '石で陣地を囲み合う。日本ルール・コミ6目半。' },
  backgammon: { icon: '⚄', desc: 'ダイスを振って駒を進め、先に全部上がった方が勝ち。' },
  wordbasket: { icon: '🧺', desc: '場の文字で始まり手札の文字で終わる言葉を早い者勝ちで。2〜6人。' },
  catchoco: { icon: '🐈‍⬛', desc: '手持ちのアイテムでピンチを切り抜ける大喜利。チーム戦・2〜6人。' },
  uno: { icon: '🃏', desc: '色か数字を合わせてカードを出し、先に手札をなくそう。2〜6人。' },
  werewolf: { icon: '🐺', desc: '夜は1回だけ。話し合いで人狼を見つけて処刑しよう。3〜6人。' },
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
      const key = `${m.code}:${m.gameNo}:${m.state ? m.state.history.length : -1}`;
      if (key !== selKey) { sel = null; selKey = key; }
      view = m;
      if (location.hash.slice(1) !== m.code) history.replaceState(null, '', '#' + m.code);
      render();
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
    const groups = [['2人で対戦', h('div', 'cards')], ['みんなで遊ぶ（2〜6人）', h('div', 'cards')]];
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
      if (key === 'go') {
        const label = h('label', 'option-toggle');
        const select = h('select', 'size-select');
        for (const n of go.SIZES) {
          const o = h('option', null, `${n}路盤`);
          o.value = String(n);
          select.append(o);
        }
        select.value = store.get('goSize', '19');
        select.onchange = () => store.set('goSize', select.value);
        label.append(h('span', null, '盤の大きさ'), select);
        card.append(label);
        getOptions = () => ({ size: Number(select.value) });
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
    return ['wait', `参加者 ${n}人。${v.minPlayers}人以上そろったら「ゲーム開始」を押してください。`];
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
  $('#room-title').textContent = g.title + (v.variant ? ` · ${v.variant}` : '') + (v.gameNo > 1 ? `（第${v.gameNo}局）` : '');
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
  if (v.you >= 0 && !v.ready && v.multi) {
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
      const resign = h('button', 'btn danger', '投了');
      resign.disabled = !!(v.multi && s.out && s.out[v.you]);
      resign.onclick = async () => { if (await choose('本当に投了しますか？', [['yes', '投了する'], [null, 'キャンセル']])) send({ type: 'resign' }); };
      ctl.append(resign);
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

  // 棋譜
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
  v.seats.forEach((p, i) => {
    if (!p) return;
    const li = h('li', null, p.name);
    if (i === v.you) li.append(' ', h('span', 'you-tag', 'あなた'));
    li.append(h('span', 'dot ' + (p.online ? 'on' : 'off')));
    ul.append(li);
  });
  box.append(ul, h('p', 'muted small', '招待リンクを送って友だちを呼びましょう。開始後に入った人は観戦になります。'));
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

// ---------- 囲碁 ----------
function renderGo(el, v, act) {
  const s = v.state, N = s.size;
  const scoring = s.phase === 'scoring' && !s.result;
  const owner = s.phase !== 'play' ? go.territory(s).owner : null;
  const dead = new Set(s.dead.map(([r, c]) => r * N + c));
  const stars = go.starPoints(N);
  const board = h('div', 'board go-board' + (act ? ' active' : '') + (act && !scoring ? ` turn${v.you}` : ''));
  board.style.setProperty('--n', N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const here = [r, c], stone = s.board[r][c];
    const cell = h('div', 'sq');
    if (stars.some((p) => eq(p, here))) cell.append(h('span', 'star'));
    if (stone !== null) {
      const st = h('span', 'stone s' + stone);
      if (s.lastMove && eq(s.lastMove.to, here)) st.classList.add('last');
      if (dead.has(r * N + c)) st.classList.add('dead');
      cell.append(st);
      if (act && scoring) cell.onclick = () => sendMove({ toggle: here });
    } else if (act && !scoring) {
      cell.classList.add('empty');
      cell.onclick = () => sendMove({ to: here });
    }
    const t = owner && owner[r][c];
    if (t === 0 || t === 1) cell.append(h('span', 'terr t' + t));
    if (c === 0) cell.append(h('span', 'coord rank', String(N - r)));
    if (r === N - 1) cell.append(h('span', 'coord file', 'ABCDEFGHJKLMNOPQRST'[c]));
    board.append(cell);
  }
  board.append(gomokuLines(N));

  const tools = h('div', 'go-tools');
  if (s.phase === 'play' && act) {
    const pass = h('button', 'btn', 'パス');
    pass.onclick = () => sendMove({ pass: true });
    tools.append(pass);
  }
  if (scoring) {
    const [b, w] = go.score(s);
    tools.append(h('span', 'go-score', `黒 ${b}目 ／ 白 ${w}目（コミ${go.KOMI}込み）`));
    if (v.you >= 0) {
      const ok = h('button', 'btn primary', s.agreed[v.you] ? '合意済み' : '合意');
      ok.disabled = s.agreed[v.you];
      ok.onclick = () => sendMove({ accept: true });
      const resume = h('button', 'btn', '対局再開');
      resume.onclick = () => sendMove({ resume: true });
      tools.append(ok, resume);
    }
  }
  const wrap = h('div', 'go-wrap');
  wrap.append(board);
  if (tools.childElementCount) wrap.append(tools);
  el.replaceChildren(wrap);
}

// ---------- バックギャモン ----------
const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function renderBackgammon(el, v, act) {
  const s = v.state, me = v.you === 1 ? 1 : 0;
  const steps = act ? backgammon.legalSteps(s) : [];
  const isFrom = (x) => steps.some((st) => st.from === x);
  const targets = sel ? steps.filter((st) => st.from === sel.from).map((st) => st.to) : [];
  const click = (x) => {
    if (sel && targets.includes(x)) { sendMove({ from: sel.from, to: x }); return; }
    sel = isFrom(x) && !(sel && sel.from === x) ? { from: x } : null;
    render();
  };
  const checkers = (box, owner, n) => {
    const shown = Math.min(n, 5);
    for (let k = 0; k < shown; k++) {
      const ck = h('span', 'ck c' + owner);
      if (k === shown - 1 && n > 5) ck.textContent = String(n);
      box.append(ck);
    }
  };
  // プレイヤー0が下なら上段 13→24、下段 12→1。プレイヤー1が下なら上下を入れ替える
  const topRow = [13, 14, 15, 16, 17, 18, 'bar', 19, 20, 21, 22, 23, 24];
  const bottomRow = [12, 11, 10, 9, 8, 7, 'bar', 6, 5, 4, 3, 2, 1];
  const rows = me === 0 ? [topRow, bottomRow] : [bottomRow, topRow];
  const board = h('div', 'board bg-board' + (act ? ' active' : ''));
  rows.forEach((row, ri) => {
    const half = ri === 0 ? 'top' : 'bottom';
    const barOwner = ri === 0 ? 1 - me : me;
    for (const x of row) {
      if (x === 'bar') {
        const bar = h('div', `bg-bar ${half}`);
        checkers(bar, barOwner, s.bar[barOwner]);
        if (barOwner === me) {
          if (isFrom('bar')) bar.classList.add('movable');
          if (sel && sel.from === 'bar') bar.classList.add('sel');
          bar.onclick = () => click('bar');
        }
        board.append(bar);
        continue;
      }
      const v0 = s.pts[x], owner = v0 > 0 ? 0 : 1, n = Math.abs(v0);
      const pt = h('div', `pt ${half} ${x % 2 ? 'odd' : 'even'}`);
      const stack = h('div', 'stack');
      if (n) checkers(stack, owner, n);
      pt.append(stack, h('span', 'pt-num', String(me === 0 ? x : 25 - x)));
      if (isFrom(x)) pt.classList.add('movable');
      if (sel && sel.from === x) pt.classList.add('sel');
      if (targets.includes(x)) pt.classList.add('target');
      if (s.lastMove && (s.lastMove.to === x || s.lastMove.from === x)) pt.classList.add('last');
      pt.onclick = () => click(x);
      board.append(pt);
    }
    const offOwner = ri === 0 ? 1 - me : me;
    const off = h('div', `bg-off ${half}`);
    off.append(h('span', 'off-count', `上がり ${s.off[offOwner]}`));
    const tray = h('div', 'off-tray');
    for (let k = 0; k < s.off[offOwner]; k++) tray.append(h('span', 'off-ck c' + offOwner));
    off.append(tray);
    if (offOwner === me && targets.includes('off')) {
      off.classList.add('target');
      off.onclick = () => click('off');
    }
    board.append(off);
  });

  const tools = h('div', 'bg-tools');
  if (s.rolled) {
    const dice = h('div', 'dice' + (s.rolled.by === me ? ' mine' : ''));
    // まだ使っていない目を濃く、使った目を薄く表示
    const left = s.phase === 'move' && s.rolled.by === s.turn ? s.dice.slice() : [];
    for (const d of s.rolled.dice) {
      const i = left.indexOf(d);
      if (i >= 0) left.splice(i, 1);
      dice.append(h('span', 'die c' + s.rolled.by + (i < 0 ? ' used' : ''), DIE_FACES[d]));
    }
    tools.append(dice);
  }
  if (act && s.phase === 'roll') {
    const roll = h('button', 'btn primary', 'ダイスを振る');
    roll.onclick = () => send({ type: 'move', move: { roll: true } });
    tools.append(roll);
  }
  const wrap = h('div', 'bg-wrap');
  wrap.append(board, tools);
  el.replaceChildren(wrap);
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

const RENDERERS = { chess: renderChess, shogi: renderShogi, gobblet: renderGobblet, gomoku: renderGomoku, othello: renderOthello, go: renderGo, backgammon: renderBackgammon, wordbasket: renderWordBasket, catchoco: renderCatChoco, uno: renderUno, werewolf: renderWerewolf };

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
