// 論理解像度 (W x H) のキャンバスを、親要素に収まるよう拡大縮小する
export function createView(canvas, W, H) {
  const ctx = canvas.getContext('2d');
  const view = { canvas, ctx, W, H, scale: 1 };
  view.resize = () => {
    const parent = canvas.parentElement;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    const scale = Math.max(0.1, Math.min(pw / W, ph / H));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = `${Math.floor(W * scale)}px`;
    canvas.style.height = `${Math.floor(H * scale)}px`;
    canvas.width = Math.floor(W * scale * dpr);
    canvas.height = Math.floor(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    view.scale = scale;
  };
  view.resize();
  const ro = new ResizeObserver(() => view.resize());
  ro.observe(canvas.parentElement);
  view.destroy = () => ro.disconnect();
  return view;
}

export function pixelText(ctx, text, x, y, { size = 12, color = '#535353', align = 'left', bold = true } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px "Press Start 2P", "DotGothic16", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}
