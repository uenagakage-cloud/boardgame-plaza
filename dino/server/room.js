// ルーム：ロビー（準備）→ ゲーム中 → ロビー に戻る
import { MODES, PLAYER_COLORS, CHAT_STAMPS, CHAT_COOLDOWN_MS, defaultSettings, sanitizeSettings } from '../shared/config.js';
import { RaceGame } from './race-game.js';
import { BattleGame } from './battle-game.js';

const BOT_NAMES = ['ティラノ', 'ラプトル', 'トリケラ', 'ステゴ', 'アンキロ', 'ブラキオ', 'スピノ', 'パキケファロ'];

export class Room {
  constructor(lobby, code, mode, settings, isPublic) {
    this.lobby = lobby;
    this.code = code;
    this.mode = mode;
    this.settings = sanitizeSettings(mode, settings || defaultSettings(mode));
    this.isPublic = isPublic;
    this.players = new Map(); // id -> { id, name, color, ready, bot, client }
    this.hostId = null;
    this.phase = 'lobby';
    this.game = null;
    this.botSeq = 0;
  }

  get humans() {
    return [...this.players.values()].filter((p) => !p.bot);
  }

  canJoin() {
    if (this.phase !== 'lobby') return 'ゲーム中のため参加できません';
    if (this.players.size >= this.settings.maxPlayers) return 'ルームが満員です';
    return null;
  }

  pickColor(preferred) {
    const used = new Set([...this.players.values()].map((p) => p.color));
    if (!used.has(preferred)) return preferred;
    return PLAYER_COLORS.find((c) => !used.has(c)) || preferred;
  }

  // チーム戦用：人数の少ないチーム
  smallerTeam() {
    const count = [0, 0];
    for (const p of this.players.values()) count[p.team]++;
    return count[0] <= count[1] ? 0 : 1;
  }

  get teamsOn() {
    return this.mode === MODES.BATTLE && !!this.settings.teams;
  }

  add(client) {
    client.room = this;
    this.players.set(client.id, {
      id: client.id,
      name: client.name,
      color: this.pickColor(client.color),
      ready: false,
      bot: false,
      team: this.smallerTeam(),
      client,
    });
    if (!this.hostId) this.hostId = client.id;
    this.broadcastState();
  }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (p.client) {
      p.client.room = null;
      p.client.send('leftRoom');
    }
    if (this.game) this.game.removePlayer(id);
    if (this.humans.length === 0) {
      this.lobby.removeRoom(this);
      return;
    }
    if (this.hostId === id) this.hostId = this.humans[0].id;
    this.broadcastState();
  }

  isHost(client) {
    return client.id === this.hostId;
  }

  handle(client, msg) {
    const p = this.players.get(client.id);
    if (!p) return;
    if (msg.type === 'chat') {
      this.chat(p, msg.stamp);
      return;
    }
    if (this.phase === 'playing') {
      this.game?.handle(client, msg);
      return;
    }
    switch (msg.type) {
      case 'setReady':
        p.ready = !!msg.ready;
        break;
      case 'updateRoom':
        if (!this.isHost(client)) return;
        if (Object.values(MODES).includes(msg.mode) && msg.mode !== this.mode) {
          this.mode = msg.mode;
          this.settings = defaultSettings(this.mode);
        }
        if (msg.settings) this.settings = sanitizeSettings(this.mode, { ...this.settings, ...msg.settings });
        if (typeof msg.isPublic === 'boolean') this.isPublic = msg.isPublic;
        this.trimToMax();
        break;
      case 'addBot': {
        if (!this.isHost(client) || this.players.size >= this.settings.maxPlayers) return;
        const id = `bot${++this.botSeq}`;
        this.players.set(id, {
          id,
          name: `CPU ${BOT_NAMES[(this.botSeq - 1) % BOT_NAMES.length]}`,
          color: this.pickColor(PLAYER_COLORS[this.botSeq % PLAYER_COLORS.length]),
          ready: true,
          bot: true,
          team: this.smallerTeam(),
          skill: 0.5 + Math.random() * 0.4,
        });
        break;
      }
      case 'setTeam': {
        // 自分のチームを変える / ホストは CPU のチームも変えられる
        const target = msg.id && msg.id !== client.id ? this.players.get(msg.id) : p;
        if (!target || (target !== p && !(this.isHost(client) && target.bot))) return;
        if (msg.team === 0 || msg.team === 1) target.team = msg.team;
        break;
      }
      case 'removePlayer': {
        // CPU の削除 / プレイヤーのキック（ホストのみ）
        if (!this.isHost(client) || msg.id === client.id) return;
        const target = this.players.get(msg.id);
        if (!target) return;
        if (target.bot) this.players.delete(msg.id);
        else {
          target.client?.send('error', { message: 'ホストによってルームから外されました' });
          this.remove(msg.id);
          return;
        }
        break;
      }
      case 'startGame':
        if (!this.isHost(client)) return;
        if (!this.humans.every((h) => h.ready || h.id === this.hostId)) {
          client.send('error', { message: '全員の準備ができていません' });
          return;
        }
        if (this.teamsOn && new Set([...this.players.values()].map((q) => q.team)).size < 2) {
          client.send('error', { message: 'チーム戦は両方のチームに1人以上必要です' });
          return;
        }
        this.startGame();
        return;
      default:
        return;
    }
    this.broadcastState();
  }

  // スタンプはロビーでもゲーム中でも送れる
  chat(p, stamp) {
    const i = Number(stamp);
    if (!Number.isInteger(i) || i < 0 || i >= CHAT_STAMPS.length) return;
    const now = Date.now();
    if (now - (p.lastChatAt || 0) < CHAT_COOLDOWN_MS) return;
    p.lastChatAt = now;
    this.broadcast('chat', { from: p.id, name: p.name, color: p.color, stamp: i });
  }

  trimToMax() {
    // 最大人数を下げたときは CPU から減らす
    const bots = [...this.players.values()].filter((p) => p.bot);
    while (this.players.size > this.settings.maxPlayers && bots.length) this.players.delete(bots.pop().id);
  }

  startGame() {
    const teams = this.teamsOn;
    const players = [...this.players.values()].map(({ id, name, color, bot, skill, team }) => ({ id, name, color, bot, skill, team: teams ? team : null }));
    this.phase = 'playing';
    this.broadcastState();
    const Game = this.mode === MODES.RACE ? RaceGame : BattleGame;
    this.game = new Game(this, players, this.settings);
  }

  endGame(results, extra = {}) {
    const winner = results.find((r) => r.place === 1);
    this.broadcast('gameOver', { mode: this.mode, results, winnerId: winner ? winner.id : null, ...extra });
    this.game?.destroy();
    this.game = null;
    this.phase = 'lobby';
    for (const p of this.players.values()) if (!p.bot) p.ready = false;
    this.broadcastState();
  }

  // JSON への変換は 1 回だけにして全員に送る
  broadcast(type, data, exceptId) {
    const text = JSON.stringify({ type, ...data });
    for (const p of this.players.values()) {
      if (p.client && p.id !== exceptId) p.client.sendRaw(text);
    }
  }

  sendTo(id, type, data) {
    this.players.get(id)?.client?.send(type, data);
  }

  state() {
    return {
      code: this.code,
      mode: this.mode,
      settings: this.settings,
      isPublic: this.isPublic,
      hostId: this.hostId,
      phase: this.phase,
      players: [...this.players.values()].map(({ id, name, color, ready, bot, team }) => ({ id, name, color, ready, bot, team })),
    };
  }

  broadcastState() {
    this.broadcast('roomState', { room: this.state() });
  }

  summary() {
    const host = this.players.get(this.hostId);
    return {
      code: this.code,
      mode: this.mode,
      host: host ? host.name : '',
      count: this.players.size,
      max: this.settings.maxPlayers,
      phase: this.phase,
    };
  }

  destroy() {
    this.game?.destroy();
    this.game = null;
  }
}
