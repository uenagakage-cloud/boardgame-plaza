// 画面遷移・ロビー・ルーム UI とゲームの起動
import { PLAYER_COLORS, SETTING_DEFS, CHAT_STAMPS, TEAM_COLORS, TEAM_NAMES, sanitizeName } from '../shared/config.js';
import { Net } from './net.js';
import { Controls } from './controls.js';
import { RaceClient, escapeHtml } from './race-client.js';
import { BattleClient } from './battle-client.js';
import { getSprite } from './sprites.js';
import { serverHttpUrl } from './config.js';
import { unlockAudio, isMuted, setMuted, play } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- 保存データ ----------
function load(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

const me = {
  id: null,
  name: load('dino.name', ''),
  color: load('dino.color', PLAYER_COLORS[0]),
  pid: load('dino.pid', null),
};
if (!me.pid) {
  me.pid = crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  save('dino.pid', me.pid);
}

const net = new Net();
const controls = new Controls($('#controls'));
const state = {
  screen: 'title',
  room: null,
  game: null,
  gameMode: null,
  solo: false,
  createMode: 'race',
  pendingJoin: new URLSearchParams(location.search).get('room'),
  rankingPeriod: 'all',
};

const MODE_DESC = {
  race: '障害物をよけて走り続ける。妨害アイテムあり、最後の1人が勝ち！',
  battle: '攻撃は「ふみつけ」と「かむ」だけ。体がぶつかるとはじかれる。HP 0 か穴に落ちたら脱落、最後の1人が勝ち！'
};

// ---------- 画面切り替え ----------
function show(name) {
  state.screen = name;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  if (name === 'title') renderTitle();
}

// ゲーム中の通知はプレイ画面の外（専用の行）に 1 件ずつ出す
let feedTimer = 0;
function feed(message, kind) {
  const box = $('#feed-box');
  box.innerHTML = '';
  const el = document.createElement('div');
  el.className = `feed-msg ${kind}`;
  el.textContent = message;
  box.appendChild(el);
  clearTimeout(feedTimer);
  feedTimer = setTimeout(() => el.classList.add('fade'), 2500);
}

function toast(message, kind = '') {
  if (state.screen === 'game') {
    feed(message, kind);
    return;
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('fade'), 2200);
  setTimeout(() => el.remove(), 2700);
  const all = $('#toasts').children;
  if (all.length > 4) all[0].remove();
}

function openModal(id) {
  $(`#${id}`).classList.remove('hidden');
}
function closeModals() {
  $$('.modal').forEach((m) => m.classList.add('hidden'));
}

// ---------- タイトル ----------
let titleAnim = 0;
function renderTitle() {
  $('#name-input').value = me.name;
  $('#best-score').textContent = String(load('dino.hi', 0)).padStart(5, '0');
  $('#btn-mute').textContent = isMuted() ? '🔇' : '🔊';
  const picker = $('#color-picker');
  picker.innerHTML = PLAYER_COLORS.map(
    (c) => `<button style="background:${c}" data-color="${c}" class="${c === me.color ? 'on' : ''}" aria-label="色 ${c}"></button>`,
  ).join('');
  cancelAnimationFrame(titleAnim);
  const cv = $('#title-dino');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const loop = (t) => {
    if (state.screen !== 'title') return;
    ctx.clearRect(0, 0, 88, 88);
    const frame = Math.floor(t / 120) % 2 ? 'dino_run1' : 'dino_run2';
    ctx.drawImage(getSprite(frame, me.color), 0, 0, 88, 88);
    titleAnim = requestAnimationFrame(loop);
  };
  titleAnim = requestAnimationFrame(loop);
}

function commitName() {
  me.name = sanitizeName($('#name-input').value);
  save('dino.name', me.name);
  sendHello();
}

function sendHello() {
  net.send('hello', { name: me.name || 'ななし', color: me.color });
}

// ---------- マルチ メニュー ----------
function enterMulti() {
  commitName();
  show('multi');
  net.connect();
  updateNetStatus();
  net.send('listRooms');
}

function updateNetStatus() {
  const el = $('#net-status');
  el.textContent = net.connected ? '● 接続中' : '○ 接続待ち…';
  el.style.color = net.connected ? 'var(--good)' : 'var(--ink-soft)';
}

function renderRoomList(rooms) {
  const ul = $('#room-list');
  if (!rooms.length) {
    ul.innerHTML = '<li class="empty">公開ルームはまだありません</li>';
    return;
  }
  ul.innerHTML = rooms
    .map(
      (r) => `<li>
        <span class="tag">${r.mode === 'race' ? 'レース' : 'バトル'}</span>
        <span class="grow">${escapeHtml(r.host)} のルーム</span>
        <span>${r.count}/${r.max}</span>
        ${
          r.phase === 'lobby' && r.count < r.max
            ? `<button class="btn tiny" data-join="${r.code}">参加</button>`
            : `<span class="tag wait">${r.phase === 'lobby' ? '満員' : 'ゲーム中'}</span>`
        }
      </li>`,
    )
    .join('');
}

// ---------- ルーム ----------
function isHost() {
  return state.room && state.room.hostId === me.id;
}

function renderRoom() {
  const room = state.room;
  if (!room) return;
  const host = isHost();
  $('#room-code').textContent = room.code;
  $$('#room-mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === room.mode));
  $('#room-mode').classList.toggle('locked', !host);
  $('#mode-desc').textContent = MODE_DESC[room.mode];

  const defs = SETTING_DEFS[room.mode];
  const fmt = (v) => (v === true ? 'ON' : v === false ? 'OFF' : String(v));
  $('#room-settings').innerHTML =
    Object.entries(defs)
      .map(([key, def]) => {
        const val = room.settings[key];
        const control = host
          ? `<select data-setting="${key}">${def.options
              .map((o, i) => `<option value="${i}" ${o === val ? 'selected' : ''}>${fmt(o)}</option>`)
              .join('')}</select>`
          : `<b>${fmt(val)}</b>`;
        return `<span>${def.label}</span>${control}`;
      })
      .join('') +
    `<span>公開</span>${
      host ? `<select data-public><option value="1" ${room.isPublic ? 'selected' : ''}>公開</option><option value="0" ${room.isPublic ? '' : 'selected'}>非公開</option></select>` : `<b>${room.isPublic ? '公開' : '非公開'}</b>`
    }`;

  $('#room-count').textContent = `${room.players.length}/${room.settings.maxPlayers}`;
  const teamsOn = room.mode === 'battle' && room.settings.teams;
  $('#room-players').innerHTML = room.players
    .map((p) => {
      const status = p.id === room.hostId ? '<span class="tag">👑 ホスト</span>' : p.bot ? '<span class="tag">CPU</span>' : p.ready ? '<span class="tag ok">準備OK</span>' : '<span class="tag wait">待機中</span>';
      const kick = host && p.id !== me.id ? `<button class="btn tiny" data-remove="${p.id}">✕</button>` : '';
      // チーム戦：自分（ホストは CPU も）のチームは押すと切り替わる
      let team = '';
      if (teamsOn) {
        const label = TEAM_NAMES[p.team].replace('チーム', '');
        const style = `background:${TEAM_COLORS[p.team]};border-color:${TEAM_COLORS[p.team]};color:#fff`;
        team =
          p.id === me.id || (host && p.bot)
            ? `<button class="btn tiny team-btn" style="${style}" data-team-of="${p.id}" data-team="${1 - p.team}">${label} ⇄</button>`
            : `<span class="tag" style="${style}">${label}</span>`;
      }
      return `<li><span class="dot" style="background:${p.color}"></span><span class="grow">${escapeHtml(p.name)}${p.id === me.id ? '（あなた）' : ''}</span>${team}${status}${kick}</li>`;
    })
    .join('');

  $('#btn-addbot').classList.toggle('hidden', !host);
  $('#btn-addbot').disabled = room.players.length >= room.settings.maxPlayers;
  const mine = room.players.find((p) => p.id === me.id);
  $('#btn-ready').classList.toggle('hidden', host);
  $('#btn-ready').textContent = mine?.ready ? '準備OK ✓' : '準備OK';
  $('#btn-ready').classList.toggle('primary', !!mine?.ready);
  $('#btn-start').classList.toggle('hidden', !host);
  const allReady = room.players.every((p) => p.bot || p.ready || p.id === room.hostId);
  $('#btn-start').disabled = !allReady;
  $('#btn-start').textContent = allReady ? 'スタート' : '準備待ち…';
}

async function shareRoom() {
  const url = `${location.origin}${location.pathname}?room=${state.room.code}`;
  const text = `Dino Rush で遊ぼう！ルームコード: ${state.room.code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Dino Rush', text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('招待リンクをコピーしました', 'good');
  } catch {
    toast(`ルームコード: ${state.room.code}`);
  }
}

// ---------- ゲーム ----------
function prepareGameScreen(mode) {
  closeModals();
  $('#feed-box').innerHTML = '';
  $('#stamp-bar').classList.add('hidden');
  $('#solo-over').classList.add('hidden');
  const scr = $('#screen-game');
  scr.classList.remove('mode-race', 'mode-battle');
  scr.classList.add(`mode-${mode}`);
  show('game');
}

function stopGame() {
  state.game?.destroy();
  state.game = null;
  state.gameMode = null;
  clearInterval(state.pingTimer);
}

function startSolo() {
  commitName();
  unlockAudio();
  stopGame();
  prepareGameScreen('race');
  state.solo = true;
  state.gameMode = 'race';
  $('#ping').textContent = '';
  $('#btn-chat').classList.add('hidden');
  state.game = new RaceClient({
    canvas: $('#game-canvas'),
    hud: $('#game-hud'),
    controls,
    net: null,
    solo: true,
    myColor: me.color,
    countdown: 0,
    onSoloOver: onSoloOver,
    onToast: toast,
  });
}

async function onSoloOver(result) {
  const overlay = $('#solo-over');
  if (!result) {
    overlay.classList.add('hidden');
    return;
  }
  $('#solo-score').textContent = String(result.score).padStart(5, '0');
  $('#solo-rank').textContent = '';
  setTimeout(() => {
    if (state.game && !state.game.sim.alive) overlay.classList.remove('hidden');
  }, 700);
  if (result.score <= 0) return;
  $('#solo-rank').textContent = 'スコア送信中…';
  $('#solo-rank').textContent = await submitScore(result);
}

// レースのスコアをランキングに送る（ソロ・マルチ共通）。表示用のメッセージを返す
async function submitScore({ score, duration }) {
  try {
    const res = await fetch(serverHttpUrl('/api/score'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid: me.pid, name: me.name || 'ななし', score, duration }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'error');
    return data.best > score ? `自己ベスト ${data.best}（${data.rank}位）` : `🎉 ランキング ${data.rank}位！`;
  } catch {
    return 'スコアを送信できませんでした（オフライン？）';
  }
}

// マルチレース：自分のレースが終わった時点（脱落 or 優勝）のスコアを送る
let multiRank = null;
function onMultiScore(result) {
  if (result.score <= 0) return;
  multiRank = submitScore(result);
  multiRank.then((text) => {
    if (!$('#result-modal').classList.contains('hidden')) $('#result-rank').textContent = text;
  });
}

function startMultiGame(msg) {
  stopGame();
  prepareGameScreen(msg.mode);
  state.solo = false;
  state.gameMode = msg.mode;
  $('#btn-chat').classList.remove('hidden');
  const common = {
    canvas: $('#game-canvas'),
    hud: $('#game-hud'),
    controls,
    net,
    players: msg.players,
    myId: me.id,
    settings: msg.settings,
    countdown: msg.countdown,
    onToast: toast,
  };
  if (msg.mode === 'race') {
    const mine = msg.players.find((p) => p.id === me.id);
    multiRank = null;
    state.game = new RaceClient({ ...common, solo: false, seed: msg.seed, myColor: mine?.color || me.color, onMultiScore });
  } else {
    state.game = new BattleClient({ ...common, snapshot: msg.snapshot });
  }
  state.pingTimer = setInterval(() => ($('#ping').textContent = `${net.rtt}ms`), 1000);
}

function showResults(msg) {
  const list = $('#result-list');
  const teamMode = msg.winnerTeam === 0 || msg.winnerTeam === 1;
  const myTeam = msg.results.find((r) => r.id === me.id)?.team;
  const mineWon = teamMode ? myTeam === msg.winnerTeam : msg.winnerId === me.id;
  if (teamMode) $('#result-title').textContent = mineWon ? `🏆 勝利！（${TEAM_NAMES[msg.winnerTeam]}）` : `${TEAM_NAMES[msg.winnerTeam]}の勝ち`;
  else $('#result-title').textContent = mineWon ? '🏆 優勝！' : '結果';
  if (mineWon) play('win');
  list.innerHTML = msg.results
    .map((r) => {
      const detail = msg.mode === 'race' ? `${r.score}` : `${r.kos}KO / ${r.dmg}dmg`;
      const pos = teamMode ? `<span class="tag" style="background:${TEAM_COLORS[r.team]};border-color:${TEAM_COLORS[r.team]};color:#fff">${TEAM_NAMES[r.team].replace('チーム', '')}</span>` : r.place;
      return `<li class="${r.place === 1 ? 'win' : ''}">
        <span class="pos">${pos}</span><span class="dot" style="background:${r.color}"></span>
        <span class="grow">${escapeHtml(r.name)}${r.id === me.id ? '（あなた）' : ''}</span>
        <span class="score">${detail}</span></li>`;
    })
    .join('');
  // 最後まで生き残った人はここでレースを止めてスコアを送る
  if (msg.mode === 'race' && state.gameMode === 'race') state.game?.finish();
  $('#result-rank').textContent = '';
  multiRank?.then((text) => ($('#result-rank').textContent = text));
  openModal('result-modal');
}

function quitGame() {
  if (state.solo) {
    stopGame();
    show('title');
    return;
  }
  if (state.room && !confirm('ゲームをやめてルームから退出しますか？')) return;
  net.send('leaveRoom');
  stopGame();
  state.room = null;
  show('multi');
}

// ---------- チャット（スタンプ） ----------
function renderStamps() {
  const html = CHAT_STAMPS.map((t, i) => `<button class="btn stamp" data-stamp="${i}">${t}</button>`).join('');
  $$('[data-stamps]').forEach((el) => (el.innerHTML = html));
}

function onChat(m) {
  const text = CHAT_STAMPS[m.stamp];
  if (text === undefined) return;
  const log = $('#chat-log');
  log.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  li.innerHTML = `<span class="dot" style="background:${m.color}"></span><b>${escapeHtml(m.name)}</b><span class="chat-text">${text}</span>`;
  log.appendChild(li);
  while (log.children.length > 30) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  if (state.screen === 'game') {
    feed(`${m.name}：${text}`, 'chat');
    state.game?.onChat?.({ from: m.from, text });
  }
}

// ---------- ランキング ----------
async function openRanking() {
  openModal('ranking-modal');
  $$('#ranking-period button').forEach((b) => b.classList.toggle('on', b.dataset.period === state.rankingPeriod));
  const ol = $('#ranking-list');
  ol.innerHTML = '<li class="empty">読み込み中…</li>';
  try {
    const res = await fetch(serverHttpUrl(`/api/ranking?period=${state.rankingPeriod}&limit=50&pid=${encodeURIComponent(me.pid)}`));
    const data = await res.json();
    ol.innerHTML = data.rows.length
      ? data.rows
          .map(
            (r, i) => `<li class="${r.you ? 'you' : ''}"><span class="pos">${i + 1}</span>
              <span class="grow">${escapeHtml(r.name)}${r.you ? '（あなた）' : ''}</span>
              <span class="score">${String(r.score).padStart(5, '0')}</span></li>`,
          )
          .join('')
      : '<li class="empty">まだ記録がありません</li>';
  } catch {
    ol.innerHTML = '<li class="empty">ランキングを取得できませんでした</li>';
  }
}

// ---------- ネットワークイベント ----------
net.on('open', () => {
  updateNetStatus();
  sendHello();
});
net.on('welcome', (m) => {
  me.id = m.id;
  sendHello();
  net.send('listRooms');
  if (state.pendingJoin) {
    net.send('joinRoom', { code: state.pendingJoin.toUpperCase() });
    state.pendingJoin = null;
    history.replaceState(null, '', location.pathname);
  }
});
net.on('close', () => {
  updateNetStatus();
  if (state.room) {
    toast('接続が切れました。再接続しています…', 'danger');
    state.room = null;
    if (!state.solo) {
      stopGame();
      closeModals();
      if (state.screen !== 'title') show('multi');
    }
  }
});
net.on('roomList', (m) => renderRoomList(m.rooms));
net.on('roomState', (m) => {
  const first = !state.room || state.room.code !== m.room.code;
  if (first) $('#chat-log').innerHTML = '<li class="empty">スタンプを送ってみよう</li>';
  state.room = m.room;
  if (state.screen !== 'game') {
    if (first || state.screen !== 'room') show('room');
    renderRoom();
  }
});
net.on('leftRoom', () => {
  state.room = null;
  if (!state.solo) {
    stopGame();
    if (state.screen !== 'title') show('multi');
    net.send('listRooms');
  }
});
net.on('error', (m) => toast(m.message, 'danger'));
net.on('gameStart', (m) => startMultiGame(m));
net.on('race:players', (m) => state.gameMode === 'race' && state.game?.onPlayers(m.players));
net.on('race:attack', (m) => state.gameMode === 'race' && state.game?.onAttack(m));
net.on('race:itemUsed', (m) => state.gameMode === 'race' && state.game?.onItemUsed(m));
net.on('race:eliminated', (m) => state.gameMode === 'race' && state.game?.onEliminated(m));
net.on('battle:snapshot', (m) => state.gameMode === 'battle' && state.game?.onSnapshot(m.s));
net.on('battle:hit', (m) => state.gameMode === 'battle' && state.game?.onHit(m));
net.on('gameOver', (m) => showResults(m));
net.on('chat', onChat);

// ---------- UI イベント ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-act]');
  if (!t) return;
  unlockAudio();
  // マウスで押したボタンにフォーカスが残ると、Space / Enter でもう一度押されてしまうので外す
  if (t.tagName === 'BUTTON') t.blur();

  if (t.dataset.color) {
    me.color = t.dataset.color;
    save('dino.color', me.color);
    renderTitle();
    sendHello();
    return;
  }
  if (t.dataset.stamp !== undefined) {
    net.send('chat', { stamp: Number(t.dataset.stamp) });
    $('#stamp-bar').classList.add('hidden');
    return;
  }
  if (t.dataset.join) {
    net.send('joinRoom', { code: t.dataset.join });
    return;
  }
  if (t.dataset.teamOf) {
    net.send('setTeam', { id: t.dataset.teamOf, team: Number(t.dataset.team) });
    return;
  }
  if (t.dataset.remove) {
    net.send('removePlayer', { id: t.dataset.remove });
    return;
  }
  if (t.dataset.mode && t.closest('#create-mode')) {
    state.createMode = t.dataset.mode;
    $$('#create-mode button').forEach((b) => b.classList.toggle('on', b === t));
    return;
  }
  if (t.dataset.mode && t.closest('#room-mode')) {
    if (isHost()) net.send('updateRoom', { mode: t.dataset.mode });
    return;
  }
  if (t.dataset.period) {
    state.rankingPeriod = t.dataset.period;
    openRanking();
    return;
  }

  switch (t.dataset.act) {
    case 'solo':
      startSolo();
      break;
    case 'multi':
      enterMulti();
      break;
    case 'ranking':
      openRanking();
      break;
    case 'howto':
      openModal('howto-modal');
      break;
    case 'close-modal':
      closeModals();
      break;
    case 'mute':
      setMuted(!isMuted());
      renderTitle();
      break;
    case 'fullscreen':
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => toast('この端末では全画面にできません'));
      break;
    case 'back':
      show('title');
      break;
    case 'refresh':
      net.send('listRooms');
      break;
    case 'create':
      commitName();
      net.send('createRoom', { mode: state.createMode, isPublic: $('#create-public').checked });
      break;
    case 'join': {
      const code = $('#join-code').value.trim().toUpperCase();
      if (code.length === 4) net.send('joinRoom', { code });
      else toast('4文字のルームコードを入力してください');
      break;
    }
    case 'leave':
      net.send('leaveRoom');
      break;
    case 'share':
      shareRoom();
      break;
    case 'addbot':
      net.send('addBot');
      break;
    case 'ready': {
      const mine = state.room?.players.find((p) => p.id === me.id);
      net.send('setReady', { ready: !mine?.ready });
      break;
    }
    case 'start':
      net.send('startGame');
      break;
    case 'chat':
      $('#stamp-bar').classList.toggle('hidden');
      break;
    case 'quit':
      quitGame();
      break;
    case 'retry':
      $('#solo-over').classList.add('hidden');
      startSolo();
      break;
    case 'result-close':
      closeModals();
      stopGame();
      if (state.room) {
        show('room');
        renderRoom();
      } else show('multi');
      break;
    default:
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.setting && state.room) {
    const def = SETTING_DEFS[state.room.mode][t.dataset.setting];
    net.send('updateRoom', { settings: { [t.dataset.setting]: def.options[Number(t.value)] } });
  } else if (t.hasAttribute('data-public')) {
    net.send('updateRoom', { isPublic: t.value === '1' });
  }
});

$('#name-input').addEventListener('change', commitName);
$('#join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('[data-act="join"]').click();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
// iPhone のピンチ拡大・ゲーム中の文字選択を止める（タッチ操作が途中で途切れる原因になる）
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('selectstart', (e) => {
  if (state.screen === 'game') e.preventDefault();
});
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// URL に ?room=XXXX があれば自動で参加
renderStamps();
show('title');
if (state.pendingJoin) {
  $('#join-code').value = state.pendingJoin.toUpperCase();
  enterMulti();
}
