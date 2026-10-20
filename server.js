import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as chess from './public/games/chess.js';
import * as shogi from './public/games/shogi.js';
import * as gobblet from './public/games/gobblet.js';
import * as gomoku from './public/games/gomoku.js';
import * as othello from './public/games/othello.js';
import * as wordbasket from './public/games/wordbasket.js';
import * as catchoco from './public/games/catchoco.js';
import * as uno from './public/games/uno.js';
import * as werewolf from './public/games/werewolf.js';
import * as ito from './public/games/ito.js';
import * as daifugo from './public/games/daifugo.js';
import * as poker from './public/games/poker.js';
import * as blokus from './public/games/blokus.js';
import * as paint from './public/games/paint.js';
import * as skull from './public/games/skull.js';
import * as gungi from './public/games/gungi.js';
import * as towerbattle from './public/games/towerbattle.js';
import { simulate as towerPhysics } from './lib/towerbattle-physics.js';

const GAMES = { chess, shogi, gobblet, gomoku, othello, wordbasket, catchoco, uno, werewolf, ito, daifugo, poker, blokus, paint, skull, gungi, towerbattle };
const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const ROOM_TTL_MS = 30 * 60 * 1000; // 誰もいない部屋を消すまでの時間
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

// ---------- お絵かきの履歴（みんなでポンコツペイント） ----------
// 答え発表になった絵を保存して、ロビーやゲーム中に見られるようにする。2日より前のものは消す
const GALLERY_FILE = process.env.GALLERY_FILE || path.join(ROOT, 'data', 'paint-gallery.json');
const GALLERY_KEEP_MS = 2 * 24 * 60 * 60 * 1000;
const GALLERY_MAX_POINTS = 1_000_000; // 全部の絵の点の数の上限（大きくなりすぎないように、古いものから消す）
let gallery = [];
try { gallery = JSON.parse(await readFile(GALLERY_FILE, 'utf8')); } catch { gallery = []; }
const artPoints = (e) => e.shapes.reduce((a, x) => a + (x.pts ? x.pts.length : 2), 0);

function pruneGallery() {
  const limit = Date.now() - GALLERY_KEEP_MS;
  const before = gallery.length;
  gallery = gallery.filter((e) => e.at >= limit);
  let total = gallery.reduce((a, e) => a + artPoints(e), 0);
  while (gallery.length && total > GALLERY_MAX_POINTS) total -= artPoints(gallery.shift());
  return gallery.length !== before;
}

let gallerySaveTimer = null;
function saveGallery() {
  if (gallerySaveTimer) return;
  gallerySaveTimer = setTimeout(async () => {
    gallerySaveTimer = null;
    try {
      await mkdir(path.dirname(GALLERY_FILE), { recursive: true });
      await writeFile(GALLERY_FILE, JSON.stringify(gallery));
    } catch (e) {
      console.error('お絵かきの履歴を保存できませんでした', e);
    }
  }, 2000);
}
if (pruneGallery()) saveGallery();
setInterval(() => { if (pruneGallery()) saveGallery(); }, 60 * 60 * 1000).unref();

// 部屋の状態が「答え発表」になったら絵を履歴に入れる（同じラウンドは1回だけ）
function archiveArt(room) {
  const g = GAMES[room.game];
  if (!g.archive || !room.state) return;
  const a = g.archive(room.state);
  if (!a) return;
  const key = `${room.gameNo}:${a.key}`;
  if (room.archivedKey === key) return;
  room.archivedKey = key;
  const nameOf = (seat) => room.seats[seat]?.name || '?';
  gallery.push({
    id: crypto.randomUUID(), at: Date.now(), theme: a.theme, tag: a.tag, mode: a.mode, shapes: a.shapes,
    painter: nameOf(a.painter), correct: a.correct.map(nameOf), guessers: a.guessers,
  });
  pruneGallery();
  saveGallery();
}

function sendGallery(req, res) {
  const url = new URL(req.url, 'http://x');
  const before = Number(url.searchParams.get('before')) || Infinity;
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit')) || 12));
  pruneGallery();
  const older = gallery.filter((e) => e.at < before).reverse();
  const body = JSON.stringify({ items: older.slice(0, limit), more: older.length > limit, keepHours: GALLERY_KEEP_MS / 3600000 });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
}

// ---------- 静的ファイル ----------
// 回線が弱くても読み込みやすいよう、文字のファイルは gzip で小さくして送る。
// 中身が変わっていなければ 304（もう持っているものを使う）を返す。圧縮した結果はメモリに置いておく
const staticCache = new Map();
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.txt', '.json']);

async function loadStatic(file) {
  const st = await stat(file);
  if (!st.isFile()) throw new Error('not a file');
  const hit = staticCache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
  const raw = await readFile(file);
  const entry = {
    mtimeMs: st.mtimeMs, size: st.size, raw,
    etag: `"${crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 20)}"`,
    gz: COMPRESSIBLE.has(path.extname(file)) && raw.length > 1024 ? gzipSync(raw, { level: 9 }) : null,
  };
  staticCache.set(file, entry);
  return entry;
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { pathname = '/'; }
  if (pathname === '/api/paint-gallery') { sendGallery(req, res); return; }
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const e = await loadStatic(file);
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: e.etag, Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === e.etag) { res.writeHead(304, headers).end(); return; }
    const gzip = e.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (gzip) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(gzip ? e.gz : e.raw);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

// ---------- 部屋 ----------
const rooms = new Map();
const clients = new Set();

class UserError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 5 }, () => A[crypto.randomInt(A.length)]).join('');
  while (rooms.has(code));
  return code;
}

const cleanName = (n) => String(n || '').trim().slice(0, 16) || '名無し';
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const seatOf = (room, ws) => room.seats.findIndex((s) => s && s.clientId === ws.clientId);
// CPU の席はいつも接続中として扱う
const isOnline = (room, clientId) => String(clientId).startsWith('cpu:') || [...room.sockets].some((ws) => ws.clientId === clientId);

const variantOf = (room) => GAMES[room.game].variantName?.(room.options) || '';
// 3人以上で遊ぶゲームは「ゲーム開始」を押すまで state が null
const isMulti = (g) => (g.maxPlayers || 2) > 2;
const isReady = (room) => (isMulti(GAMES[room.game]) ? !!room.state : room.seats.every(Boolean));
// サーバー側の乱数: rng(n) は 1〜n（省略時はサイコロの 1〜6）
const rng = (n = 6) => crypto.randomInt(1, n + 1);

// ホスト: 部屋を作った人。いなくなったら接続中の席の人に引き継ぐ
function hostSeat(room) {
  let seat = room.seats.findIndex((s) => s && s.clientId === room.host);
  if (seat < 0 || !isOnline(room, room.host)) {
    const next = room.seats.findIndex((s) => s && isOnline(room, s.clientId));
    if (next >= 0) {
      if (seat >= 0 || room.host) systemChat(room, `${room.seats[next].name} さんがホストになりました`);
      room.host = room.seats[next].clientId;
      seat = next;
    }
  }
  return seat;
}

// ゲームに渡す部屋の情報（ホストの席・接続中かどうか）
const gameContext = (room) => ({
  hostSeat: hostSeat(room),
  online: room.seats.map((s) => !!s && isOnline(room, s.clientId)),
  physics: towerPhysics, // どうぶつタワーバトルの物理（サーバーだけで計算する）
});

// state.tickAfter（ミリ秒後）か state.tickAt（その時刻）にゲームの tick() を呼ぶ（ito の答え合わせ・制限時間など）
function scheduleTick(room) {
  if (room.tickFor === room.state) return;
  clearTimeout(room.tickTimer);
  room.tickTimer = null;
  room.tickFor = room.state;
  const g = GAMES[room.game];
  if (!room.state || !(room.state.tickAfter || room.state.tickAt) || !g.tick) return;
  const delay = room.state.tickAt ? Math.max(0, room.state.tickAt - Date.now()) : room.state.tickAfter;
  room.tickTimer = setTimeout(() => {
    if (!rooms.has(room.code) || !room.state) return;
    try {
      room.state = g.tick(room.state, rng, gameContext(room));
    } catch (e) {
      console.error('tick でエラー', e);
      return;
    }
    broadcastRoom(room);
  }, delay);
}

// CPU の番なら少し待ってから CPU に指させる（ゲームが aiMove を持っている場合）
function scheduleBot(room) {
  const g = GAMES[room.game];
  if (!g.aiMove || !room.state || room.state.result || room.botFor === room.state) return;
  const seat = room.state.turn;
  if (!room.seats[seat] || !room.seats[seat].bot) return;
  room.botFor = room.state;
  setTimeout(() => {
    if (!rooms.has(room.code) || room.botFor !== room.state || room.state.result) return;
    try {
      const move = g.aiMove(room.state, seat, rng);
      if (move) room.state = g.applyMove(room.state, move, seat, rng, gameContext(room));
    } catch (e) {
      console.error('CPU の手でエラー', e);
      return;
    }
    broadcastRoom(room);
    if (room.state.result) broadcastLobby();
  }, 700);
}

function deleteRoom(room) {
  clearTimeout(room.tickTimer);
  rooms.delete(room.code);
}

function roomView(room, ws) {
  const you = seatOf(room, ws);
  const g = GAMES[room.game];
  return {
    type: 'room',
    code: room.code,
    game: room.game,
    multi: isMulti(g),
    serverTime: Date.now(),
    minPlayers: g.minPlayers || 2,
    ready: isReady(room),
    hostSeat: hostSeat(room),
    options: room.options,
    variant: variantOf(room),
    gameNo: room.gameNo,
    you,
    seats: room.seats.map((s) => s && { name: s.name, online: isOnline(room, s.clientId), bot: !!s.bot, kicked: !!s.kicked }),
    spectators: [...room.sockets].filter((w) => seatOf(room, w) < 0).length,
    // 手札など相手に見せない情報はゲームごとに隠す
    state: room.state && g.viewFor ? g.viewFor(room.state, you) : room.state,
    drawOffer: room.drawOffer,
    rematch: room.rematch,
    review: reviewView(room),
    chat: room.chat.slice(-60),
  };
}

function lobbyList() {
  return [...rooms.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map((r) => ({
      code: r.code,
      game: r.game,
      variant: variantOf(r),
      multi: isMulti(GAMES[r.game]),
      players: r.seats.map((s) => s && s.name),
      status: !isReady(r) ? 'waiting' : r.state.result ? 'finished' : 'playing',
    }));
}

function broadcastRoom(room) {
  room.lastActive = Date.now();
  archiveArt(room);
  scheduleTick(room);
  scheduleBot(room);
  for (const ws of room.sockets) send(ws, roomView(room, ws));
}

function broadcastLobby() {
  const msg = { type: 'lobby', rooms: lobbyList(), online: clients.size };
  for (const ws of clients) if (!ws.room) send(ws, msg);
}

function systemChat(room, text) {
  room.chat.push({ id: (room.chatSeq = (room.chatSeq || 0) + 1), system: true, text, t: Date.now() });
  if (room.chat.length > 100) room.chat.shift();
}

function enterRoom(ws, room) {
  ws.room = room;
  room.sockets.add(ws);
  broadcastRoom(room);
  broadcastLobby();
}

function leaveRoom(ws, explicit) {
  const room = ws.room;
  if (!room) return;
  room.sockets.delete(ws);
  ws.room = null;
  const seat = seatOf(room, ws);
  // 対局開始前に自分から抜けた場合は席を空ける
  if (explicit && seat >= 0 && !isReady(room)) room.seats[seat] = null;
  if (!room.seats.some(Boolean) && room.sockets.size === 0) deleteRoom(room);
  else broadcastRoom(room);
  broadcastLobby();
}

function requireRoom(ws) {
  if (!ws.room) throw new UserError('部屋に入っていません');
  return ws.room;
}

function requirePlayer(ws) {
  const room = requireRoom(ws);
  const seat = seatOf(room, ws);
  if (seat < 0) throw new UserError('観戦中は操作できません');
  return { room, seat };
}

// ---------- 感想戦（チェス・将棋） ----------
// 対局の手を room.moveLog に残しておき、終局後に好きな局面へ戻したり、別の手（変化）を試したりできる。
// room.review = { ply: 本譜の何手目まで進めたか, branch: その局面から試した手 }。部屋の全員で同じ盤を見る
const REVIEW_MAX_BRANCH = 200;

function reviewState(room) {
  const g = GAMES[room.game];
  const key = JSON.stringify([room.gameNo, room.review.ply, room.review.branch.length]);
  if (room.reviewCache && room.reviewCache.key === key) return room.reviewCache.state;
  let s = g.init(room.options);
  for (const mv of room.moveLog.slice(0, room.review.ply)) s = g.applyMove(s, mv, s.turn);
  for (const mv of room.review.branch) s = g.applyMove(s, mv, s.turn);
  room.reviewCache = { key, state: s };
  return s;
}

function reviewView(room) {
  if (!room.review) return null;
  return { ply: room.review.ply, total: room.moveLog.length, branch: room.review.branch.length, state: reviewState(room) };
}

function handleReview(room, msg) {
  const g = GAMES[room.game];
  if (!g.reviewable || !room.state || !room.state.result) throw new UserError('感想戦は対局が終わってからできます');
  const total = room.moveLog.length;
  if (msg.action === 'start') { room.review = room.review || { ply: total, branch: [] }; return; }
  if (!room.review) throw new UserError('感想戦は始まっていません');
  if (msg.action === 'end') { room.review = null; room.reviewCache = null; return; }
  if (msg.action === 'goto') {
    // 本譜の好きな手数へ（変化は消える）
    room.review = { ply: Math.max(0, Math.min(total, Math.round(Number(msg.ply) || 0))), branch: [] };
    return;
  }
  if (msg.action === 'back') {
    // 1手戻る（変化中なら変化を1手戻す）
    if (room.review.branch.length) room.review = { ...room.review, branch: room.review.branch.slice(0, -1) };
    else room.review = { ply: Math.max(0, room.review.ply - 1), branch: [] };
    return;
  }
  if (msg.move) {
    const s = reviewState(room);
    if (s.result) throw new UserError('この局面は終局しています');
    if (room.review.branch.length >= REVIEW_MAX_BRANCH) throw new UserError('変化が長すぎます');
    g.applyMove(s, msg.move, s.turn); // 指せない手ならここでエラー
    const mv = JSON.parse(JSON.stringify(msg.move));
    // 本譜と同じ手なら本譜を1手進めるだけにする
    const main = room.moveLog[room.review.ply];
    if (!room.review.branch.length && main && JSON.stringify(main) === JSON.stringify(mv)) room.review = { ply: room.review.ply + 1, branch: [] };
    else room.review = { ...room.review, branch: [...room.review.branch, mv] };
    return;
  }
  throw new UserError('不明な操作です');
}

function finish(room, result) {
  room.state = { ...room.state, result };
  room.drawOffer = null;
}

function handle(ws, msg) {
  if (msg.type !== 'hello' && !ws.clientId) throw new UserError('接続の初期化が済んでいません');
  switch (msg.type) {
    case 'hello': {
      ws.clientId = String(msg.clientId || '').slice(0, 64) || crypto.randomUUID();
      ws.name = cleanName(msg.name);
      send(ws, { type: 'lobby', rooms: lobbyList(), online: clients.size });
      return;
    }
    case 'setName': {
      ws.name = cleanName(msg.name);
      const room = ws.room;
      if (room) {
        const seat = seatOf(room, ws);
        if (seat >= 0) { room.seats[seat].name = ws.name; broadcastRoom(room); }
      }
      return;
    }
    case 'list':
      send(ws, { type: 'lobby', rooms: lobbyList(), online: clients.size });
      return;
    case 'create': {
      const g = GAMES[msg.game];
      if (!g) throw new UserError('不明なゲームです');
      leaveRoom(ws, true);
      const options = g.normalizeOptions ? g.normalizeOptions(msg.options) : {};
      const multi = isMulti(g);
      const room = {
        code: newCode(), game: msg.game, gameNo: 1, options, moveLog: [], review: null,
        seats: Array(g.maxPlayers || 2).fill(null), sockets: new Set(),
        state: multi ? null : g.init(options), drawOffer: null, rematch: [false, false], chat: [],
        createdAt: Date.now(), lastActive: Date.now(), host: ws.clientId,
      };
      const seat = multi ? 0 : msg.side === 0 || msg.side === 1 ? msg.side : crypto.randomInt(2);
      room.seats[seat] = { clientId: ws.clientId, name: ws.name };
      // CPU 対戦: もう一方の席に CPU を座らせる
      if (options.cpu && !multi && g.aiMove) room.seats[1 - seat] = { clientId: 'cpu:' + room.code, name: 'CPU', bot: true };
      systemChat(room, `${ws.name} さんが部屋を作りました`);
      rooms.set(room.code, room);
      enterRoom(ws, room);
      return;
    }
    case 'join': {
      const room = rooms.get(String(msg.code || '').trim().toUpperCase());
      if (!room) throw new UserError('部屋が見つかりません', 'NO_ROOM');
      if (room.banned && room.banned.has(ws.clientId)) throw new UserError('この部屋からは外されています', 'NO_ROOM');
      if (ws.room === room) {
        if (seatOf(room, ws) < 0 && !msg.spectate && !isReady(room)) {
          const free = room.seats.findIndex((s) => !s);
          if (free >= 0) {
            room.seats[free] = { clientId: ws.clientId, name: ws.name };
            systemChat(room, `${ws.name} さんが参加しました`);
            broadcastRoom(room);
            broadcastLobby();
            return;
          }
        }
        send(ws, roomView(room, ws));
        return;
      }
      leaveRoom(ws, true);
      const seat = seatOf(room, ws);
      if (seat >= 0) {
        room.seats[seat].name = ws.name;
      } else if (!msg.spectate && !isReady(room)) {
        const free = room.seats.findIndex((s) => !s);
        if (free >= 0) {
          room.seats[free] = { clientId: ws.clientId, name: ws.name };
          systemChat(room, isMulti(GAMES[room.game]) ? `${ws.name} さんが参加しました` : `${ws.name} さんが参加しました。対局開始！`);
        }
      }
      enterRoom(ws, room);
      return;
    }
    case 'leave':
      leaveRoom(ws, true);
      send(ws, { type: 'left' });
      send(ws, { type: 'lobby', rooms: lobbyList(), online: clients.size });
      return;
    case 'start': {
      const { room, seat } = requirePlayer(ws);
      const g = GAMES[room.game];
      if (!isMulti(g) || isReady(room)) return;
      if (seat !== hostSeat(room)) throw new UserError('ホストだけが開始できます');
      const players = room.seats.filter(Boolean);
      if (players.length < (g.minPlayers || 2)) throw new UserError(`${g.minPlayers || 2}人以上で開始できます`);
      room.seats = players; // 空席を詰める。開始後に来た人は観戦
      room.state = g.init(room.options, players.length, rng, gameContext(room));
      room.rematch = players.map(() => false);
      systemChat(room, `${players.length}人でゲームを開始します`);
      broadcastRoom(room);
      broadcastLobby();
      return;
    }
    case 'move': {
      const { room, seat } = requirePlayer(ws);
      if (!isReady(room)) throw new UserError('対戦相手を待っています');
      if (room.state.result) throw new UserError('対局は終了しています');
      const g = GAMES[room.game];
      if (room.state.turn !== seat && !g.canActOutOfTurn?.(room.state)) throw new UserError('相手の手番です');
      room.state = g.applyMove(room.state, msg.move, seat, rng, gameContext(room));
      if (g.reviewable) room.moveLog.push(JSON.parse(JSON.stringify(msg.move)));
      room.drawOffer = null;
      broadcastRoom(room);
      if (room.state.result) broadcastLobby();
      return;
    }
    case 'resign': {
      const { room, seat } = requirePlayer(ws);
      if (!isReady(room) || room.state.result) return;
      const g = GAMES[room.game];
      if (isMulti(g)) room.state = g.applyMove(room.state, { resign: true }, seat, rng, gameContext(room));
      else finish(room, { winner: 1 - seat, reason: '投了' });
      broadcastRoom(room);
      broadcastLobby();
      return;
    }
    case 'offerDraw': {
      const { room, seat } = requirePlayer(ws);
      if (!isReady(room) || room.state.result || isMulti(GAMES[room.game])) return;
      room.drawOffer = seat;
      if (room.seats[1 - seat]?.bot) {
        room.drawOffer = null;
        systemChat(room, 'CPU は引き分けの提案を断りました');
      }
      broadcastRoom(room);
      return;
    }
    case 'acceptDraw': {
      const { room, seat } = requirePlayer(ws);
      if (!isReady(room) || room.state.result || room.drawOffer !== 1 - seat) return;
      finish(room, { winner: null, reason: '合意' });
      broadcastRoom(room);
      broadcastLobby();
      return;
    }
    case 'declineDraw': {
      const { room, seat } = requirePlayer(ws);
      if (room.drawOffer === 1 - seat) { room.drawOffer = null; broadcastRoom(room); }
      return;
    }
    case 'rematch': {
      const { room, seat } = requirePlayer(ws);
      if (!room.state || !room.state.result) throw new UserError('対局はまだ終わっていません');
      room.rematch[seat] = true;
      room.seats.forEach((p, i) => { if (p && (p.bot || p.kicked)) room.rematch[i] = true; }); // CPU・外された人は待たない
      if (room.rematch.every(Boolean)) {
        const g = GAMES[room.game];
        // 多人数: 外された人の席は外して、残りの人で始める
        if (isMulti(g)) {
          const keep = room.seats.filter((p) => p && !p.kicked);
          if (keep.length < (g.minPlayers || 2)) throw new UserError(`${g.minPlayers || 2}人以上いないと始められません`);
          room.seats = keep;
        }
        room.seats.push(room.seats.shift()); // 先後（席順）を回す
        room.state = GAMES[room.game].init(room.options, room.seats.length, rng, gameContext(room));
        room.rematch = room.seats.map(() => false);
        room.drawOffer = null;
        room.moveLog = [];
        room.review = null;
        room.gameNo++;
        systemChat(room, `第${room.gameNo}局を開始します（先後入れ替え）`);
        broadcastLobby();
      }
      broadcastRoom(room);
      return;
    }
    case 'setOptions': {
      // 開始前にホストが設定を変える（ito のカード枚数・ジャンルなど）
      const { room, seat } = requirePlayer(ws);
      const g = GAMES[room.game];
      if (!isMulti(g) || isReady(room) || !g.normalizeOptions) return;
      if (seat !== hostSeat(room)) throw new UserError('ホストだけが設定を変えられます');
      room.options = g.normalizeOptions(msg.options);
      broadcastRoom(room);
      broadcastLobby();
      return;
    }
    case 'kick': {
      const { room, seat } = requirePlayer(ws);
      const g = GAMES[room.game];
      const target = Number(msg.seat);
      if (seat !== hostSeat(room)) throw new UserError('ホストだけが追い出せます');
      const t = room.seats[target];
      if (target === seat || !t || t.bot || t.kicked) return;
      (room.banned = room.banned || new Set()).add(t.clientId);
      if (!isMulti(g)) {
        // 2人用: 席を空けて、新しい相手を待つ（対局は最初から）
        room.seats[target] = null;
        room.state = g.init(room.options);
        room.rematch = [false, false];
        room.drawOffer = null;
        room.moveLog = [];
        room.review = null;
        room.gameNo++;
        systemChat(room, `${t.name} さんが外されました。新しい対戦相手を待っています`);
      } else if (isReady(room)) {
        if (!room.state.result) room.state = g.applyMove(room.state, { resign: true }, target, rng, gameContext(room));
        room.seats[target] = { clientId: 'kicked:' + crypto.randomUUID(), name: t.name, kicked: true };
        if (room.rematch) room.rematch[target] = true; // いない人のせいで「もう一度遊ぶ」が止まらないように
        systemChat(room, `${t.name} さんが外されました`);
      } else {
        room.seats[target] = null;
        systemChat(room, `${t.name} さんが外されました`);
      }
      for (const w of [...room.sockets]) {
        if (w.clientId !== t.clientId) continue;
        room.sockets.delete(w);
        w.room = null;
        send(w, { type: 'kicked' });
        send(w, { type: 'left' });
        send(w, { type: 'lobby', rooms: lobbyList(), online: clients.size });
      }
      broadcastRoom(room);
      broadcastLobby();
      return;
    }
    case 'backToLobby': {
      // ホストが開始前の待合室に戻す。切断中・外された人は席から外す
      const { room, seat } = requirePlayer(ws);
      const g = GAMES[room.game];
      if (!g.lobbyReturn || !isReady(room) || seat !== hostSeat(room)) return;
      const keep = room.seats.filter((s) => s && !s.kicked && isOnline(room, s.clientId));
      room.seats = [...keep, ...Array(Math.max(0, (g.maxPlayers || 2) - keep.length)).fill(null)];
      room.state = null;
      room.rematch = [];
      room.gameNo++;
      systemChat(room, 'ロビーに戻りました');
      broadcastRoom(room);
      broadcastLobby();
      return;
    }
    case 'review': {
      const { room } = requirePlayer(ws);
      handleReview(room, msg);
      broadcastRoom(room);
      return;
    }
    case 'chat': {
      const room = requireRoom(ws);
      const text = String(msg.text || '').trim().slice(0, 200);
      if (!text) return;
      room.chat.push({ id: (room.chatSeq = (room.chatSeq || 0) + 1), name: ws.name, seat: seatOf(room, ws), text, t: Date.now() });
      if (room.chat.length > 100) room.chat.shift();
      broadcastRoom(room);
      return;
    }
  }
}

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.room = null;
  ws.clientId = null;
  ws.name = '名無し';
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    try {
      handle(ws, msg);
    } catch (e) {
      if (!(e instanceof UserError) && !/指せません|置けません|終了/.test(e.message)) console.error(e);
      send(ws, { type: 'error', message: e.message, code: e.code });
    }
  });
  ws.on('close', () => {
    clients.delete(ws);
    leaveRoom(ws, false);
    broadcastLobby();
  });
});

// 切断検知と空き部屋の掃除
setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  let changed = false;
  for (const room of rooms.values()) {
    if (room.sockets.size === 0 && now - room.lastActive > ROOM_TTL_MS) { deleteRoom(room); changed = true; }
  }
  if (changed) broadcastLobby();
}, 30 * 1000);

server.listen(PORT, () => {
  console.log(`ボードゲームサーバー起動: http://localhost:${PORT}`);
});
