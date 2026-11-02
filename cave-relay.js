// 洞窟脱出ジャンプのみんなでレース（/cave/ws）
// 動きは各自のブラウザで計算し、このサーバーは位置をほかの人へ配るだけ（ぶつかり判定はなし）。
// 送る: { t:'create', name } / { t:'join', code, name } / { t:'start' }（ホスト）/ { t:'pos', ... } / { t:'finish', time, jumps, falls } / { t:'lobby' }（ホスト）
// 受け取る: { t:'room', code, you, host, phase, members:[{ id, name, color, done, time, jumps, falls, rank }] } / { t:'go', in } / { t:'pos', id, ... } / { t:'error', msg }
import { WebSocketServer } from 'ws';

const MAX_MEMBERS = 8;
const COUNTDOWN_MS = 3500;
const COLORS = ['#c94a32', '#2f7fd8', '#2a9d5c', '#b05cd6', '#e08a1e', '#d6457c', '#1fa5a5', '#7a7a7a'];

export function mountCaveRelay(path = '/cave/ws') {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  const rooms = new Map();
  let nextId = 1;

  const newCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c;
    do c = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); while (rooms.has(c));
    return c;
  };
  const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 12) || '名無し';
  const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };

  function roomMsg(room, ws) {
    const members = [...room.members.values()].map((m) => ({
      id: m.id, name: m.name, color: m.color, done: !!m.result, ...(m.result || {}),
    }));
    return { t: 'room', code: room.code, you: ws.id, host: room.host, phase: room.phase, members };
  }
  const broadcast = (room) => { for (const m of room.members.values()) send(m.ws, roomMsg(room, m.ws)); };

  function leave(ws) {
    const room = ws.caveRoom;
    if (!room) return;
    ws.caveRoom = null;
    room.members.delete(ws.id);
    if (!room.members.size) { rooms.delete(room.code); return; }
    if (room.host === ws.id) room.host = room.members.keys().next().value;
    for (const m of room.members.values()) send(m.ws, { t: 'gone', id: ws.id });
    broadcast(room);
  }

  function enter(ws, room, name) {
    leave(ws);
    if (room.members.size >= MAX_MEMBERS) return send(ws, { t: 'error', msg: `この部屋は満員です（${MAX_MEMBERS}人まで）` });
    if (room.phase === 'race') return send(ws, { t: 'error', msg: 'レース中です。終わるまで待ってください' });
    const used = new Set([...room.members.values()].map((m) => m.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[0];
    room.members.set(ws.id, { id: ws.id, ws, name: cleanName(name), color, result: null });
    ws.caveRoom = room;
    broadcast(room);
  }

  function handle(ws, msg) {
    const room = ws.caveRoom;
    switch (msg.t) {
      case 'create': {
        const r = { code: newCode(), host: ws.id, phase: 'lobby', members: new Map(), finished: 0 };
        rooms.set(r.code, r);
        enter(ws, r, msg.name);
        return;
      }
      case 'join': {
        const r = rooms.get(String(msg.code || '').trim().toUpperCase());
        if (!r) return send(ws, { t: 'error', msg: '部屋が見つかりません' });
        enter(ws, r, msg.name);
        return;
      }
      case 'leave': leave(ws); return;
      case 'start': {
        if (!room || room.host !== ws.id || room.phase === 'race') return;
        room.phase = 'race';
        room.finished = 0;
        for (const m of room.members.values()) m.result = null;
        broadcast(room);
        for (const m of room.members.values()) send(m.ws, { t: 'go', in: COUNTDOWN_MS });
        return;
      }
      case 'lobby': {
        if (!room || room.host !== ws.id) return;
        room.phase = 'lobby';
        for (const m of room.members.values()) m.result = null;
        broadcast(room);
        return;
      }
      case 'pos': {
        if (!room || room.phase !== 'race') return;
        const num = (v) => (Number.isFinite(+v) ? Math.round(+v * 10) / 10 : 0);
        const out = { t: 'pos', id: ws.id, x: num(msg.x), y: num(msg.y), f: msg.f < 0 ? -1 : 1, c: msg.c ? 1 : 0,
          ch: num(msg.ch), g: msg.g ? 1 : 0, vy: num(msg.vy), vx: num(msg.vx) };
        for (const m of room.members.values()) if (m.ws !== ws) send(m.ws, out);
        return;
      }
      case 'finish': {
        const me = room && room.members.get(ws.id);
        if (!me || room.phase !== 'race' || me.result) return;
        me.result = { time: Math.max(0, Math.floor(+msg.time || 0)), jumps: msg.jumps | 0, falls: msg.falls | 0, rank: ++room.finished };
        broadcast(room);
        return;
      }
      default:
    }
  }

  wss.on('connection', (ws) => {
    ws.id = nextId++;
    ws.caveRoom = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg && typeof msg === 'object') handle(ws, msg);
    });
    ws.on('close', () => leave(ws));
  });
  // 切れた接続を片付ける
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* そのまま */ }
    }
  }, 30000).unref();

  return {
    upgrade(req, socket, head) {
      if (!req.url.startsWith(path)) return false;
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      return true;
    },
  };
}
