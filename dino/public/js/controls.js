// タッチ操作（画面上のボタン / スティック）とキーボード操作をまとめて扱う
import { unlockAudio } from './audio.js';

const KEYMAP = {
  race: {
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
    ArrowDown: 'duck', KeyS: 'duck',
    KeyX: 'item', KeyE: 'item', ShiftLeft: 'item', ShiftRight: 'item',
  },
  battle: {
    ArrowLeft: 'l', KeyA: 'l',
    ArrowRight: 'r', KeyD: 'r',
    ArrowDown: 'd', KeyS: 'd',
    ArrowUp: 'j', KeyW: 'j', Space: 'j',
    KeyJ: 'b', KeyZ: 'b', KeyK: 'b', Enter: 'b',
    KeyX: 'item', KeyE: 'item', ShiftLeft: 'item', ShiftRight: 'item',
  },
};

export class Controls {
  constructor(container) {
    this.el = container;
    this.mode = null;
    this.touch = {};
    this.keys = {};
    this.listeners = new Set();
    this.cleanup = [];
    // 押している指（pointerId）ごとの「離したときの処理」。指を離した通知を取りこぼしても後で必ず離せるようにする
    this.releasers = new Map();
  }

  releasePointer(id) {
    const fn = this.releasers.get(id);
    if (!fn) return;
    this.releasers.delete(id);
    fn();
  }

  // タッチ操作をすべて離す（画面に指が 1 本も触れていない / アプリが裏に回った など）
  releaseAll() {
    for (const id of [...this.releasers.keys()]) this.releasePointer(id);
    this.touch = {};
    this.el.querySelectorAll('.active').forEach((el) => el.classList.remove('active'));
  }

  get(name) {
    return !!(this.touch[name] || this.keys[name]);
  }

  // 押した瞬間のコールバック（アイテム使用・リスタートなど）
  onPress(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  press(name, source) {
    const was = this.get(name);
    source[name] = true;
    if (!was) this.listeners.forEach((fn) => fn(name));
  }

  release(name, source) {
    source[name] = false;
  }

  setup(mode, { items = false } = {}) {
    this.destroy();
    this.mode = mode;
    this.el.className = `controls controls-${mode}`;
    if (mode === 'race') {
      this.el.innerHTML = `
        <div class="ctl-zone ctl-left" data-btn="duck"><span class="ctl-label">▼<small>しゃがむ</small><kbd>↓</kbd></span></div>
        <div class="ctl-zone ctl-right" data-btn="jump"><span class="ctl-label">▲<small>ジャンプ</small><kbd>Space / ↑</kbd></span></div>
        ${items ? '<div class="ctl-item" data-btn="item"><span class="ctl-item-icon">?</span><small>アイテム</small><kbd>X</kbd></div>' : ''}`;
    } else {
      this.el.innerHTML = `
        <div class="ctl-dpad"><div class="dpad-half" data-dir="l">◀<kbd>← / A</kbd></div><div class="dpad-half" data-dir="r">▶<kbd>→ / D</kbd></div></div>
        <div class="ctl-buttons"><div class="ctl-btn ctl-bite" data-btn="b">かむ<kbd>J / Z</kbd></div><div class="ctl-btn ctl-jump" data-btn="j">ジャンプ<kbd>↑ / Space</kbd></div><div class="ctl-btn ctl-duck" data-btn="d">しゃがむ<kbd>↓ / S</kbd></div>${items ? '<div class="ctl-btn ctl-itembtn" data-btn="item"><span class="ctl-item-icon">?</span><small>アイテム</small><kbd>X</kbd></div>' : ''}</div>`;
      this.bindDpad(this.el.querySelector('.ctl-dpad'));
    }
    this.el.querySelectorAll('[data-btn]').forEach((b) => this.bindButton(b, b.dataset.btn));
    this.bindKeys(KEYMAP[mode]);
    this.bindSafetyNet();
  }

  // 「指を離した」通知の取りこぼしで、ボタンが押しっぱなしになるのを防ぐ
  bindSafetyNet() {
    const releaseOne = (e) => this.releasePointer(e.pointerId);
    this.listen(window, 'pointerup', releaseOne);
    this.listen(window, 'pointercancel', releaseOne);
    // 画面に触れている指が 0 本になったら、全部離す
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) this.releaseAll();
    };
    this.listen(window, 'touchend', onTouchEnd);
    this.listen(window, 'touchcancel', onTouchEnd);
    // 通知・アプリ切り替え・画面ロックなどで裏に回ったら、全部離す
    const onHide = () => {
      this.releaseAll();
      this.keys = {};
    };
    this.listen(window, 'blur', onHide);
    this.listen(window, 'pagehide', onHide);
    this.listen(document, 'visibilitychange', () => document.hidden && onHide());
  }

  bindButton(el, name) {
    const pointers = new Set();
    const down = (e) => {
      e.preventDefault();
      unlockAudio();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
      pointers.add(e.pointerId);
      this.releasers.set(e.pointerId, () => up(e));
      el.classList.add('active');
      this.press(name, this.touch);
    };
    const up = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      this.releasers.delete(e.pointerId);
      if (pointers.size === 0) {
        el.classList.remove('active');
        this.release(name, this.touch);
      }
    };
    this.listen(el, 'pointerdown', down);
    this.listen(el, 'pointerup', up);
    this.listen(el, 'pointercancel', up);
    this.listen(el, 'lostpointercapture', up);
  }

  // 左右ボタン。指を離さずにスライドすると切り替わる
  bindDpad(zone) {
    const halves = zone.querySelectorAll('.dpad-half');
    const names = [...halves].map((h) => h.dataset.dir);
    const pointers = new Map();
    const update = () => {
      const held = new Set();
      for (const pt of pointers.values()) {
        // 指の位置に一番近いボタン（指がボタンの外にずれても反応する）
        let best = 0;
        let bestD = Infinity;
        halves.forEach((h, i) => {
          const r = h.getBoundingClientRect();
          const d = Math.hypot(pt.x - (r.left + r.width / 2), (pt.y - (r.top + r.height / 2)) * 0.6);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        held.add(names[best]);
      }
      halves.forEach((h, i) => {
        const name = names[i];
        const on = held.has(name);
        if (on && !this.touch[name]) this.press(name, this.touch);
        if (!on) this.release(name, this.touch);
        h.classList.toggle('active', on);
      });
    };
    this.listen(zone, 'pointerdown', (e) => {
      e.preventDefault();
      unlockAudio();
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {}
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.releasers.set(e.pointerId, () => end(e));
      update();
    });
    this.listen(zone, 'pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      update();
    });
    const end = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      this.releasers.delete(e.pointerId);
      update();
    };
    this.listen(zone, 'pointerup', end);
    this.listen(zone, 'pointercancel', end);
    this.listen(zone, 'lostpointercapture', end);
  }

  bindKeys(map) {
    const down = (e) => {
      const name = map[e.code];
      if (!name || e.target.tagName === 'INPUT') return;
      e.preventDefault();
      unlockAudio();
      if (!e.repeat) this.press(name, this.keys);
    };
    const up = (e) => {
      const name = map[e.code];
      if (name) this.release(name, this.keys);
    };
    this.listen(window, 'keydown', down);
    this.listen(window, 'keyup', up);
  }

  listen(target, type, fn) {
    target.addEventListener(type, fn, { passive: false });
    this.cleanup.push(() => target.removeEventListener(type, fn));
  }

  destroy() {
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
    this.touch = {};
    this.keys = {};
    this.releasers.clear();
    this.listeners.clear();
    this.el.innerHTML = '';
    this.mode = null;
  }
}
