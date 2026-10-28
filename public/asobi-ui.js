// アソビ大全から入れたゲームの画面（app.js から使う）
// asobiRenderers(api) で { ゲームのキー: 描く関数(el, v, act) } を返す。api は app.js の道具（h・送信・選択の窓など）
import * as morris from './games/morris.js';
import * as hex from './games/hex.js';
import * as checkers from './games/checkers.js';
import * as domino from './games/domino.js';
import * as ccheckers from './games/ccheckers.js';
import * as ludo from './games/ludo.js';
import * as sevens from './games/sevens.js';
import * as speed from './games/speed.js';
import * as memory from './games/memory.js';
import * as blackjack from './games/blackjack.js';
import * as lastcard from './games/lastcard.js';
import * as pigtail from './games/pigtail.js';
import * as yacht from './games/yacht.js';
import * as koikoi from './games/koikoi.js';
import * as tanks from './games/tanks.js';
import * as hbball from './games/hbball.js';
import * as chinchiro from './games/chinchiro.js';
import { SUIT_MARK, RANK_LABEL } from './games/util.js';

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function asobiRenderers(api) {
  const { h, hk, send, sendMove, choose, render, revealPanel, now } = api;
  const nameOf = (v, i) => v.seats[i]?.name || '?';
  const move = (mv) => send({ type: 'move', move: mv });
  // 操作の途中（選んだコマなど）を覚えておく。盤が変わったら消す
  const ui = { key: '', data: {} };
  const local = (v) => {
    const k = `${v.code}:${v.gameNo}:${v.state.history.length}:${v.state.turn}:${v.state.phase}:${v.state.removing}:${v.state.rolled}`;
    if (k !== ui.key) { ui.key = k; ui.data = {}; }
    return ui.data;
  };

  // 参加者の並び（手番・自分・抜けた・勝ち）
  function players(v, info, extra, after) {
    const s = v.state, me = v.you;
    const row = h('div', 'uno-players');
    for (let i = 0; i < v.seats.length; i++) {
      if (!v.seats[i]) continue;
      const out = s.out && s.out[i];
      const win = s.result && (s.result.winner === i);
      const chip = h('div', 'wb-player' + (i === me ? ' me' : '') + (out ? ' out' : '') + (!s.result && i === s.turn ? ' turn' : '') + (win ? ' winner' : ''));
      if (extra) extra(chip, i);
      chip.append(h('span', 'pname', nameOf(v, i)));
      if (v.seats[i]) chip.append(h('span', 'dot ' + (v.seats[i].online ? 'on' : 'off')));
      const t = info(i);
      if (t != null && t !== '') chip.append(h('span', 'wb-count', out ? '抜けた' : t));
      if (after) after(chip, i);
      row.append(chip);
    }
    return row;
  }

  // トランプ（A=1）
  function card(c, extra = '') {
    if (!c) return h('span', 'pcard back ' + extra);
    const red = c.s === 'h' || c.s === 'd';
    const e = h('span', `pcard ${red ? 'red' : 'black'} ${extra}`);
    e.append(h('span', 'pc-rank', RANK_LABEL[c.r]), h('span', 'pc-suit', SUIT_MARK[c.s]));
    return e;
  }

  // ================= ナインメンズモリス =================
  function renderMorris(el, v, act) {
    const s = v.state, me = v.you, L = local(v);
    const legal = act ? morris.legalMoves(s) : [];
    const box = h('div', 'as-board-wrap');
    const S = 70, P = 35;
    const g = svg('svg', { viewBox: `0 0 ${6 * S + 2 * P} ${6 * S + 2 * P}`, class: 'mr-board' + (act ? ' active' : '') });
    const at = (i) => [P + morris.POINTS[i][1] * S, P + morris.POINTS[i][0] * S];
    g.append(svg('rect', { x: 2, y: 2, width: 6 * S + 2 * P - 4, height: 6 * S + 2 * P - 4, rx: 18, class: 'mr-bg' }));
    for (const m of morris.MILLS) {
      const [x1, y1] = at(m[0]), [x2, y2] = at(m[2]);
      g.append(svg('line', { x1, y1, x2, y2, class: 'mr-line' }));
    }
    const millSet = new Set();
    for (const m of morris.MILLS) if (m.every((j) => s.board[j] != null && s.board[j] === s.board[m[0]])) m.forEach((j) => millSet.add(j));
    const targets = new Set();
    if (L.from != null) legal.filter((m) => m.from === L.from).forEach((m) => targets.add(m.to));
    const placeable = new Set(legal.filter((m) => m.place != null).map((m) => m.place));
    const removable = new Set(legal.filter((m) => m.remove != null).map((m) => m.remove));
    const movers = new Set(legal.filter((m) => m.from != null).map((m) => m.from));
    for (let i = 0; i < 24; i++) {
      const [x, y] = at(i);
      const p = s.board[i];
      const grp = svg('g', { class: 'mr-pt' });
      grp.append(svg('circle', { cx: x, cy: y, r: 9, class: 'mr-dot' }));
      if (p != null) {
        const cls = `mr-stone p${p}` + (millSet.has(i) ? ' mill' : '') + (s.last && s.last.to === i ? ' last' : '') + (L.from === i ? ' sel' : '') + (removable.has(i) ? ' target-remove' : '') + (movers.has(i) ? ' can' : '');
        grp.append(svg('circle', { cx: x, cy: y, r: 23, class: cls }));
      } else if (placeable.has(i) || targets.has(i)) {
        grp.append(svg('circle', { cx: x, cy: y, r: 13, class: 'mr-hint' }));
      }
      if (s.last && s.last.removed === i) { const x2 = svg('text', { x, y: y + 9, class: 'mr-x' }); x2.textContent = '×'; grp.append(x2); }
      grp.append(svg('circle', { cx: x, cy: y, r: 30, class: 'mr-hit' }));
      grp.addEventListener('click', () => {
        if (!act) return;
        if (removable.has(i)) return sendMove({ remove: i });
        if (placeable.has(i)) return sendMove({ place: i });
        if (targets.has(i)) return sendMove({ from: L.from, to: i });
        if (movers.has(i)) { L.from = L.from === i ? null : i; render(); }
      });
      g.append(grp);
    }
    // 手持ちのコマ
    const hands = h('div', 'mr-hands');
    for (const p of [0, 1]) {
      const row = h('div', 'mr-hand');
      row.append(h('span', 'small', `${morris.sideNames[p]}（${nameOf(v, p)}）`));
      for (let k = 0; k < s.hand[p]; k++) row.append(h('span', `mr-mini p${p}`));
      if (!s.hand[p]) row.append(h('span', 'muted small', '全部置いた'));
      hands.append(row);
    }
    box.append(hands, g);
    if (act) box.append(h('p', 'muted small as-help', s.removing ? '赤く光っているコマを取れます' : morris.phaseOf(s, me) === 'place' ? '光っている点をタップして置きます' : 'コマをタップして選び、光った点へ動かします'));
    el.replaceChildren(box);
  }

  // ================= ヘックス =================
  function renderHex(el, v, act) {
    const s = v.state, n = s.n;
    const R = 20, w = Math.sqrt(3) * R;
    const cx = (r, c) => 30 + w * (c + r / 2) + w / 2, cy = (r) => 30 + R * 1.5 * r + R;
    const W = 60 + w * (n + (n - 1) / 2), Hh = 60 + R * 1.5 * (n - 1) + 2 * R;
    const g = svg('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'hx-board' + (act ? ' active' : '') });
    const win = new Set((s.winPath || []).map(([r, c]) => r * n + c));
    // ふち（赤: 上下、青: 左右）
    const corner = (r, c, k) => { const a = Math.PI / 180 * (60 * k - 30); return [cx(r, c) + R * Math.cos(a), cy(r) + R * Math.sin(a)]; };
    const edge = (pts, cls) => g.append(svg('polyline', { points: pts.map((p) => p.join(',')).join(' '), class: cls }));
    edge(Array.from({ length: n }, (_, c) => [corner(0, c, 4), corner(0, c, 5)]).flat(), 'hx-edge red');
    edge(Array.from({ length: n }, (_, c) => [corner(n - 1, c, 1), corner(n - 1, c, 2)]).flat().reverse(), 'hx-edge red');
    edge(Array.from({ length: n }, (_, r) => [corner(r, 0, 3), corner(r, 0, 2)]).flat(), 'hx-edge blue');
    edge(Array.from({ length: n }, (_, r) => [corner(r, n - 1, 5), corner(r, n - 1, 0)]).flat(), 'hx-edge blue');
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const pts = Array.from({ length: 6 }, (_, k) => corner(r, c, k).join(',')).join(' ');
      const x = s.board[r][c];
      const last = s.last && s.last[0] === r && s.last[1] === c;
      const poly = svg('polygon', { points: pts, class: 'hx-cell' + (x != null ? ` p${x}` : act ? ' can' : '') + (last ? ' last' : '') + (win.has(r * n + c) ? ' win' : '') });
      if (act && x == null) poly.addEventListener('click', () => sendMove({ to: [r, c] }));
      g.append(poly);
    }
    const box = h('div', 'as-board-wrap');
    box.append(g, h('p', 'muted small as-help', '赤は上と下、青は左と右のふちを、自分の色でつなげたら勝ち'));
    el.replaceChildren(box);
  }

  // ================= チェッカー =================
  function renderCheckers(el, v, act) {
    const s = v.state, me = v.you, L = local(v);
    const flip = me === 1;
    const legal = act ? checkers.legalMoves(s) : [];
    const path = L.path || [];
    const same = (a, b) => a[0] === b[0] && a[1] === b[1];
    const cands = legal.filter((m) => path.every((p, i) => m[i] && same(m[i], p)));
    const starts = new Set(legal.map((m) => m[0][0] * 8 + m[0][1]));
    const nexts = new Set(path.length ? cands.filter((m) => m.length > path.length).map((m) => m[path.length][0] * 8 + m[path.length][1]) : []);
    const lastPath = new Set((s.last ? s.last.path : []).map(([r, c]) => r * 8 + c));
    const board = h('div', 'ck-board' + (act ? ' active' : ''));
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const r = flip ? 7 - i : i, c = flip ? 7 - j : j;
      const cell = h('div', 'ck-sq ' + ((r + c) % 2 ? 'dark' : 'light') + (lastPath.has(r * 8 + c) ? ' last' : ''));
      const x = s.board[r][c];
      const inPath = path.some((p) => p[0] === r && p[1] === c);
      if (x && !(path.length && same(path[0], [r, c]))) cell.append(h('span', `ck-piece p${x.o}` + (x.k ? ' king' : '') + (starts.has(r * 8 + c) && !path.length ? ' can' : ''), x.k ? '♛' : ''));
      if (path.length && same(path[0], [r, c])) cell.append(h('span', `ck-piece p${me} sel` + (x && x.k ? ' king' : ''), x && x.k ? '♛' : ''));
      if (inPath && !same(path[0], [r, c])) cell.append(h('span', 'ck-step'));
      if (nexts.has(r * 8 + c)) cell.append(h('span', 'hint dot'));
      cell.onclick = () => {
        if (!act) return;
        if (nexts.has(r * 8 + c)) {
          const np = [...path, [r, c]];
          const full = legal.find((m) => m.length === np.length && m.every((p, k) => same(p, np[k])));
          const longer = legal.some((m) => m.length > np.length && np.every((p, k) => same(p, m[k])));
          if (full && !longer) return sendMove({ path: np });
          L.path = np;
          return render();
        }
        if (starts.has(r * 8 + c)) { L.path = path.length && same(path[0], [r, c]) ? null : [[r, c]]; render(); }
      };
      board.append(cell);
    }
    const box = h('div', 'as-board-wrap');
    box.append(board);
    if (act) box.append(h('p', 'muted small as-help', legal.some((m) => Math.abs(m[1][0] - m[0][0]) === 2) ? '取れるコマがあります。取る手しか指せません（続けて跳べるときは続けて選ぶ）' : 'コマを選んで、ななめ前の点へ動かします'));
    el.replaceChildren(box);
  }

  // ================= ドミノ =================
  const PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function half(n) {
    const e = h('span', 'dm-half');
    for (let k = 0; k < 9; k++) e.append(h('span', PIPS[n].includes(k) ? 'dm-pip' : 'dm-nopip'));
    return e;
  }
  function tile(t, extra = '') {
    const e = h('span', 'dm-tile ' + (t.a === t.b ? 'double ' : '') + extra);
    e.append(half(t.a), h('span', 'dm-bar'), half(t.b));
    return e;
  }
  function renderDomino(el, v, act) {
    const s = v.state, me = v.you, L = local(v);
    const root = h('div', 'dm');
    root.append(players(v, (i) => `${s.handCounts[i]}枚`));
    const table = h('div', 'dm-table');
    const line = h('div', 'dm-line');
    if (!s.line.length) line.append(h('span', 'muted small', 'まだ何も置かれていません。どの牌からでも始められます'));
    s.line.forEach((t, i) => line.append(tile(t, 'flat' + (s.last && s.last.type === 'play' && s.last.id === t.id ? ' last' : ''))));
    table.append(line);
    const e = domino.ends(s);
    if (e) table.append(h('div', 'dm-ends', `左はし ${e[0]}　・　右はし ${e[1]}`));
    table.append(h('div', 'muted small', `山 ${s.boneyardCount}枚`));
    root.append(table);
    if (me >= 0 && s.hands[me] && !s.out[me]) {
      const playable = new Set(act ? domino.playable(s, me).map((t) => t.id) : []);
      const hand = h('div', 'dm-hand');
      let nk = 0;
      for (const t of s.hands[me]) {
        const b = h('button', 'dm-hand-btn' + (playable.has(t.id) ? ' playable' : '') + (L.tile === t.id ? ' sel' : ''));
        b.append(tile(t));
        b.disabled = !playable.has(t.id);
        if (playable.has(t.id) && nk < 9) hk(b, String(++nk));
        b.onclick = () => {
          const sides = domino.sidesFor(s, t);
          if (sides.length === 1 || (e && e[0] === e[1])) return sendMove({ play: t.id, side: sides[0] });
          L.tile = t.id;
          render();
        };
        hand.append(b);
      }
      root.append(h('div', 'cc-hand-title', 'あなたの牌'), hand);
      const bar = h('div', 'uno-actions');
      if (L.tile != null) {
        const l = h('button', 'btn primary', '◀ 左はしに置く'), r = h('button', 'btn primary', '右はしに置く ▶');
        hk(l, 'arrowleft');
        hk(r, 'arrowright');
        l.onclick = () => sendMove({ play: L.tile, side: 'L' });
        r.onclick = () => sendMove({ play: L.tile, side: 'R' });
        bar.append(l, r);
      }
      if (act && !playable.size) {
        const b = hk(h('button', 'btn primary', s.boneyardCount ? '山から1枚引く' : 'パス'), 'd enter');
        b.onclick = () => sendMove(s.boneyardCount ? { draw: true } : { pass: true });
        bar.append(b);
      }
      if (bar.childElementCount) root.append(bar);
    }
    const others = [...Array(s.players).keys()].filter((i) => i !== me && s.hands[i]);
    if (s.seesAll || s.result) { const p = revealPanel(v, others.map((i) => [i, s.hands[i].map((t) => tile(t, 'small'))]), 'みんなの牌'); if (p) root.append(p); }
    el.replaceChildren(root);
  }

  // ================= チャイニーズチェッカー =================
  function renderCChecker(el, v, act) {
    const s = v.state, me = v.you, L = local(v);
    // 自分の陣地が下に来るよう回す（観戦者は最初の人）
    const myHome = s.homes[me >= 0 ? me : 0];
    const rot = (k, [x, y, z]) => { let p = [x, y, z]; for (let i = 0; i < k; i++) p = [-p[2], -p[0], -p[1]]; return p; };
    // 陣地 0 は x が大きい角。画面の下（+y の向き）に来るよう回す数を探す
    const down = ([x, y, z]) => { const px = Math.sqrt(3) * (x + z / 2), py = 1.5 * z; return Math.atan2(py, px); };
    const tipIdx = ccheckers.TIPS[myHome];
    let k = 0, bestD = Infinity;
    for (let i = 0; i < 6; i++) { const a = down(rot(i, ccheckers.CELLS[tipIdx])); const d = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))); if (d < bestD) { bestD = d; k = i; } }
    const pos = ccheckers.CELLS.map((c) => { const [x, , z] = rot(k, c); return [Math.sqrt(3) * (x + z / 2), 1.5 * z]; });
    const S = 15;
    const g = svg('svg', { viewBox: `${-14.5 * S} ${-13.5 * S} ${29 * S} ${27 * S}`, class: 'cc2-board' + (act ? ' active' : '') });
    // 角の色
    s.homes.forEach((home, p) => {
      for (const t of [home, ccheckers.targetOf(home)]) for (const i of ccheckers.TRIANGLES[t]) {
        const [x, y] = pos[i];
        g.append(svg('circle', { cx: x * S, cy: y * S, r: S * 0.95, fill: ccheckers.COLORS[p], opacity: t === home ? 0.16 : 0.1 }));
      }
    });
    const reach = L.from != null ? ccheckers.reach(s.board, L.from) : new Map();
    if (s.last && s.last.path) g.append(svg('polyline', { points: s.last.path.map((i) => `${pos[i][0] * S},${pos[i][1] * S}`).join(' '), class: 'cc2-trail' }));
    ccheckers.CELLS.forEach((_, i) => {
      const [x, y] = pos[i];
      const p = s.board[i];
      const grp = svg('g');
      grp.append(svg('circle', { cx: x * S, cy: y * S, r: S * 0.42, class: 'cc2-hole' }));
      if (p != null) grp.append(svg('circle', { cx: x * S, cy: y * S, r: S * 0.62, fill: ccheckers.COLORS[p], class: 'cc2-peg' + (L.from === i ? ' sel' : '') + (act && p === me ? ' can' : '') + (s.last && s.last.path && s.last.path.at(-1) === i ? ' last' : '') }));
      if (reach.has(i)) grp.append(svg('circle', { cx: x * S, cy: y * S, r: S * 0.45, class: 'cc2-target' }));
      grp.append(svg('circle', { cx: x * S, cy: y * S, r: S * 0.85, class: 'cc2-hit' }));
      grp.addEventListener('click', () => {
        if (!act) return;
        if (reach.has(i)) return sendMove({ from: L.from, to: i });
        if (p === me) { L.from = L.from === i ? null : i; render(); }
      });
      g.append(grp);
    });
    const root = h('div', 'as-board-wrap');
    root.append(players(v, (i) => `${ccheckers.inTarget(s, i)}/10`, (chip, i) => { const sw = h('span', 'as-swatch'); sw.style.background = ccheckers.COLORS[i]; chip.prepend(sw); }));
    root.append(g);
    if (act) root.append(h('p', 'muted small as-help', 'コマを選ぶと、行ける穴が光ります。向かいの角（うすい同じ色）へ全部運ぼう'));
    el.replaceChildren(root);
  }

  // ================= ルドー =================
  const LUDO_COLORS = ['#e03131', '#2f9e44', '#f0b400', '#1c7ed6'];
  let ludoRollKey = '';
  function renderLudo(el, v, act) {
    const s = v.state, me = v.you;
    const root = h('div', 'ld');
    root.append(players(v, (i) => `${s.tokens[i].filter((p) => p === ludo.GOAL).length}/4`, (chip, i) => { const sw = h('span', 'as-swatch'); sw.style.background = LUDO_COLORS[s.colors[i]]; chip.prepend(sw); }));
    const board = h('div', 'ld-board');
    const cells = new Map();
    const put = (r, c, cls, color) => {
      const e = h('div', 'ld-cell ' + cls);
      e.style.gridRow = r + 1;
      e.style.gridColumn = c + 1;
      if (color) e.style.setProperty('--c', color);
      board.append(e);
      cells.set(`${r},${c}`, e);
      return e;
    };
    // 家（4すみ）
    [[0, 0], [0, 9], [9, 9], [9, 0]].forEach(([r, c], col) => {
      const e = h('div', 'ld-base');
      e.style.gridRow = `${r + 1} / span 6`;
      e.style.gridColumn = `${c + 1} / span 6`;
      e.style.setProperty('--c', LUDO_COLORS[col]);
      board.append(e);
    });
    ludo.TRACK.forEach(([r, c], i) => {
      const startOf = [0, 13, 26, 39].indexOf(i);
      put(r, c, 'track' + (ludo.SAFE.has(i) ? ' safe' : '') + (startOf >= 0 ? ' start' : ''), startOf >= 0 ? LUDO_COLORS[startOf] : null);
    });
    ludo.HOME_LANE.forEach((lane, col) => lane.forEach(([r, c]) => put(r, c, 'lane', LUDO_COLORS[col])));
    const center = h('div', 'ld-center');
    center.style.gridRow = '7 / span 3';
    center.style.gridColumn = '7 / span 3';
    board.append(center);
    // コマ
    const movable = new Set(act && s.rolled ? ludo.movable(s, me) : []);
    const baseSpots = [[[2, 2], [2, 4], [4, 2], [4, 4]]];
    const baseOrigin = [[0, 0], [0, 9], [9, 9], [9, 0]];
    const tokensAt = new Map();
    s.tokens.forEach((list, p) => {
      if (s.out[p]) return;
      const color = s.colors[p];
      list.forEach((pos, k) => {
        let rc;
        if (pos === -1) { const [br, bc] = baseOrigin[color]; const [dr, dc] = baseSpots[0][k]; rc = [br + dr, bc + dc, 'base']; }
        else if (pos === ludo.GOAL) rc = [7, 7, 'goal'];
        else if (pos > 50) rc = [...ludo.HOME_LANE[color][pos - 51]];
        else rc = [...ludo.TRACK[ludo.absPos(color, pos)]];
        const key = rc.slice(0, 2).join(',');
        if (!tokensAt.has(key)) tokensAt.set(key, []);
        tokensAt.get(key).push({ p, k, color, rc });
      });
    });
    for (const list of tokensAt.values()) {
      list.forEach((t, idx) => {
        const [r, c, kind] = t.rc;
        const e = h('button', 'ld-token' + (t.p === me && movable.has(t.k) ? ' can' : '') + (s.last && s.last.by === t.p && s.last.token === t.k ? ' last' : ''));
        e.style.setProperty('--c', LUDO_COLORS[t.color]);
        const off = list.length > 1 ? (idx - (list.length - 1) / 2) * 0.28 : 0;
        e.style.left = `calc(${((kind === 'base' ? c : c + 0.5) + off) * (100 / 15)}% )`;
        e.style.top = `calc(${(kind === 'base' ? r : r + 0.5) * (100 / 15)}% )`;
        if (kind === 'goal') { e.style.left = `${(7.5 + off) * (100 / 15)}%`; e.style.top = `${(7.5 + (t.color - 1.5) * 0.25) * (100 / 15)}%`; }
        e.disabled = !(t.p === me && movable.has(t.k));
        if (!e.disabled) hk(e, String(t.k + 1));
        e.onclick = () => sendMove({ token: t.k });
        board.append(e);
      });
    }
    root.append(board);
    // サイコロ
    const bar = h('div', 'ld-bar');
    const rollKey = `${v.code}:${s.history.length}:${s.dice}:${s.turn}`;
    const dice = h('div', 'ld-dice' + (s.rolled && rollKey !== ludoRollKey ? ' rolling' : ''), s.dice ? '⚀⚁⚂⚃⚄⚅'[s.dice - 1] : '🎲');
    ludoRollKey = rollKey;
    bar.append(dice);
    if (act && !s.rolled) { const b = hk(h('button', 'btn primary', 'サイコロをふる'), 'space enter'); b.onclick = () => sendMove({ roll: true }); bar.append(b); }
    else if (act && s.rolled) bar.append(h('span', 'small', `${s.dice}が出ました。光っているコマを選んでください`));
    else bar.append(h('span', 'muted small', s.result ? '' : `${nameOf(v, s.turn)} さんの番`));
    root.append(bar);
    el.replaceChildren(root);
  }

  // ================= 7ならべ =================
  function renderSevens(el, v, act) {
    const s = v.state, me = v.you;
    const root = h('div', 'sv');
    root.append(players(v, (i) => sevens.scoreOf(s, i)));
    const table = h('div', 'sv-table');
    for (const suit of ['s', 'h', 'd', 'c']) {
      const row = h('div', 'sv-row');
      const t = s.table[suit];
      for (let r = 1; r <= 13; r++) {
        if (t[r]) row.append(card({ s: suit, r }, 'small' + (s.last && s.last.card && s.last.card.s === suit && s.last.card.r === r ? ' last' : '')));
        else row.append(h('span', 'pcard empty small' + (t[r - 1] || t[r + 1] ? ' next' : '')));
      }
      table.append(row);
    }
    root.append(table);
    if (me >= 0 && s.hands[me] && !s.out[me]) {
      const ok = new Set(act ? sevens.playable(s, me).map((c) => c.id) : []);
      const hand = h('div', 'uno-hand');
      let nk = 0;
      const sorted = s.hands[me].slice().sort((a, b) => 'shdc'.indexOf(a.s) - 'shdc'.indexOf(b.s) || a.r - b.r);
      for (const c of sorted) {
        const b = h('button', 'uno-hand-card' + (ok.has(c.id) ? ' playable' : ''));
        b.append(card(c));
        b.disabled = !ok.has(c.id);
        if (ok.has(c.id) && nk < 9) hk(b, String(++nk));
        b.onclick = () => sendMove({ play: c.id });
        hand.append(b);
      }
      root.append(h('div', 'cc-hand-title', `あなたの手札（${s.hands[me].length}枚）`), hand);
      if (act) {
        const left = s.options.passes - s.passes[me];
        const b = hk(h('button', 'btn' + (left <= 0 ? ' danger' : ''), left > 0 ? `パス（あと${left}回）` : 'パス（ドボンになります）'), 'p');
        b.onclick = async () => { if (left > 0 || await choose('パスするとドボン（負け）です。いいですか？', [['yes', 'パスする'], [null, 'やめる']])) sendMove({ pass: true }); };
        const bar = h('div', 'uno-actions');
        bar.append(b);
        root.append(bar);
      }
    }
    if (s.seesAll || s.result) {
      const others = [...Array(s.players).keys()].filter((i) => i !== me && s.hands[i] && s.hands[i].length);
      const p = revealPanel(v, others.map((i) => [i, s.hands[i].map((c) => card(c, 'small'))]));
      if (p) root.append(p);
    }
    el.replaceChildren(root);
  }

  // ================= スピード =================
  let spTimer = null;
  function renderSpeed(el, v) {
    const s = v.state, me = v.you, L = local(v);
    const mine = me >= 0 ? me : 0, opp = 1 - mine;
    clearTimeout(spTimer);
    const root = h('div', 'sp');
    const side = (p, isMe) => {
      const row = h('div', 'sp-side' + (isMe ? ' me' : ''));
      row.append(h('div', 'sp-name', `${nameOf(v, p)}（${speed.sideNames[p]}）・山 ${s.deckCounts[p]}枚`));
      const f = h('div', 'sp-field');
      s.field[p].forEach((c, k) => {
        if (!isMe || me < 0 || s.phase !== 'play') { f.append(c ? card(c, 'big') : h('span', 'pcard empty big')); return; }
        const ok = c && (speed.canPlay(s, c, 0) || speed.canPlay(s, c, 1));
        const b = h('button', 'sp-card' + (ok ? ' playable' : '') + (L.k === k ? ' sel' : ''));
        b.append(c ? card(c, 'big') : h('span', 'pcard empty big'));
        b.disabled = !c;
        if (c) hk(b, String(k + 1));
        b.onclick = () => {
          if (!c) return;
          const piles = [0, 1].filter((pi) => speed.canPlay(s, c, pi));
          if (piles.length === 1) return move({ play: k, pile: piles[0] });
          L.k = L.k === k ? null : k;
          render();
        };
        f.append(b);
      });
      row.append(f);
      return row;
    };
    root.append(side(opp, false));
    const center = h('div', 'sp-center');
    [0, 1].forEach((pi) => {
      const top = s.piles[pi][s.piles[pi].length - 1];
      const b = h('button', 'sp-pile' + (L.k != null && speed.canPlay(s, s.field[mine][L.k], pi) ? ' target' : '') + (s.last && s.last.pile === pi && s.last.at && now() - s.last.at < 600 ? ' bump' : ''));
      b.append(top ? card(top, 'big') : h('span', 'pcard empty big'));
      hk(b, pi === 0 ? 'arrowleft' : 'arrowright');
      b.onclick = () => { if (L.k != null && speed.canPlay(s, s.field[mine][L.k], pi)) move({ play: L.k, pile: pi }); };
      center.append(b);
    });
    root.append(center);
    root.append(side(mine, me >= 0));
    if (s.phase === 'ready') {
      const over = h('div', 'sp-over');
      if (me >= 0 && !s.ready[me]) { const b = hk(h('button', 'btn primary big', 'スタート'), 'space enter'); b.onclick = () => move({ ready: true }); over.append(b); }
      else over.append(h('div', 'sp-count small', me >= 0 ? '相手を待っています…' : '準備中'));
      root.append(over);
    } else if (s.phase === 'count') {
      const left = Math.max(0, Math.ceil((s.tickAt - now()) / 1000));
      const over = h('div', 'sp-over');
      over.append(h('div', 'sp-count', left ? String(left) : 'スピード！'));
      root.append(over);
      spTimer = setTimeout(render, 200);
    } else if (s.stuckAt) {
      root.append(h('div', 'sp-stuck', 'どちらも出せない！ 山から出しなおします…'));
    }
    if (s.phase === 'play' && me >= 0) root.append(h('p', 'muted small as-help', '台のカードと1つちがい（KとAはつながる）の札をタップ。両方の台に出せるときは、札を選んでから台をタップ'));
    el.replaceChildren(root);
  }

  // ================= 神経衰弱 =================
  function renderMemory(el, v, act) {
    const s = v.state;
    const root = h('div', 'mm c' + s.cards.length);
    root.append(players(v, (i) => memory.scoreOf(s, i)));
    const grid = h('div', 'mm-grid n' + s.cards.length);
    s.cards.forEach((c, i) => {
      const taken = s.taken[i] != null;
      const open = s.open.includes(i);
      const b = h('button', 'mm-card' + (taken ? ' taken' : '') + (open ? ' open' : '') + (s.phase === 'show' && open ? ' miss' : '') + (s.last && s.last.match && s.last.cards.includes(i) ? ' got' : ''));
      if (taken && !s.result) b.append(h('span', 'mm-gone'));
      else b.append(card(c, ''));
      b.disabled = !act || taken || open || s.phase !== 'pick';
      b.onclick = () => move({ flip: i });
      grid.append(b);
    });
    root.append(grid);
    el.replaceChildren(root);
  }

  // ================= ブラックジャック =================
  function renderBlackjack(el, v) {
    const s = v.state, me = v.you;
    const root = h('div', 'bj');
    const dealer = h('div', 'bj-dealer');
    const dcards = h('div', 'bj-cards');
    s.dealer.forEach((c) => dcards.append(card(c, 'big')));
    const shown = s.dealer.filter(Boolean);
    dealer.append(h('div', 'bj-label', 'ディーラー' + (shown.length ? `：${s.dealer.includes(null) ? `${blackjack.total(shown)}＋？` : blackjack.total(shown)}` : '')), dcards);
    root.append(h('div', 'muted small', `第${s.round}/${s.options.rounds}ゲーム・17以上になるまでディーラーは引く`), dealer);
    const seats = h('div', 'bj-seats');
    for (let p = 0; p < s.players; p++) {
      const box = h('div', 'bj-seat' + (p === me ? ' me' : '') + (s.out[p] ? ' out' : '') + (s.result && s.result.winner === p ? ' winner' : ''));
      box.append(h('div', 'bj-name', `${nameOf(v, p)}・チップ ${s.chips[p]}`));
      const cs = h('div', 'bj-cards');
      s.hands[p].forEach((c) => cs.append(card(c, '')));
      box.append(cs);
      const info = [];
      if (s.bets[p]) info.push(`賭け ${s.bets[p]}`);
      if (s.hands[p].length) info.push(`合計 ${blackjack.total(s.hands[p])}`);
      if (s.phase === 'bet') info.push(s.bets[p] == null ? '考え中…' : '');
      else if (s.phase === 'play' && s.hands[p].length) info.push(s.done[p] ? (blackjack.total(s.hands[p]) > 21 ? 'バースト' : 'スタンド') : '考え中…');
      box.append(h('div', 'small', info.filter(Boolean).join('・')));
      if (s.outcome && s.outcome[p]) box.append(h('div', 'bj-outcome ' + (s.outcome[p].gain > 0 ? 'win' : s.outcome[p].gain < 0 ? 'lose' : ''), `${s.outcome[p].text} ${s.outcome[p].gain >= 0 ? '+' : ''}${s.outcome[p].gain}`));
      seats.append(box);
    }
    root.append(seats);
    if (me >= 0 && !s.out[me] && !s.result) {
      const bar = h('div', 'uno-actions');
      if (s.phase === 'bet' && s.bets[me] == null && s.chips[me] > 0) {
        bar.append(h('span', 'small', '賭けるチップ：'));
        let nk = 0;
        for (const b of [...blackjack.BETS, s.chips[me]].filter((x, i, a) => x <= s.chips[me] && a.indexOf(x) === i)) {
          const btn = h('button', 'btn primary', b === s.chips[me] && !blackjack.BETS.includes(b) ? `全部（${b}）` : String(b));
          hk(btn, String(++nk));
          btn.onclick = () => move({ bet: b });
          bar.append(btn);
        }
      } else if (s.phase === 'play' && s.hands[me].length && !s.done[me]) {
        const hit = h('button', 'btn primary', 'ヒット（もう1枚）'), stand = h('button', 'btn', 'スタンド（止める）');
        hk(hit, 'h');
        hk(stand, 's');
        hit.onclick = () => move({ hit: true });
        stand.onclick = () => move({ stand: true });
        bar.append(hit, stand);
        if (s.hands[me].length === 2 && s.chips[me] >= s.bets[me]) { const d = hk(h('button', 'btn', 'ダブル'), 'd'); d.title = '賭けを2倍にして1枚だけ引く'; d.onclick = () => move({ double: true }); bar.append(d); }
      }
      if (bar.childElementCount) root.append(bar);
    }
    el.replaceChildren(root);
  }

  // ================= ラストカード =================
  const LC_SYMBOL = { skip: '⊘', rev: '⇄', '+2': '+2', wild: 'W', '+4': '+4' };
  let lcArmed = false;
  function lcCard(c, extra = '') {
    const e = h('span', `lc-card ${c.c ? 'c-' + c.c : 'wild'} ${extra}`);
    e.append(h('span', 'lc-oval'), h('span', 'lc-val', LC_SYMBOL[c.v] || c.v));
    e.title = lastcard.cardName(c);
    return e;
  }
  async function playLc(c, armed) {
    let color;
    if (!c.c) {
      color = await choose('色を選んでください', lastcard.COLORS.map((x) => [x, lastcard.COLOR_NAMES[x]]));
      if (!color) return;
    }
    lcArmed = false;
    sendMove({ play: c.id, color, uno: armed || undefined });
  }
  function renderLastcard(el, v) {
    const s = v.state, me = v.you;
    const myTurn = me >= 0 && s.turn === me && !s.result && !s.out[me];
    const playable = me >= 0 ? lastcard.playableIds(s, me) : [];
    const myHand = me >= 0 ? s.hands[me] || [] : [];
    if (myHand.length !== 2) lcArmed = false;
    const root = h('div', 'uno');
    root.append(players(v, (i) => `${s.handCounts[i]}枚`, null, (chip, i) => {
      if (!s.out[i] && s.handCounts[i] === 1) chip.append(h('span', 'uno-badge', 'ラスト'));
      if (s.unoPending === i && me >= 0 && me !== i && !s.out[me]) {
        const b = hk(h('button', 'btn danger small', '言ってない！'), 'c');
        b.onclick = () => move({ catchUno: i });
        chip.append(b);
      }
    }));
    const table = h('div', 'uno-table');
    const pile = h('button', 'uno-pile' + (myTurn && s.drawn == null ? ' active' : ''));
    pile.append(h('span', 'uno-back', 'LAST'), h('span', 'uno-pile-count', `山札 ${s.deckCount}`));
    pile.disabled = !(myTurn && s.drawn == null);
    pile.onclick = () => sendMove({ draw: true });
    hk(pile, 'd');
    const discard = h('div', 'uno-discard');
    discard.append(lcCard(lastcard.top(s), 'big'));
    const info = h('div', 'uno-info');
    info.append(h('span', `uno-color-chip lc-chip-${s.color}`, `場の色：${lastcard.COLOR_NAMES[s.color]}`), h('span', 'uno-dir', s.direction === 1 ? '順番 ↻' : '順番 ↺'));
    table.append(pile, discard, info);
    root.append(table);
    const la = s.lastAction;
    if (la && !s.result) {
      const text = la.type === 'play' ? `${nameOf(v, la.seat)} が ${lastcard.cardName(la.card)} を出しました`
        : la.type === 'draw' ? `${nameOf(v, la.seat)} が1枚引きました`
        : la.type === 'pass' ? `${nameOf(v, la.seat)} はパス`
        : la.type === 'caught' ? `${nameOf(v, la.by)} が ${nameOf(v, la.seat)} の言い忘れを指摘！ 2枚引きます`
        : `${nameOf(v, la.seat)}：ラストカード！`;
      root.append(h('div', 'uno-last', text));
    }
    if (me >= 0 && !s.out[me] && !s.result) {
      const bar = h('div', 'uno-actions');
      if (myTurn && myHand.length === 2 && playable.length) {
        const arm = h('button', 'btn uno-call' + (lcArmed ? ' armed' : ''), lcArmed ? 'ラストカード！（出すときに宣言）' : '「ラストカード」と言う');
        hk(arm, 'u');
        arm.onclick = () => { lcArmed = !lcArmed; render(); };
        bar.append(arm);
      }
      if (s.unoPending === me) { const late = hk(h('button', 'btn uno-call armed', 'ラストカード！（今すぐ宣言）'), 'u'); late.onclick = () => move({ uno: true }); bar.append(late); }
      if (myTurn && s.drawn != null) { const pass = hk(h('button', 'btn', 'パス'), 'p'); pass.onclick = () => sendMove({ pass: true }); bar.append(pass); }
      if (bar.childElementCount) root.append(bar);
    }
    if (me >= 0 && !s.out[me]) {
      const hand = h('div', 'uno-hand');
      let nk = 0;
      for (const c of myHand) {
        const ok = playable.includes(c.id);
        const b = h('button', 'uno-hand-card' + (ok ? ' playable' : '') + (s.drawn === c.id ? ' drawn' : ''));
        b.append(lcCard(c));
        b.disabled = !ok;
        if (ok && nk < 9) hk(b, String(++nk));
        b.onclick = () => playLc(c, lcArmed);
        hand.append(b);
      }
      root.append(hand);
    }
    if (s.result || s.seesAll) {
      const others = [...Array(s.players).keys()].filter((i) => i !== me && s.hands[i] && s.hands[i].length);
      const p = revealPanel(v, others.map((i) => [i, s.hands[i].map((c) => lcCard(c, 'small'))]));
      if (p) root.append(p);
    }
    el.replaceChildren(root);
  }

  // ================= ぶたのしっぽ =================
  function renderPigtail(el, v, act) {
    const s = v.state, me = v.you;
    const root = h('div', 'pg');
    root.append(players(v, (i) => `${s.handCounts[i]}枚`));
    const ring = h('div', 'pg-ring');
    const n = s.ring.length;
    s.ring.forEach((c, i) => {
      if (!c) return;
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const b = h('button', 'pg-slot' + (act ? ' can' : ''));
      b.style.left = `${50 + Math.cos(a) * 43}%`;
      b.style.top = `${50 + Math.sin(a) * 43}%`;
      b.style.transform = `translate(-50%, -50%) rotate(${a + Math.PI / 2}rad)`;
      b.append(card(null, 'small'));
      b.disabled = !act;
      b.onclick = () => sendMove({ flip: i });
      ring.append(b);
    });
    const mid = h('div', 'pg-mid');
    const pile = h('div', 'pg-pile');
    s.pile.forEach((c, k) => { const e = card(c, 'big'); e.style.transform = `rotate(${(k - s.pile.length + 1) * 9}deg)`; pile.append(e); });
    if (!s.pile.length) pile.append(h('span', 'muted small', 'からっぽ'));
    mid.append(pile, h('div', 'small', `山 ${s.pileCount}枚・輪 ${s.ringLeft}枚`));
    if (s.last && s.last.took) mid.append(h('div', 'pg-took', `${nameOf(v, s.last.by)} が ${s.last.took}枚 引き取り！`));
    ring.append(mid);
    root.append(ring);
    if (act) {
      // キーボード・マウスで、輪のどれか1枚をめくる
      const flip = hk(h('button', 'btn primary', '輪からどれか1枚めくる'), 'space enter');
      const left = s.ring.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
      flip.onclick = () => sendMove({ flip: left[Math.floor(Math.random() * left.length)] });
      const bar = h('div', 'uno-actions');
      bar.append(flip);
      root.append(bar);
    }
    if (me >= 0 && s.hands[me] && s.hands[me].length) {
      const hand = h('div', 'uno-hand');
      let nk = 0;
      for (const c of s.hands[me]) {
        const b = h('button', 'uno-hand-card' + (act ? ' playable' : ''));
        b.append(card(c, 'small'));
        b.disabled = !act;
        if (act && nk < 9) hk(b, String(++nk));
        b.onclick = () => sendMove({ play: c.id });
        hand.append(b);
      }
      root.append(h('div', 'cc-hand-title', `あなたの手札（${s.hands[me].length}枚・タップで出す）`), hand);
    }
    if (act) root.append(h('p', 'muted small as-help', '輪のカードをタップしてめくります。真ん中の一番上とマークか数字が同じだと、山を全部引き取り…'));
    el.replaceChildren(root);
  }

  // ================= ヨット =================
  const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  function renderYacht(el, v, act) {
    const s = v.state, me = v.you, L = local(v);
    const root = h('div', 'yt');
    root.append(players(v, (i) => `${yacht.totalOf(s.sheets[i])}点`));
    const dice = h('div', 'yt-dice');
    const hold = L.hold || s.held.slice();
    L.hold = hold;
    s.dice.forEach((d, i) => {
      const b = h('button', 'yt-die' + (hold[i] && s.rolls ? ' held' : '') + (s.last && s.last.type === 'roll' && s.last.rolled[i] ? ' rolled' : ''), s.rolls || s.result ? DIE[d] : '？');
      b.disabled = !(act && s.rolls > 0 && s.rolls < 3);
      hk(b, String(i + 1));
      b.onclick = () => { hold[i] = !hold[i]; render(); };
      dice.append(b);
    });
    root.append(dice);
    if (act) {
      const bar = h('div', 'uno-actions');
      if (s.rolls < 3) {
        const b = h('button', 'btn primary', s.rolls ? `残すサイコロ以外をふり直す（あと${3 - s.rolls}回）` : 'サイコロをふる');
        hk(b, 'space r');
        b.onclick = () => sendMove({ roll: true, hold: s.rolls ? hold : undefined });
        bar.append(b);
      }
      root.append(bar);
      if (s.rolls) root.append(h('p', 'muted small as-help', 'サイコロをタップすると残します（黄色）。点数表の光っているところをタップして点を書きます'));
    }
    // 点数表
    const tbl = h('table', 'yt-sheet');
    const head = h('tr');
    head.append(h('th', null, '役'));
    for (let p = 0; p < s.players; p++) head.append(h('th', p === s.turn && !s.result ? 'turn' : '', nameOf(v, p)));
    tbl.append(head);
    const row = (labelText, cell, cls = '') => {
      const tr = h('tr', cls);
      tr.append(h('td', 'yt-cat', labelText));
      for (let p = 0; p < s.players; p++) tr.append(cell(p));
      tbl.append(tr);
    };
    const catCell = (cat) => (p) => {
      const val = s.sheets[p][cat];
      if (val != null) return h('td', 'yt-val' + (s.last && s.last.type === 'score' && s.last.by === p && s.last.cat === cat ? ' last' : ''), String(val));
      if (act && p === me && s.rolls) {
        const td = h('td', 'yt-val can');
        const b = h('button', 'yt-pick', String(yacht.scoreFor(cat, s.dice)));
        b.onclick = () => sendMove({ score: cat });
        td.append(b);
        return td;
      }
      return h('td', 'yt-val empty', '');
    };
    for (const cat of yacht.UPPER) row(yacht.CAT_NAMES[cat], catCell(cat));
    row('小計（63でボーナス）', (p) => h('td', 'yt-val sub', `${yacht.upperSum(s.sheets[p])}`), 'sub');
    row('ボーナス +35', (p) => h('td', 'yt-val sub', yacht.bonusOf(s.sheets[p]) ? '35' : '−'), 'sub');
    for (const cat of yacht.CATS.slice(6)) row(yacht.CAT_NAMES[cat], catCell(cat));
    row('合計', (p) => h('td', 'yt-val total', String(yacht.totalOf(s.sheets[p]))), 'total');
    root.append(tbl);
    el.replaceChildren(root);
  }

  // ================= 花札（こいこい） =================
  const HANA = {
    1: ['#2b8a3e', '🌲'], 2: ['#c2255c', '🌸'], 3: ['#f783ac', '🌸'], 4: ['#7048e8', '🪻'], 5: ['#4263eb', '💠'], 6: ['#e64980', '🌺'],
    7: ['#ae3ec9', '🌿'], 8: ['#868e96', '🌾'], 9: ['#f59f00', '🌼'], 10: ['#e8590c', '🍁'], 11: ['#37b24d', '🌿'], 12: ['#5f3dc4', '🍃'],
  };
  const SPECIAL = { 0: '🦢', 8: '🎪', 28: '🌕', 40: '☂️', 44: '🦚', 4: '🐦', 12: '🐦', 16: '🌉', 20: '🦋', 24: '🐗', 29: '🪿', 32: '🍶', 36: '🦌', 41: '🐦' };
  function hana(id, extra = '') {
    if (id == null) return h('span', 'hf-card back ' + extra);
    const c = koikoi.CARDS[id];
    const [color, icon] = HANA[c.month];
    const e = h('span', `hf-card t-${c.type}${c.tan ? ' tan-' + c.tan : ''} ${extra}`);
    e.style.setProperty('--m', color);
    e.append(h('span', 'hf-month', koikoi.MONTHS[c.month - 1]), h('span', 'hf-icon', SPECIAL[id] || icon));
    if (c.type === 'tan') e.append(h('span', 'hf-ribbon'));
    e.append(h('span', 'hf-type', { hikari: '光', tane: '種', tan: '短', kasu: '' }[c.type]));
    e.title = c.name;
    return e;
  }
  function captured(ids) {
    const box = h('div', 'hf-captured');
    for (const type of ['hikari', 'tane', 'tan', 'kasu']) {
      const list = ids.filter((i) => koikoi.CARDS[i].type === type);
      if (!list.length) continue;
      const g = h('div', 'hf-group');
      list.forEach((i) => g.append(hana(i, 'mini')));
      g.append(h('span', 'hf-count', String(list.length)));
      box.append(g);
    }
    if (!box.childElementCount) box.append(h('span', 'muted small', 'まだ取った札はありません'));
    const y = koikoi.yaku(ids);
    if (y.length) box.append(h('div', 'hf-yaku', y.map(([n, p]) => `${n} ${p}点`).join('・')));
    return box;
  }
  function renderKoikoi(el, v, act) {
    const s = v.state, me = v.you, L = local(v);
    const mine = me >= 0 ? me : 0, opp = 1 - mine;
    const root = h('div', 'hf');
    root.append(h('div', 'hf-head', `${s.month}/${s.options.months}月目・親は${nameOf(v, s.oya)}・合計 ${nameOf(v, 0)} ${s.scores[0]}点 / ${nameOf(v, 1)} ${s.scores[1]}点`));
    // 相手
    const top = h('div', 'hf-side');
    const oh = h('div', 'hf-hand opp');
    (s.hands[opp] || Array(s.handCounts[opp]).fill(null)).forEach((id) => oh.append(hana(s.hands[opp] ? id : null, 'small')));
    top.append(h('div', 'hf-who', `${nameOf(v, opp)}${s.koikoi[opp] ? '（こいこい中）' : ''}`), oh, captured(s.captured[opp]));
    root.append(top);
    // 場
    const field = h('div', 'hf-field');
    const sel = L.card;
    const matchFor = (id) => (id == null ? [] : s.field.filter((f) => koikoi.monthOf(f) === koikoi.monthOf(id)));
    const pickTargets = new Set(act && s.phase === 'drawPick' ? matchFor(s.drawn) : act && sel != null && matchFor(sel).length === 2 ? matchFor(sel) : []);
    const hilite = new Set(sel != null ? matchFor(sel) : []);
    let tk2 = 0;
    for (const id of s.field) {
      const b = h('button', 'hf-btn' + (pickTargets.has(id) ? ' target' : hilite.has(id) ? ' match' : ''));
      if (pickTargets.has(id)) hk(b, String(++tk2));
      b.append(hana(id));
      b.disabled = !pickTargets.has(id);
      b.onclick = () => (s.phase === 'drawPick' ? sendMove({ target: id }) : sendMove({ play: sel, target: id }));
      field.append(b);
    }
    const deck = h('div', 'hf-deck');
    deck.append(hana(null), h('span', 'small', `山 ${s.deckCount}`));
    if (s.drawn != null) { deck.append(h('span', 'small', 'めくった札'), hana(s.drawn, 'drawn')); }
    const ft = h('div', 'hf-table');
    ft.append(deck, field);
    root.append(ft);
    // 自分
    const bottom = h('div', 'hf-side me');
    bottom.append(captured(s.captured[mine]));
    if (s.hands[mine]) {
      const hand = h('div', 'hf-hand');
      let nk = 0;
      for (const id of s.hands[mine]) {
        const can = act && s.phase === 'play' && me >= 0;
        const b = h('button', 'hf-btn' + (sel === id ? ' sel' : '') + (can && matchFor(id).length ? ' has' : ''));
        b.append(hana(id));
        b.disabled = !can;
        if (can && !pickTargets.size) hk(b, String(++nk));
        b.onclick = () => {
          const m = matchFor(id);
          if (m.length === 2) { L.card = sel === id ? null : id; return render(); }
          if (sel === id || m.length !== 2) sendMove({ play: id });
        };
        hand.append(b);
      }
      bottom.append(h('div', 'hf-who', me >= 0 ? `あなた${s.koikoi[mine] ? '（こいこい中）' : ''}` : nameOf(v, mine)), hand);
    }
    root.append(bottom);
    if (act && s.phase === 'play') root.append(h('p', 'muted small as-help', sel != null ? '取る札を場から選んでください' : '手札をタップして出します（同じ月の札が光っていれば取れます）'));
    if (act && s.phase === 'koikoi') {
      const pts = koikoi.yakuPoints(s.captured[me]);
      const over = h('div', 'hf-koikoi');
      over.append(h('div', 'hf-koikoi-title', `役ができた！ ${pts}点`), h('div', 'small', koikoi.yaku(s.captured[me]).map(([n, p]) => `${n} ${p}点`).join('・')));
      const a = h('button', 'btn primary', '勝負（ここでやめる）'), b = h('button', 'btn', 'こいこい（続ける）');
      hk(a, 's');
      hk(b, 'k');
      a.onclick = () => sendMove({ stop: true });
      b.onclick = () => sendMove({ koikoi: true });
      const bar = h('div', 'uno-actions');
      bar.append(a, b);
      over.append(bar, h('div', 'muted small', 'こいこいすると、相手が役を作ったら相手の点が2倍になります'));
      root.append(over);
    }
    if (s.phase === 'monthEnd' && s.monthResult) {
      const r = s.monthResult;
      const over = h('div', 'hf-koikoi');
      over.append(h('div', 'hf-koikoi-title', r.winner == null ? 'この月は引き分け' : `${nameOf(v, r.winner)} が ${r.points}点！`));
      if (r.yaku.length) over.append(h('div', 'small', r.yaku.map(([n, p]) => (p ? `${n} ${p}点` : n)).join('・')));
      over.append(h('div', 'muted small', s.month >= s.options.months ? '最後の月でした' : 'もうすぐ次の月…'));
      root.append(over);
    }
    el.replaceChildren(root);
  }

  // ================= VSタンク =================
  let tk = null; // { el, canvas, ctx, snaps: [{t, s}], input, ... }
  function tkSetup(el) {
    const root = h('div', 'tk');
    const wrap = h('div', 'tk-wrap');
    const canvas = h('canvas', 'tk-canvas');
    canvas.width = tanks.W * 40; canvas.height = tanks.H * 40;
    wrap.append(canvas);
    const info = h('div', 'tk-info');
    const pads = h('div', 'tk-pads');
    const lpad = h('div', 'tk-stick left'), rpad = h('div', 'tk-stick right');
    lpad.append(h('div', 'tk-knob'));
    rpad.append(h('div', 'tk-knob'));
    const mineBtn = h('button', 'btn tk-mine', '💣 地雷');
    pads.append(lpad, mineBtn, rpad);
    root.append(info, wrap, pads, h('p', 'muted small as-help tk-help', 'パソコン: WASD か矢印キーで移動・マウスでねらってクリックで発射・スペースで地雷。スマホ: 左のスティックで移動、右のスティックでねらって指をはなすと発射'));
    el.replaceChildren(root);
    const state = { el, root, canvas, ctx: canvas.getContext('2d'), info, snaps: [], input: { mx: 0, my: 0, aim: null, fire: 0, mine: 0 }, keys: new Set(), sentAt: 0, dirty: false, raf: 0, fx: [] };
    const sendInput = (force) => {
      const t = performance.now();
      if (!force && t - state.sentAt < 50) { state.dirty = true; return; }
      state.sentAt = t;
      state.dirty = false;
      send({ type: 'move', move: { input: { ...state.input } } });
    };
    state.sendInput = sendInput;
    // キーボード
    const keyMove = () => {
      const k = state.keys;
      state.input.mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      state.input.my = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      sendInput();
    };
    state.onKey = (e) => {
      if (!view() || view().game !== 'tanks' || e.target.closest('input, textarea')) return;
      const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
      if (!codes.includes(e.code)) return;
      e.preventDefault();
      if (e.type === 'keydown') {
        if (e.code === 'Space' && !e.repeat) { state.input.mine++; sendInput(true); return; }
        state.keys.add(e.code);
      } else state.keys.delete(e.code);
      keyMove();
    };
    addEventListener('keydown', state.onKey);
    addEventListener('keyup', state.onKey);
    // マウス: ねらう・クリックで発射
    const aimAt = (cx, cy) => {
      const v = view(), me = v && v.you;
      const s = state.snaps.at(-1)?.s;
      if (!s || me < 0 || !s.tanks[me]) return;
      const r = canvas.getBoundingClientRect();
      const x = (cx - r.left) / r.width * tanks.W, y = (cy - r.top) / r.height * tanks.H;
      state.input.aim = Math.atan2(y - s.tanks[me].y, x - s.tanks[me].x);
    };
    canvas.addEventListener('mousemove', (e) => { aimAt(e.clientX, e.clientY); sendInput(); });
    canvas.addEventListener('mousedown', (e) => { e.preventDefault(); aimAt(e.clientX, e.clientY); if (e.button === 2) state.input.mine++; else state.input.fire++; sendInput(true); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // スティック（スマホ）
    const stick = (pad, onMove, onEnd) => {
      let id = null;
      const knob = pad.firstChild;
      const pos = (e) => {
        const r = pad.getBoundingClientRect();
        let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        knob.style.transform = `translate(${dx * 50}%, ${dy * 50}%)`;
        return [dx, dy];
      };
      pad.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; try { pad.setPointerCapture(id); } catch { /* そのまま */ } onMove(...pos(e)); });
      pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) onMove(...pos(e)); });
      const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; onEnd(); };
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
    };
    stick(lpad, (dx, dy) => { const l = Math.hypot(dx, dy); state.input.mx = l > 0.2 ? dx : 0; state.input.my = l > 0.2 ? dy : 0; sendInput(); },
      () => { state.input.mx = state.input.my = 0; sendInput(true); });
    let aimed = false;
    stick(rpad, (dx, dy) => { if (Math.hypot(dx, dy) > 0.25) { state.input.aim = Math.atan2(dy, dx); aimed = true; sendInput(); } },
      () => { state.input.fire++; aimed = false; sendInput(true); });
    mineBtn.addEventListener('click', () => { state.input.mine++; sendInput(true); });
    // 送りそびれた入力
    state.flush = setInterval(() => { if (state.dirty) sendInput(true); }, 60);
    const loop = () => { state.raf = requestAnimationFrame(loop); tkDraw(state); };
    state.raf = requestAnimationFrame(loop);
    return state;
  }
  let viewRef = null;
  const view = () => viewRef;
  function tkTeardown() {
    if (!tk) return;
    cancelAnimationFrame(tk.raf);
    clearInterval(tk.flush);
    removeEventListener('keydown', tk.onKey);
    removeEventListener('keyup', tk.onKey);
    tk = null;
  }
  function renderTanks(el, v) {
    viewRef = v;
    if (!tk || tk.el !== el || !el.contains(tk.root)) { tkTeardown(); tk = tkSetup(el); }
    const s = v.state;
    const t = performance.now();
    // 新しいラウンドになったら補間をやり直す
    if (tk.snaps.length && (tk.snaps.at(-1).s.round !== s.round || tk.snaps.at(-1).code !== v.code)) tk.snaps = [];
    tk.snaps.push({ t, s, code: v.code });
    if (tk.snaps.length > 3) tk.snaps.shift();
    // 爆発の演出を覚える
    const seen = new Set(tk.fx.map((f) => f.id));
    for (const b of s.blasts || []) if (!seen.has(b.id)) tk.fx.push({ ...b, start: t });
    tk.info.replaceChildren(players(v, (i) => `${s.wins[i]}勝`, (chip, i) => { const sw = h('span', 'as-swatch'); sw.style.background = tanks.COLORS[i]; chip.prepend(sw); }));
    tk.root.classList.toggle('spectating', v.you < 0);
  }
  function tkDraw(st) {
    if (!st.snaps.length) return;
    if (!document.body.contains(st.canvas)) { tkTeardown(); return; }
    const now2 = performance.now();
    const a = st.snaps.length > 1 ? st.snaps[st.snaps.length - 2] : st.snaps.at(-1), b = st.snaps.at(-1);
    const span = Math.max(1, b.t - a.t);
    const k = Math.min(1, (now2 - b.t) / span); // 1つ前から今への補間
    const lerp = (x, y) => x + (y - x) * k;
    const s = b.s, ps = a.s;
    const c = st.ctx, Z = 40;
    c.clearRect(0, 0, st.canvas.width, st.canvas.height);
    c.fillStyle = '#efe6cf';
    c.fillRect(0, 0, st.canvas.width, st.canvas.height);
    c.strokeStyle = 'rgba(0,0,0,.05)';
    for (let x = 0; x <= tanks.W; x++) { c.beginPath(); c.moveTo(x * Z, 0); c.lineTo(x * Z, tanks.H * Z); c.stroke(); }
    for (let y = 0; y <= tanks.H; y++) { c.beginPath(); c.moveTo(0, y * Z); c.lineTo(tanks.W * Z, y * Z); c.stroke(); }
    tanks.MAPS[s.map].forEach((row, r) => [...row].forEach((ch, col) => {
      if (ch !== '#') return;
      c.fillStyle = '#8d6e4f'; c.fillRect(col * Z, r * Z, Z, Z);
      c.fillStyle = '#a9865f'; c.fillRect(col * Z + 3, r * Z + 3, Z - 6, Z - 10);
    }));
    // 地雷
    for (const m of s.mines) {
      c.fillStyle = '#ffd43b'; c.beginPath(); c.arc(m.x * Z, m.y * Z, tanks.MINE_R * Z, 0, Math.PI * 2); c.fill();
      c.fillStyle = m.late && Math.floor(now2 / 150) % 2 ? '#ff0000' : m.armed ? '#c92a2a' : '#888';
      c.beginPath(); c.arc(m.x * Z, m.y * Z, tanks.MINE_R * Z * 0.45, 0, Math.PI * 2); c.fill();
    }
    // 戦車
    s.tanks.forEach((t, i) => {
      const p0 = ps.tanks && ps.tanks[i] ? ps.tanks[i] : t;
      const x = lerp(p0.x, t.x) * Z, y = lerp(p0.y, t.y) * Z;
      if (!t.alive) {
        c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(x, y, tanks.TANK_R * Z, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#333'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 9, y - 9); c.lineTo(x + 9, y + 9); c.moveTo(x + 9, y - 9); c.lineTo(x - 9, y + 9); c.stroke();
        return;
      }
      c.save(); c.translate(x, y); c.rotate(t.a);
      c.fillStyle = '#333'; c.fillRect(-16, -15, 32, 6); c.fillRect(-16, 9, 32, 6);
      c.fillStyle = tanks.COLORS[i]; c.fillRect(-14, -11, 28, 22);
      c.restore();
      c.save(); c.translate(x, y); c.rotate(t.t);
      c.fillStyle = '#222'; c.fillRect(0, -3.5, 22, 7);
      c.fillStyle = tanks.COLORS[i]; c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
      c.restore();
      if (viewRef && viewRef.you === i) { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.arc(x, y, tanks.TANK_R * Z + 6, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
    });
    // 弾
    const prevB = new Map((ps.bullets || []).map((x) => [x.id, x]));
    for (const bl of s.bullets) {
      const p0 = prevB.get(bl.id) || bl;
      c.fillStyle = '#222'; c.beginPath(); c.arc(lerp(p0.x, bl.x) * Z, lerp(p0.y, bl.y) * Z, tanks.BULLET_R * Z * 1.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = tanks.COLORS[bl.by]; c.beginPath(); c.arc(lerp(p0.x, bl.x) * Z, lerp(p0.y, bl.y) * Z, tanks.BULLET_R * Z * 0.6, 0, Math.PI * 2); c.fill();
    }
    // 爆発
    st.fx = st.fx.filter((f) => now2 - f.start < 700);
    for (const f of st.fx) {
      const q = (now2 - f.start) / 700;
      const r = (f.small ? 0.5 : f.tank != null ? 1.1 : tanks.BLAST_R) * Z * (0.4 + q * 0.8);
      c.fillStyle = `rgba(255,${Math.round(180 - q * 120)},40,${0.8 * (1 - q)})`;
      c.beginPath(); c.arc(f.x * Z, f.y * Z, r, 0, Math.PI * 2); c.fill();
    }
    // 表示
    c.textAlign = 'center';
    c.font = 'bold 44px sans-serif';
    if (s.phase === 'count') {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, st.canvas.width, st.canvas.height);
      c.fillStyle = '#fff'; c.fillText(`ラウンド ${s.round}`, st.canvas.width / 2, st.canvas.height / 2 - 10);
      c.font = 'bold 24px sans-serif'; c.fillText('READY…', st.canvas.width / 2, st.canvas.height / 2 + 30);
    } else if (s.phase === 'roundEnd') {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, st.canvas.width, st.canvas.height);
      c.fillStyle = '#fff';
      const w = s.roundWinner;
      c.fillText(w == null ? '相打ち！' : `${viewRef ? nameOf(viewRef, w) : ''} の勝ち！`, st.canvas.width / 2, st.canvas.height / 2);
    }
  }

  // ================= ヒット&ブロー（ボール） =================
  function ball(c, extra = '') {
    const e = h('span', 'hbb-ball ' + extra);
    if (c == null) e.classList.add('empty');
    else e.style.setProperty('--c', hbball.COLORS[c]);
    return e;
  }
  function renderHbball(el, v, act) {
    const s = v.state, me = v.you, L = local(v);
    L.pick = L.pick || [];
    const root = h('div', 'hbb');
    root.append(players(v, (i) => `${s.guesses.filter((g) => g.by === i).length}回`));
    const secret = h('div', 'hbb-secret');
    secret.append(h('span', 'small', 'ひみつの並び：'));
    for (let i = 0; i < hbball.LEN; i++) secret.append(s.secret ? ball(s.secret[i], 'big') : h('span', 'hbb-ball big hidden', '?'));
    root.append(secret);
    const list = h('div', 'hbb-list');
    s.guesses.forEach((g, k) => {
      const row = h('div', 'hbb-row' + (g.by === me ? ' mine' : '') + (k === s.guesses.length - 1 ? ' last' : ''));
      row.append(h('span', 'hbb-who', nameOf(v, g.by)));
      const balls = h('span', 'hbb-balls');
      g.guess.forEach((c) => balls.append(ball(c)));
      row.append(balls, h('span', 'hbb-res', `${g.hit}ヒット ${g.blow}ブロー`));
      const pegs = h('span', 'hbb-pegs');
      for (let i = 0; i < g.hit; i++) pegs.append(h('span', 'hbb-peg hit'));
      for (let i = 0; i < g.blow; i++) pegs.append(h('span', 'hbb-peg blow'));
      row.append(pegs);
      list.append(row);
    });
    if (!s.guesses.length) list.append(h('p', 'muted small', 'まだだれも予想していません'));
    root.append(list);
    if (act) {
      const input = h('div', 'hbb-input');
      const slots = h('div', 'hbb-slots');
      for (let i = 0; i < hbball.LEN; i++) {
        const b = h('button', 'hbb-slot');
        b.append(ball(L.pick[i]));
        if (i === L.pick.length - 1) hk(b, 'backspace');
        b.onclick = () => { L.pick.splice(i, 1); render(); };
        slots.append(b);
      }
      const palette = h('div', 'hbb-palette');
      hbball.COLORS.forEach((_, c) => {
        const b = h('button', 'hbb-color');
        b.append(ball(c, 'big'));
        b.disabled = L.pick.length >= hbball.LEN || (!s.options.dup && L.pick.includes(c));
        b.title = hbball.COLOR_NAMES[c];
        hk(b, String(c + 1));
        b.onclick = () => { L.pick.push(c); render(); };
        palette.append(b);
      });
      const go = hk(h('button', 'btn primary', '予想する'), 'enter');
      go.disabled = L.pick.length !== hbball.LEN;
      go.onclick = () => sendMove({ guess: L.pick.slice() });
      input.append(slots, palette, go, h('p', 'muted small', '色をタップして左から並べます（並べたボールをタップで外せる）。ヒット＝色も場所も正解、ブロー＝色だけ正解'));
      root.append(input);
    }
    el.replaceChildren(root);
  }

  // ================= チンチロ =================
  let ccRollKey = '';
  function renderChinchiro(el, v) {
    const s = v.state, me = v.you;
    const root = h('div', 'cr');
    root.append(players(v, (i) => `${s.chips[i]}枚`, (chip, i) => { if (i === s.parent && !s.result) chip.prepend(h('span', 'cr-oya', '親')); }));
    root.append(h('div', 'muted small cr-head', s.result ? '' : `第${s.hand}/${s.players * s.options.laps}回・親は ${nameOf(v, s.parent)}`));
    // どんぶり（今ふっている人か、最後にふった人のサイコロ）
    const who = s.phase === 'roll' ? s.turn : s.last ? s.last.by : null;
    const r = who != null ? s.rolls[who] : null;
    const bowl = h('div', 'cr-bowl');
    const key = s.last ? `${v.code}:${s.last.at}` : '';
    const fresh = key && key !== ccRollKey;
    ccRollKey = key;
    const dice = h('div', 'cr-dice' + (fresh ? ' rolling' : ''));
    (r ? r.dice : [1, 2, 3]).forEach((d) => dice.append(h('span', 'cr-die' + (r ? '' : ' idle'), DIE[d])));
    bowl.append(dice);
    if (r) bowl.append(h('div', 'cr-role ' + r.role.kind, `${nameOf(v, who)}：${r.role.name}${r.role.final ? '' : `（あと${3 - r.tries}回ふれる）`}`));
    else bowl.append(h('div', 'cr-role', s.phase === 'bet' ? '子がチップを賭けています…' : ''));
    root.append(bowl);
    // みんなの賭けと役
    const list = h('div', 'cr-list');
    for (let p = 0; p < s.players; p++) {
      if (!v.seats[p]) continue;
      const row = h('div', 'cr-row' + (p === me ? ' me' : '') + (p === s.turn && s.phase === 'roll' ? ' turn' : '') + (s.out[p] ? ' out' : ''));
      row.append(h('span', 'cr-name', `${p === s.parent ? '👑 ' : ''}${nameOf(v, p)}`));
      const info = [];
      if (p === s.parent) info.push('親');
      else if (s.bets[p] != null) info.push(`賭け ${s.bets[p]}`);
      else if (s.phase === 'bet' && s.chips[p] > 0 && !s.out[p]) info.push('考え中…');
      if (s.rolls[p]) info.push(s.rolls[p].role.name);
      row.append(h('span', 'cr-info', info.join('・')));
      const o = s.outcome && s.outcome[p];
      if (o) row.append(h('span', 'cr-gain ' + (o.gain > 0 ? 'win' : o.gain < 0 ? 'lose' : ''), `${o.gain >= 0 ? '+' : ''}${o.gain}`));
      list.append(row);
    }
    root.append(list);
    // 操作
    if (me >= 0 && !s.out[me] && !s.result) {
      const bar = h('div', 'uno-actions');
      if (s.phase === 'bet' && me !== s.parent && s.bets[me] == null && s.chips[me] > 0) {
        bar.append(h('span', 'small', '賭けるチップ：'));
        let nk = 0;
        for (const b of [...chinchiro.BETS, s.chips[me]].filter((x, i, a) => x <= s.chips[me] && a.indexOf(x) === i)) {
          const btn = h('button', 'btn primary', b === s.chips[me] && !chinchiro.BETS.includes(b) ? `全部（${b}）` : String(b));
          hk(btn, String(++nk));
          btn.onclick = () => move({ bet: b });
          bar.append(btn);
        }
      }
      if (s.phase === 'roll' && s.turn === me) {
        const b = hk(h('button', 'btn primary big', s.rolls[me] ? 'もう一度ふる' : 'サイコロをふる'), 'space enter');
        b.onclick = () => move({ roll: true });
        bar.append(b);
      }
      if (bar.childElementCount) root.append(bar);
    }
    root.append(h('p', 'muted small as-help', '役: ピンゾロ(1・1・1) 5倍 ＞ ゾロ目 3倍 ＞ シゴロ(4・5・6) 2倍 ＞ 目(6〜1)。ヒフミ(1・2・3)は2倍払い、3回で役なしは目なし'));
    el.replaceChildren(root);
  }

  // Esc・右クリック: 選んでいる途中のものをやめる
  const clear = () => { ui.data = {}; lcArmed = false; };
  return { clear, renderers: {
    morris: renderMorris, hex: renderHex, checkers: renderCheckers, domino: renderDomino, ccheckers: renderCChecker, ludo: renderLudo,
    sevens: renderSevens, speed: renderSpeed, memory: renderMemory, blackjack: renderBlackjack, lastcard: renderLastcard,
    pigtail: renderPigtail, yacht: renderYacht, koikoi: renderKoikoi, tanks: renderTanks, hbball: renderHbball, chinchiro: renderChinchiro,
  } };
}
