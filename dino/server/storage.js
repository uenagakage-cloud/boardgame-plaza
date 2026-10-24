// スコア保存。DATABASE_URL があれば PostgreSQL、なければ JSON ファイルに保存する
// （無料クラウドの多くはディスクが再起動で消えるので、本番は PostgreSQL 推奨）
import fs from 'node:fs/promises';
import path from 'node:path';

const PERIODS = {
  day: 24 * 3600 * 1000,
  week: 7 * 24 * 3600 * 1000,
  all: Infinity,
};

function periodStart(period) {
  const span = PERIODS[period] ?? Infinity;
  return span === Infinity ? new Date(0) : new Date(Date.now() - span);
}

export async function createStorage() {
  if (process.env.DATABASE_URL) {
    try {
      const s = await createPgStorage(process.env.DATABASE_URL);
      console.log('[storage] PostgreSQL を使用');
      return s;
    } catch (e) {
      console.error('[storage] PostgreSQL に接続できないため JSON ファイルを使用します:', e.message);
    }
  }
  const dir = process.env.DATA_DIR || path.resolve('data');
  console.log(`[storage] JSON ファイルを使用 (${dir})`);
  return createJsonStorage(dir);
}

// ---------- JSON ----------
export async function createJsonStorage(dir) {
  const file = path.join(dir, 'scores.json');
  await fs.mkdir(dir, { recursive: true });
  let scores = [];
  try {
    scores = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    scores = [];
  }
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fs.writeFile(file, JSON.stringify(scores)).catch((e) => console.error('[storage] save failed', e));
    }, 500);
  };

  function bestPerPlayer(period) {
    const since = periodStart(period).getTime();
    const best = new Map();
    for (const s of scores) {
      if (s.at < since) continue;
      const cur = best.get(s.pid);
      if (!cur || s.score > cur.score) best.set(s.pid, s);
    }
    return [...best.values()].sort((a, b) => b.score - a.score || a.at - b.at);
  }

  return {
    kind: 'json',
    async addScore({ pid, name, score }) {
      scores.push({ pid, name, score, at: Date.now() });
      if (scores.length > 20000) {
        scores.sort((a, b) => b.score - a.score);
        scores = scores.slice(0, 15000);
      }
      save();
      const list = bestPerPlayer('all');
      const mine = list.find((s) => s.pid === pid);
      return { rank: list.indexOf(mine) + 1, best: mine.score };
    },
    async top(period, limit, pid) {
      return bestPerPlayer(period)
        .slice(0, limit)
        .map((s) => ({ name: s.name, score: s.score, at: s.at, you: s.pid === pid }));
    },
    async close() {
      clearTimeout(saveTimer);
      await fs.writeFile(file, JSON.stringify(scores));
    },
  };
}

// ---------- PostgreSQL ----------
async function createPgStorage(url) {
  const { default: pg } = await import('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    ssl: local || process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
    max: 5,
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      pid TEXT NOT NULL,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS scores_created_idx ON scores (created_at);
    CREATE INDEX IF NOT EXISTS scores_pid_idx ON scores (pid, score DESC);
  `);

  return {
    kind: 'pg',
    async addScore({ pid, name, score }) {
      await pool.query('INSERT INTO scores (pid, name, score) VALUES ($1, $2, $3)', [pid, name, score]);
      const { rows } = await pool.query(
        `WITH best AS (SELECT pid, MAX(score) AS s FROM scores GROUP BY pid)
         SELECT (SELECT s FROM best WHERE pid = $1) AS best,
                (SELECT COUNT(*) FROM best WHERE s > (SELECT s FROM best WHERE pid = $1)) + 1 AS rank`,
        [pid],
      );
      return { rank: Number(rows[0].rank), best: Number(rows[0].best) };
    },
    async top(period, limit, pid) {
      const { rows } = await pool.query(
        `SELECT name, score, created_at, pid FROM (
           SELECT DISTINCT ON (pid) pid, name, score, created_at
           FROM scores WHERE created_at >= $1
           ORDER BY pid, score DESC, created_at ASC
         ) t ORDER BY score DESC, created_at ASC LIMIT $2`,
        [periodStart(period), limit],
      );
      return rows.map((r) => ({ name: r.name, score: r.score, at: new Date(r.created_at).getTime(), you: r.pid === pid }));
    },
    async close() {
      await pool.end();
    },
  };
}
