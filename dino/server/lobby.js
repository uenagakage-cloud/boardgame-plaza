// 接続中のクライアントとルームの管理
import { randomUUID } from 'node:crypto';
import { Room } from './room.js';
import { MODES, PLAYER_COLORS, sanitizeName } from '../shared/config.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_MSG_BYTES = 4096;
const MAX_MSGS_PER_SEC = 120;

export class Lobby {
  constructor() {
    this.clients = new Map();
    this.rooms = new Map();
  }

  connect(ws, ip) {
    const client = {
      id: randomUUID().slice(0, 8),
      ws,
      ip,
      name: 'ななし',
      color: PLAYER_COLORS[0],
      room: null,
      msgCount: 0,
      msgWindow: Date.now(),
      send(type, data = {}) {
        this.sendRaw(JSON.stringify({ type, ...data }));
      },
      sendRaw(text) {
        if (ws.readyState === 1) ws.send(text);
      },
    };
    this.clients.set(client.id, client);
    client.send('welcome', { id: client.id });

    ws.on('message', (raw) => {
      if (raw.length > MAX_MSG_BYTES) return;
      const now = Date.now();
      if (now - client.msgWindow > 1000) {
        client.msgWindow = now;
        client.msgCount = 0;
      }
      if (++client.msgCount > MAX_MSGS_PER_SEC) return;
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;
      try {
        this.handle(client, msg);
      } catch (e) {
        console.error('[lobby] handle error', msg.type, e);
      }
    });
    ws.on('close', () => this.disconnect(client));
    return client;
  }

  disconnect(client) {
    if (client.room) client.room.remove(client.id);
    this.clients.delete(client.id);
  }

  handle(client, msg) {
    switch (msg.type) {
      case 'ping':
        return client.send('pong', { t: msg.t });
      case 'hello':
        client.name = sanitizeName(msg.name);
        if (PLAYER_COLORS.includes(msg.color)) client.color = msg.color;
        return;
      case 'listRooms':
        return client.send('roomList', { rooms: this.publicRooms() });
      case 'createRoom':
        return this.createRoom(client, msg);
      case 'joinRoom':
        return this.joinRoom(client, String(msg.code || '').toUpperCase());
      case 'leaveRoom':
        if (client.room) client.room.remove(client.id);
        return;
      default:
        if (client.room) client.room.handle(client, msg);
    }
  }

  createRoom(client, msg) {
    if (client.room) client.room.remove(client.id);
    const mode = Object.values(MODES).includes(msg.mode) ? msg.mode : MODES.RACE;
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(this, code, mode, msg.settings, msg.isPublic !== false);
    this.rooms.set(code, room);
    room.add(client);
  }

  joinRoom(client, code) {
    const room = this.rooms.get(code);
    if (!room) return client.send('error', { message: 'ルームが見つかりません' });
    const err = room.canJoin();
    if (err) return client.send('error', { message: err });
    if (client.room) client.room.remove(client.id);
    room.add(client);
  }

  removeRoom(room) {
    room.destroy();
    this.rooms.delete(room.code);
  }

  publicRooms() {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic)
      .map((r) => r.summary())
      .slice(0, 30);
  }

  stats() {
    return { online: this.clients.size, rooms: this.rooms.size };
  }
}
