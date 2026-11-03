// 洞窟脱出ジャンプのみんなでレースの位置配り（/cave/ws）
// 部屋づくり・スタート・順位は「ゲームいっぱい」の部屋（public/games/cave.js）がする。ここは位置を同じ部屋の人へ配るだけ（ぶつかり判定はなし）。
// 送る: { t:'attach', key: '部屋コード:回', seat } / { t:'pos', x, y, f, c, ch, g, vy, vx }
// 受け取る: { t:'pos', id: 席, ... } / { t:'gone', id: 席 }
import { WebSocketServer } from 'ws';

const MAX_MEMBERS = 8;

export function mountCaveRelay(path = '/cave/ws') {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  const groups = new Map(); // key → Set(ws)
  const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };

  function leave(ws) {
    const g = ws.caveKey && groups.get(ws.caveKey);
    if (!g) return;
    g.delete(ws);
    if (!g.size) groups.delete(ws.caveKey);
    else for (const o of g) send(o, { t: 'gone', id: ws.seat });
    ws.caveKey = null;
  }

  function handle(ws, msg) {
    if (msg.t === 'attach') {
      leave(ws);
      const key = String(msg.key || '').slice(0, 32);
      const seat = Number(msg.seat);
      if (!key || !Number.isInteger(seat) || seat < 0 || seat >= MAX_MEMBERS) return;
      if (!groups.has(key)) groups.set(key, new Set());
      const g = groups.get(key);
      if (g.size >= MAX_MEMBERS * 2) return;
      ws.caveKey = key;
      ws.seat = seat;
      g.add(ws);
      return;
    }
    if (msg.t === 'pos') {
      const g = ws.caveKey && groups.get(ws.caveKey);
      if (!g) return;
      const num = (v) => (Number.isFinite(+v) ? Math.round(+v * 10) / 10 : 0);
      const out = { t: 'pos', id: ws.seat, x: num(msg.x), y: num(msg.y), f: msg.f < 0 ? -1 : 1, c: msg.c ? 1 : 0,
        ch: num(msg.ch), g: msg.g ? 1 : 0, vy: num(msg.vy), vx: num(msg.vx) };
      for (const o of g) if (o !== ws) send(o, out);
    }
  }

  wss.on('connection', (ws) => {
    ws.caveKey = null;
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
