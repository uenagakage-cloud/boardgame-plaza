// WebSocket 接続（自動再接続・ping 計測つき）
import { serverWsUrl } from './config.js';

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.connected = false;
    this.rtt = 0;
    this.retry = 0;
    this.pingTimer = null;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, data) {
    this.handlers.get(type)?.forEach((fn) => fn(data));
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const ws = new WebSocket(serverWsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      this.emit('open');
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send('ping', { t: performance.now() }), 3000);
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'pong') this.rtt = Math.round(performance.now() - msg.t);
      this.emit(msg.type, msg);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      const was = this.connected;
      this.connected = false;
      if (was) this.emit('close');
      const delay = Math.min(10000, 1000 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  }

  send(type, data = {}) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type, ...data }));
      return true;
    }
    return false;
  }
}
