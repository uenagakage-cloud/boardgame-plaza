// エントリーポイント：HTTP（静的ファイル + API）と WebSocket（/ws）を同じポートで提供
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createStorage } from './storage.js';
import { Lobby } from './lobby.js';
import { createHttpHandler, clientIp } from './http.js';

const PORT = Number(process.env.PORT) || 3000;

const storage = await createStorage();
const lobby = new Lobby();
const server = http.createServer(createHttpHandler({ storage, lobby }));
const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/ws') return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    lobby.connect(ws, clientIp(req));
  });
});

// 切断検知（スマホのスリープなどで残った接続を掃除）
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`Dino Rush server: http://localhost:${PORT}`));

async function shutdown() {
  clearInterval(heartbeat);
  wss.close();
  server.close();
  await storage.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
