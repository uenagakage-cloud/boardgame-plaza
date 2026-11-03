// お絵かきゲーム（絵しりとり・絵の伝言ゲーム）の画面
// 描いている途中の絵はこの画面が覚えていて、1本描くごとにサーバーへ送る（絵しりとりはみんなにリアルタイムで見える。伝言ゲームは送られない）。
// 画面を描き直しても描いている途中の線や入力中の文字が消えないよう、骨組みは作り直さず中身だけ入れかえる。
import * as drawing from './games/drawing.js';
import * as eshiritori from './games/eshiritori.js';
import * as edengon from './games/edengon.js';

const { WIDTH, HEIGHT, COLORS, COLOR_NAMES } = drawing;
const ERASER_WIDTH = 36;

export function drawShapes(ctx, shapes, preview) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const one = (sh) => {
    ctx.strokeStyle = sh.type === 'erase' ? '#fffdf7' : COLORS[sh.c || 0];
    ctx.lineWidth = sh.type === 'erase' ? ERASER_WIDTH : 7;
    ctx.beginPath();
    if (sh.pts) {
      ctx.moveTo(sh.pts[0][0], sh.pts[0][1]);
      for (const [px, py] of sh.pts.slice(1)) ctx.lineTo(px, py);
    } else if (sh.type === 'line') { ctx.moveTo(sh.x1, sh.y1); ctx.lineTo(sh.x2, sh.y2); }
    else ctx.arc(sh.x1, sh.y1, Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1), 0, Math.PI * 2);
    ctx.stroke();
  };
  for (const sh of shapes || []) one(sh);
  if (preview) one(preview);
}

export function drawGameRenderers({ h, sendMove, choose, now, toast }) {
  const nameOf = (v, seat) => (seat < 0 ? 'お題' : v.seats[seat]?.name || '?');
  const thumb = (shapes, cls = 'dr-thumb') => {
    const cv = h('canvas', cls);
    cv.width = WIDTH;
    cv.height = HEIGHT;
    drawShapes(cv.getContext('2d'), shapes);
    return cv;
  };

  // ---------- お絵かきの板（1つだけ作って使い回す） ----------
  let tool = 'pen', color = 0;
  const pad = (() => {
    const root = h('div', 'dr-pad');
    const canvas = h('canvas', 'dr-canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    const tools = h('div', 'dr-tools');
    const colors = h('div', 'dr-colors');
    root.append(canvas, tools, colors);
    const p = { root, canvas, shapes: [], key: null, drag: null, enabled: false };
    const redraw = () => drawShapes(ctx, p.shapes, p.drag && { ...p.drag, c: color });
    p.redraw = redraw;
    // サーバーへ送って、手元の絵にも同じように当てはめる
    const act = (mv) => {
      try { p.shapes = drawing.applyDraw(p.shapes, mv); } catch (e) { toast(e.message); return; }
      redraw();
      sendMove(mv);
    };
    const toolBtn = (key, text) => {
      const b = h('button', 'btn small dr-tool', text);
      b.type = 'button';
      b.dataset.tool = key;
      b.onclick = () => { tool = key; paintTools(); };
      return b;
    };
    const undo = h('button', 'btn small', '1つ戻す');
    undo.type = 'button';
    undo.onclick = () => { if (p.shapes.length) act({ undo: true }); };
    const clear = h('button', 'btn small', '全部消す');
    clear.type = 'button';
    clear.onclick = async () => { if (p.shapes.length && await choose('全部消しますか？', [['yes', '消す'], [null, 'キャンセル']])) act({ clear: true }); };
    tools.append(toolBtn('pen', '✎ ペン'), toolBtn('line', '／ 直線'), toolBtn('circle', '◯ 円'), toolBtn('eraser', '🧽 消しゴム'), undo, clear);
    COLORS.forEach((c, i) => {
      const b = h('button', 'dr-color');
      b.type = 'button';
      b.style.background = c;
      b.title = COLOR_NAMES[i];
      b.onclick = () => { color = i; if (tool === 'eraser') tool = 'pen'; paintTools(); };
      colors.append(b);
    });
    const paintTools = () => {
      tools.querySelectorAll('.dr-tool').forEach((b) => b.classList.toggle('primary', b.dataset.tool === tool));
      colors.querySelectorAll('.dr-color').forEach((b, i) => b.classList.toggle('on', i === color && tool !== 'eraser'));
    };
    paintTools();
    const point = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * (WIDTH / r.width), (e.clientY - r.top) * (HEIGHT / r.height)];
    };
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (!p.enabled) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 取れなくても描ける */ }
      const [x, y] = point(e);
      p.drag = tool === 'pen' ? { type: 'path', pts: [[x, y]] } : tool === 'eraser' ? { type: 'erase', pts: [[x, y]] } : { type: tool, x1: x, y1: y, x2: x, y2: y };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!p.drag) return;
      const [x, y] = point(e);
      if (p.drag.pts) {
        const last = p.drag.pts[p.drag.pts.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) >= 3) p.drag.pts.push([x, y]);
      } else [p.drag.x2, p.drag.y2] = [x, y];
      redraw();
    });
    const finish = () => {
      const sh = p.drag;
      p.drag = null;
      if (!sh) return;
      if (sh.pts) {
        let pts = sh.pts.length === 1 ? [sh.pts[0], [sh.pts[0][0] + 1, sh.pts[0][1]]] : sh.pts;
        if (pts.length > drawing.MAX_PATH_POINTS) {
          const step = pts.length / drawing.MAX_PATH_POINTS;
          pts = Array.from({ length: drawing.MAX_PATH_POINTS }, (_, i) => pts[Math.min(pts.length - 1, Math.round(i * step))]);
        }
        act({ stroke: { type: sh.type, c: color, pts: pts.map(([x, y]) => [Math.round(x), Math.round(y)]) } });
      } else if (Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1) >= 6) {
        act({ stroke: { type: sh.type, c: color, x1: Math.round(sh.x1), y1: Math.round(sh.y1), x2: Math.round(sh.x2), y2: Math.round(sh.y2) } });
      } else redraw();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', () => { p.drag = null; redraw(); });
    // 新しいお題になったら、サーバーにある下書きから始める（読み込み直したときも続きが描ける）
    p.load = (key, shapes, enabled) => {
      if (p.key !== key) { p.key = key; p.shapes = (shapes || []).slice(); p.drag = null; }
      p.enabled = enabled;
      canvas.classList.toggle('drawing', enabled);
      tools.hidden = colors.hidden = !enabled;
      redraw();
    };
    return p;
  })();

  // 骨組み（ゲームごと）。入力欄を消さないよう、同じ画面のあいだは作り直さない
  let ui = null;
  function skeleton(el, game) {
    if (ui && ui.el === el && ui.game === game && el.contains(ui.root)) return ui;
    const root = h('div', 'dr');
    const head = h('div', 'dr-head');
    const info = h('div', 'dr-info');
    const timer = h('div', 'dr-timer');
    head.append(info, timer);
    const top = h('div', 'dr-top');
    const padSlot = h('div', 'dr-pad-slot');
    const form = h('form', 'dr-form row');
    const input = h('input');
    input.maxLength = 40;
    input.autocomplete = 'off';
    const ok = h('button', 'btn primary', '出す');
    form.append(input, ok);
    const actions = h('div', 'dr-actions');
    const bottom = h('div', 'dr-bottom');
    root.append(head, top, padSlot, form, actions, bottom);
    el.replaceChildren(root);
    ui = { el, game, root, info, timer, top, padSlot, form, input, ok, actions, bottom, formKey: null };
    form.addEventListener('submit', (e) => { e.preventDefault(); ui.onSubmit?.(input.value.trim()); });
    return ui;
  }
  // 入力欄の中身は、お題が変わったときだけ空にする
  function setForm(key, show, placeholder, button) {
    ui.form.hidden = !show;
    if (ui.formKey !== key) { ui.formKey = key; ui.input.value = ''; }
    ui.input.placeholder = placeholder;
    ui.ok.textContent = button;
  }
  function showPad(show) {
    if (show && pad.root.parentNode !== ui.padSlot) ui.padSlot.append(pad.root);
    if (!show && pad.root.parentNode) pad.root.remove();
  }
  function chips(v, label) {
    const box = h('div', 'uno-players dr-chips');
    v.seats.forEach((p, i) => {
      const [text, cls] = label(i);
      const chip = h('div', 'wb-player' + (i === v.you ? ' me' : '') + (v.state.out[i] ? ' out' : '') + (cls || ''));
      chip.append(h('span', 'pname', p ? p.name : '?'));
      if (text) chip.append(h('span', 'wb-count', text));
      box.append(chip);
    });
    return box;
  }
  const btn = (text, cls, onclick) => { const b = h('button', 'btn ' + (cls || ''), text); b.type = 'button'; b.onclick = onclick; return b; };

  function updateTimer() {
    if (!ui || !document.body.contains(ui.root)) return;
    const s = ui.state;
    if (!s || !s.endsAt || s.result) { ui.timer.textContent = ''; return; }
    const left = Math.max(0, Math.ceil((s.endsAt - now()) / 1000));
    ui.timer.textContent = `${left}秒`;
    ui.timer.classList.toggle('hurry', left <= 10);
  }
  setInterval(updateTimer, 250);

  // ================= 絵しりとり =================
  function renderShiritori(el, v) {
    const s = v.state, me = v.you;
    skeleton(el, 'eshiritori');
    ui.state = s;
    updateTimer();
    const drawingNow = s.phase === 'draw' && me === s.turn;
    const done = s.chain.length;
    ui.info.textContent = s.phase === 'end' ? '答え合わせ' : `${Math.min(done + 1, s.total)}/${s.total}枚目・描く人：${nameOf(v, s.turn)}`;
    ui.top.replaceChildren();
    ui.actions.replaceChildren();
    ui.bottom.replaceChildren();

    if (s.phase === 'end') {
      showPad(false);
      setForm('end', false, '', '');
      const list = h('div', 'dr-chain');
      const start = h('div', 'dr-card start');
      start.append(h('div', 'dr-word big', `「${s.start}」`), h('div', 'muted small', 'はじめの文字'));
      list.append(start);
      s.chain.forEach((e, i) => {
        const prev = i ? s.chain[i - 1].word : s.start;
        const ok = eshiritori.links(prev, e.word);
        list.append(h('div', 'dr-link ' + (ok ? 'ok' : 'ng'), ok ? `○ 「${eshiritori.lastKana(prev || '？')}」でつながった` : '× つながらなかった'));
        const card = h('div', 'dr-card' + (ok ? '' : ' ng'));
        card.append(thumb(e.shapes), h('div', 'dr-word', e.word || '（時間切れ）'), h('div', 'muted small', `${nameOf(v, e.seat)} さんの絵`));
        list.append(card);
      });
      ui.top.append(h('div', 'dr-score', `${s.chain.length}枚中 ${s.linked}回つながった！`), list);
      return;
    }

    if (drawingNow) {
      // 前の人の絵（最初の人は、はじめの文字）
      const prevBox = h('div', 'dr-prev');
      if (s.prev) prevBox.append(h('div', 'dr-label', `${nameOf(v, s.prev.seat)} さんの絵（何の絵か考えて、最後の文字から始まる言葉を描こう）`), thumb(s.prev.shapes, 'dr-thumb prev'));
      else prevBox.append(h('div', 'dr-label', 'はじめの文字'), h('div', 'dr-word big', `「${s.start}」から始まる言葉を描こう`));
      ui.top.append(prevBox);
      // その前の絵も並べて、前の絵のお題を予想するヒントにする（新しい順）
      if (s.chain.length >= 2) {
        const older = s.chain.slice(0, -1).map((e, i) => [e, i]).reverse();
        ui.top.append(logBox(v, `その前の絵（ヒントに）`, older.map(([e, i]) => [e, `${s.chain.length - i}つ前・${nameOf(v, e.seat)} さん`])));
      }
      showPad(true);
      pad.load(`${v.code}:${v.gameNo}:${done}`, s.draft, true);
      setForm(`${v.code}:${v.gameNo}:${done}`, true, '描いた言葉（ひらがな。例：りんご→ごりら）', 'できた！');
      ui.onSubmit = (word) => {
        let w;
        try { w = eshiritori.checkWord(word); } catch (e) { toast(e.message); return; }
        if (!pad.shapes.some((x) => x.type !== 'erase')) { toast('絵を描いてください'); return; }
        sendMove({ submit: true, word: w });
      };
      ui.actions.append(h('span', 'muted small', '言葉は答え合わせまでほかの人には見えません。文字は絵に書かないでね'));
    } else {
      showPad(false);
      setForm('wait', false, '', '');
      // 描いているところをリアルタイムで見せる（言葉はひみつ）
      ui.top.append(h('div', 'dr-label', `✏️ ${nameOf(v, s.turn)} さんが描いています（リアルタイム）`), thumb(s.draft, 'dr-thumb live'));
      // 描き終わった絵のログ（言葉は答え合わせまでひみつ）
      if (s.chain.length) ui.top.append(logBox(v, `描き終わった絵（${s.chain.length}枚・言葉は答え合わせまでひみつ）`, s.chain.map((e, i) => [e, `${i + 1}. ${nameOf(v, e.seat)} さん`])));
    }
    ui.bottom.append(chips(v, (i) => [`${s.chain.filter((e) => e.seat === i).length}枚`, i === s.turn ? ' turn' : '']));
  }
  // 絵の一覧。items = [[{ shapes }, 説明], ...]
  function logBox(v, title, items) {
    const log = h('div', 'dr-log');
    log.append(h('div', 'dr-label', title));
    const grid = h('div', 'dr-log-grid');
    for (const [e, text] of items) {
      const card = h('div', 'dr-log-card');
      card.append(thumb(e.shapes), h('div', 'muted small', text));
      grid.append(card);
    }
    log.append(grid);
    return log;
  }

  // ================= 絵の伝言ゲーム =================
  function itemView(v, it) {
    const box = h('div', 'dr-item ' + it.kind);
    box.append(h('div', 'dr-label', it.seat < 0 ? '最初のお題' : `${nameOf(v, it.seat)} さん${it.kind === 'draw' ? 'の絵' : 'の言葉'}`));
    if (it.kind === 'draw') box.append(thumb(it.shapes));
    else box.append(h('div', 'dr-word big', it.text));
    return box;
  }
  function renderDengon(el, v) {
    const s = v.state, me = v.you;
    skeleton(el, 'edengon');
    ui.state = s;
    updateTimer();
    ui.top.replaceChildren();
    ui.actions.replaceChildren();
    ui.bottom.replaceChildren();
    const host = me >= 0 && me === v.hostSeat;

    if (s.phase === 'reveal' || s.phase === 'end') {
      showPad(false);
      setForm('reveal', false, '', '');
      const show = s.phase === 'end' ? [...s.chains.keys()] : [s.reveal.chain];
      ui.info.textContent = s.phase === 'end' ? 'みんなの伝言' : `伝言の発表（${s.reveal.chain + 1}/${s.players}）`;
      for (const c of show) {
        const ch = s.chains[c];
        const first = ch.items[0];
        const box = h('div', 'dr-story');
        box.append(h('div', 'dr-story-title', `${nameOf(v, first && first.seat >= 0 ? first.seat : c)} さんから始まる伝言`));
        ch.items.forEach((it, i) => { if (i) box.append(h('div', 'dr-arrow', '↓')); box.append(itemView(v, it)); });
        ui.top.append(box);
      }
      if (s.phase === 'reveal') {
        if (host) {
          ui.actions.append(btn('次を見せる ▶', 'primary', () => sendMove({ next: true })), btn('最後まで全部見せる', '', () => sendMove({ showAll: true })));
        } else ui.actions.append(h('span', 'muted', 'ホストが発表を進めます'));
        // 新しく出たものが見えるように
        requestAnimationFrame(() => ui.top.lastElementChild?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
      return;
    }

    const t = s.task;
    const kind = edengon.kindAt(s, s.step);
    ui.info.textContent = `${s.step + 1}/${s.steps}：${kind === 'draw' ? 'お絵かき' : s.step === 0 ? 'お題を書く' : '何の絵か書く'}`;
    const key = `${v.code}:${v.gameNo}:${s.step}`;
    if (!t) {
      showPad(false);
      setForm(key, false, '', '');
      ui.top.append(h('div', 'dr-wait', 'みんなが考えています…'));
    } else if (t.done) {
      showPad(false);
      setForm(key, false, '', '');
      ui.top.append(h('div', 'dr-wait', '出しました！ ほかの人を待っています'));
      if (t.mine) ui.top.append(itemView(v, t.mine));
      ui.actions.append(btn('直す', '', () => sendMove({ unsubmit: true })));
    } else if (t.kind === 'draw') {
      const prompt = h('div', 'dr-prompt');
      prompt.append(h('span', 'muted', 'これを絵にしよう：'), h('b', null, t.prev ? t.prev.text : '？'));
      ui.top.append(prompt);
      showPad(true);
      pad.load(key, s.draft, true);
      setForm(key, false, '', '');
      ui.actions.append(btn('できた！', 'primary', () => {
        if (!pad.shapes.some((x) => x.type !== 'erase')) { toast('絵を描いてください'); return; }
        sendMove({ submit: true });
      }), h('span', 'muted small', '文字は書かないでね。時間切れのときは、描いたところまでが出されます'));
    } else {
      showPad(false);
      if (t.prev) {
        ui.top.append(h('div', 'dr-label', 'この絵は何？'), thumb(t.prev.shapes, 'dr-thumb prev'));
        setForm(key, true, '何の絵か書こう', '出す');
      } else {
        ui.top.append(h('div', 'dr-wait', '最初のお題を書こう。となりの人がこれを絵にします'));
        setForm(key, true, 'お題（例：雪だるまを作るペンギン）', '出す');
      }
      ui.onSubmit = (text) => { if (text) sendMove({ text }); };
    }
    ui.bottom.append(chips(v, (i) => [s.out[i] ? '' : s.done[i] ? '済み' : '考え中', s.done[i] ? ' done' : '']));
  }

  return {
    clear: () => { ui = null; pad.key = null; },
    renderers: { eshiritori: renderShiritori, edengon: renderDengon },
  };
}
