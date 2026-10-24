// サーバーを起動して、API と WebSocket のルームの流れを確認する
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
let proc;

test.before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-'));
  proc = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DATABASE_URL: '' },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

test.after(() => proc?.kill());

function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const queue = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  return {
    ws,
    send: (type, data = {}) => ws.send(JSON.stringify({ type, ...data })),
    next(type, timeout = 5000) {
      const i = queue.findIndex((m) => m.type === type);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        waiters.push({ type, resolve });
        setTimeout(() => reject(new Error(`timeout waiting ${type}`)), timeout);
      });
    },
  };
}

test('静的ファイルと共有モジュールが配信される', async () => {
  assert.equal((await fetch(`${BASE}/`)).status, 200);
  assert.equal((await fetch(`${BASE}/js/main.js`)).status, 200);
  assert.equal((await fetch(`${BASE}/shared/race-sim.js`)).status, 200);
  assert.equal((await fetch(`${BASE}/../package.json`)).status, 404);
});

test('スコア登録とランキング', async () => {
  const post = (body) =>
    fetch(`${BASE}/api/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let res = await post({ pid: 'test-player-1', name: 'たろう', score: 150, duration: 20 });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).rank, 1);
  res = await post({ pid: 'test-player-2', name: 'じろう', score: 300, duration: 30 });
  assert.equal((await res.json()).rank, 1);
  res = await post({ pid: 'test-player-3', name: 'ずる', score: 99999, duration: 5 });
  assert.equal(res.status, 400);
  const data = await (await fetch(`${BASE}/api/ranking?period=all&pid=test-player-1`)).json();
  assert.deepEqual(
    data.rows.map((r) => [r.name, r.score, r.you]),
    [
      ['じろう', 300, false],
      ['たろう', 150, true],
    ],
  );
});

test('ルーム作成 → 参加 → CPU 追加 → バトル開始 → 終了', async () => {
  const host = client();
  const guest = client();
  const { id: hostId } = await host.next('welcome');
  const { id: guestId } = await guest.next('welcome');
  host.send('hello', { name: 'ホスト' });
  guest.send('hello', { name: 'ゲスト' });
  host.send('createRoom', { mode: 'battle', settings: { hp: 50, timeLimit: 60 } });
  const { room } = await host.next('roomState');
  assert.equal(room.hostId, hostId);
  assert.equal(room.settings.hp, 50);

  guest.send('joinRoom', { code: room.code.toLowerCase() });
  const joined = await guest.next('roomState');
  assert.equal(joined.room.players.length, 2);

  // チャット：決まったスタンプだけ全員に届く
  guest.send('chat', { stamp: 3 });
  const chat = await host.next('chat');
  assert.equal(chat.from, guestId);
  assert.equal(chat.stamp, 3);
  guest.send('chat', { stamp: 99 });
  host.send('addBot');
  host.send('startGame'); // ゲストが準備していないので開始できない
  assert.match((await host.next('error')).message, /準備/);
  guest.send('setReady', { ready: true });
  await new Promise((r) => setTimeout(r, 100));
  host.send('startGame');
  const start = await guest.next('gameStart');
  assert.equal(start.mode, 'battle');
  assert.equal(start.players.length, 3);
  assert.ok(start.players.every((p) => p.spawn));
  const snap = await guest.next('battle:snapshot');
  assert.equal(snap.s.p.length, 3);

  // 人間 2 人が抜ける → ゲスト退出でホストと CPU の対戦に
  guest.ws.close();
  host.ws.close();
});

test('レース: 脱落で順位が決まる', async () => {
  const a = client();
  const b = client();
  const { id: aId } = await a.next('welcome');
  const { id: bId } = await b.next('welcome');
  a.send('createRoom', { mode: 'race', isPublic: false });
  const { room } = await a.next('roomState');
  b.send('joinRoom', { code: room.code });
  await b.next('roomState');
  b.send('setReady', { ready: true });
  await new Promise((r) => setTimeout(r, 100));
  a.send('startGame');
  const start = await a.next('gameStart');
  assert.equal(typeof start.seed, 'number');
  await b.next('gameStart');
  b.send('race:item', { item: 'night' });
  b.send('race:dead', { score: 12 });
  const elim = await a.next('race:eliminated');
  assert.equal(elim.id, bId);
  assert.equal(elim.place, 2);
  const over = await a.next('gameOver', 5000);
  assert.equal(over.winnerId, aId);
  a.ws.close();
  b.ws.close();
});

test('チーム戦: 自動でチーム分けされ、片方のチームが空だと開始できない', async () => {
  const host = client();
  await host.next('welcome');
  host.send('createRoom', { mode: 'battle', settings: { teams: true }, isPublic: false });
  let { room } = await host.next('roomState');
  assert.equal(room.settings.teams, true);
  host.send('addBot');
  ({ room } = await host.next('roomState'));
  assert.deepEqual(room.players.map((p) => p.team).sort(), [0, 1], '少ない方のチームに入る');
  const bot = room.players.find((p) => p.bot);
  host.send('setTeam', { id: bot.id, team: room.players.find((p) => !p.bot).team });
  await host.next('roomState');
  host.send('startGame');
  assert.match((await host.next('error')).message, /チーム/);
  host.send('setTeam', { id: bot.id, team: 1 - room.players.find((p) => !p.bot).team });
  await host.next('roomState');
  host.send('startGame');
  const start = await host.next('gameStart');
  assert.deepEqual(start.players.map((p) => p.team).sort(), [0, 1]);
  host.ws.close();
});
