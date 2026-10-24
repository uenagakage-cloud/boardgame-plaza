// ディノラッシュを「ゲームいっぱい」のサーバーの中で動かす（/dino/ の下に置く）
// 元のエントリーポイント（index.js）と同じことを、別のサーバーに相乗りする形でやる。
import { WebSocketServer } from 'ws';
import { createStorage } from './storage.js';
import { Lobby } from './lobby.js';
import { createHttpHandler, clientIp } from './http.js';

export async function mountDino(prefix = '/dino') {
  const storage = await createStorage();
  const lobby = new Lobby();
  const httpHandler = createHttpHandler({ storage, lobby });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });

  // 切断検知（スマホのスリープなどで残った接続を掃除）
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 15000).unref();

  const strip = (url) => {
    const rest = url.slice(prefix.length);
    return rest.startsWith('/') ? rest : '/' + rest;
  };
  const owns = (pathname) => pathname === prefix || pathname.startsWith(prefix + '/');

  return {
    // HTTP: /dino/… なら処理して true
    handle(req, res) {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (!owns(pathname)) return false;
      if (pathname === prefix) { res.writeHead(301, { Location: prefix + '/' }).end(); return true; }
      req.url = strip(req.url);
      httpHandler(req, res);
      return true;
    },
    // WebSocket: /dino/ws なら受けて true
    upgrade(req, socket, head) {
      if (new URL(req.url, 'http://localhost').pathname !== prefix + '/ws') return false;
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.isAlive = true;
        ws.on('pong', () => (ws.isAlive = true));
        lobby.connect(ws, clientIp(req));
      });
      return true;
    },
    stats: () => lobby.stats(),
  };
}
