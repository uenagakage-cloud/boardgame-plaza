import { RACE } from './race-sim.js';

// クライアント・サーバー共通の設定値
export const MODES = { RACE: 'race', BATTLE: 'battle' };

export const MAX_NAME = 12;
export const COUNTDOWN_MS = 3000;
export const RACE_STATE_HZ = 15; // レース: 各プレイヤーの状態共有頻度
export const BATTLE_SNAPSHOT_HZ = 30; // バトル: サーバーからのスナップショット頻度

// チャットのスタンプ（決まった言葉だけ送れる）
export const CHAT_STAMPS = ['黙れ', '助けて！', 'w', '❤️'];
export const CHAT_COOLDOWN_MS = 800;

// バトルのチーム戦（2 チーム）
export const TEAM_COLORS = ['#e5533d', '#2f80ed'];
export const TEAM_NAMES = ['赤チーム', '青チーム'];

export const PLAYER_COLORS = [
  '#535353', // クラシック
  '#e5533d',
  '#2f80ed',
  '#27ae60',
  '#f2994a',
  '#9b51e0',
  '#eb5ea8',
  '#00a3a3',
];

// ルーム設定（mode ごと）。min/max/options でサーバー側の検証にも使う
export const SETTING_DEFS = {
  race: {
    maxPlayers: { label: '最大人数', options: [2, 3, 4, 5, 6, 7, 8], default: 8 },
    lives: { label: 'ライフ', options: [1, 2, 3], default: 1 },
    items: { label: 'おじゃまアイテム', options: [true, false], default: true },
  },
  battle: {
    maxPlayers: { label: '最大人数', options: [2, 3, 4, 5, 6], default: 6 },
    hp: { label: 'HP', options: [50, 100, 150, 200], default: 100 },
    timeLimit: { label: '制限時間(秒)', options: [60, 90, 120, 180], default: 120 },
    items: { label: 'アイテム', options: [true, false], default: true },
    teams: { label: 'チーム戦', options: [false, true], default: false },
  },
};

export function defaultSettings(mode) {
  const defs = SETTING_DEFS[mode];
  const out = {};
  for (const k in defs) out[k] = defs[k].default;
  return out;
}

export function sanitizeSettings(mode, input = {}) {
  const defs = SETTING_DEFS[mode];
  if (!defs) return null;
  const out = {};
  for (const k in defs) {
    const v = input[k];
    out[k] = defs[k].options.includes(v) ? v : defs[k].default;
  }
  return out;
}

export function sanitizeName(name) {
  const s = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, MAX_NAME);
  return s || 'ななし';
}

// ソロスコアの妥当性チェック用：経過秒数から出せる最大スコア
export function maxPlausibleScore(durationSec) {
  const t = Math.max(0, durationSec);
  const tMax = (RACE.SPEED_MAX - RACE.SPEED_START) / RACE.ACCEL;
  let dist;
  if (t <= tMax) dist = RACE.SPEED_START * t + 0.5 * RACE.ACCEL * t * t;
  else dist = RACE.SPEED_START * tMax + 0.5 * RACE.ACCEL * tMax * tMax + RACE.SPEED_MAX * (t - tMax);
  return Math.ceil(dist * RACE.SCORE_COEF * 1.1 + 10);
}
