// 静的ファイル配信と REST API（ランキング）
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeName, maxPlausibleScore } from '../shared/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SHARED_DIR = path.join(ROOT, 'shared');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 2048) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// IP ごとの簡易レート制限
const submitLog = new Map();
function rateLimited(ip, max = 10, windowMs = 60_000) {
  const now = Date.now();
  const list = (submitLog.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  submitLog.set(ip, list);
  return list.length > max;
}
setInterval(() => submitLog.clear(), 10 * 60_000).unref();

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket.remoteAddress || '?';
}

export function createHttpHandler({ storage, lobby }) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });

      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          return res.end();
        }
        return await handleApi(req, res, url, { storage, lobby });
      }
      return await serveStatic(req, res, url.pathname);
    } catch (e) {
      console.error('[http]', e);
      sendJson(res, 500, { error: 'server error' });
    }
  };
}

async function handleApi(req, res, url, { storage, lobby }) {
  if (url.pathname === '/api/ranking' && req.method === 'GET') {
    const period = ['day', 'week', 'all'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'all';
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const pid = url.searchParams.get('pid') || '';
    return sendJson(res, 200, { period, rows: await storage.top(period, limit, pid) });
  }

  if (url.pathname === '/api/score' && req.method === 'POST') {
    if (rateLimited(clientIp(req))) return sendJson(res, 429, { error: '送信が多すぎます' });
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'bad request' });
    }
    const pid = String(body.pid || '');
    const score = Math.floor(Number(body.score));
    const duration = Number(body.duration);
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(pid)) return sendJson(res, 400, { error: 'bad pid' });
    if (!Number.isFinite(score) || score <= 0 || score > 999999) return sendJson(res, 400, { error: 'bad score' });
    if (!Number.isFinite(duration) || duration <= 0 || score > maxPlausibleScore(duration)) {
      return sendJson(res, 400, { error: 'スコアが不正です' });
    }
    const result = await storage.addScore({ pid, name: sanitizeName(body.name), score });
    return sendJson(res, 200, result);
  }

  if (url.pathname === '/api/stats' && req.method === 'GET') {
    return sendJson(res, 200, lobby.stats());
  }

  return sendJson(res, 404, { error: 'not found' });
}

async function serveStatic(req, res, pathname) {
  let base = PUBLIC_DIR;
  let rel = decodeURIComponent(pathname);
  if (rel.startsWith('/shared/')) {
    base = SHARED_DIR;
    rel = rel.slice('/shared'.length);
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(base, path.normalize(rel));
  if (!file.startsWith(base)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}
