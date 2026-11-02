// お絵かきゲーム（絵しりとり・絵の伝言ゲーム）で使う絵のデータ（サーバーとブラウザで共通）
// 絵は図形の配列。座標は 0〜1000 × 0〜750、c は色の番号（COLORS）。
//   { type: 'path', pts: [[x, y], ...], c } ペン / { type: 'erase', pts } 消しゴム（背景の色で太くなぞる）
//   { type: 'line' | 'circle', x1, y1, x2, y2, c } 直線・円（円は中心→半径）
// 描いている途中の手はみんなには送らない（quietMove）。描き終わって「できた」で出す。
export const WIDTH = 1000;
export const HEIGHT = 750;
export const COLORS = ['#1d1d1d', '#e0261b', '#1f6fd1', '#2a9d5c', '#f0b400', '#8a5a2b', '#ff7eb0'];
export const COLOR_NAMES = ['黒', '赤', '青', '緑', '黄', '茶', 'ピンク'];
export const MAX_SHAPES = 400;
export const MAX_PATH_POINTS = 400; // 1本の線の点の数
export const MAX_TOTAL_POINTS = 12000; // 絵1枚の点の数（送るデータが大きくなりすぎないように）

const num = (x, max) => Math.max(0, Math.min(max, Math.round(Number(x) || 0)));
const countPoints = (shapes) => shapes.reduce((a, x) => a + (x.pts ? x.pts.length : 2), 0);

// 描く手か（みんなには送らない）
export const isDrawMove = (mv) => !!(mv && (mv.stroke || mv.undo || mv.clear));

// 描く手を絵に当てはめた新しい配列を返す
export function applyDraw(shapes, mv) {
  if (mv.undo) return shapes.slice(0, -1);
  if (mv.clear) return [];
  const sh = mv.stroke;
  if (!sh || typeof sh !== 'object') throw new Error('描けません');
  if (shapes.length >= MAX_SHAPES) throw new Error(`これ以上描けません（${MAX_SHAPES}個まで）`);
  const c = Number.isInteger(sh.c) && sh.c >= 0 && sh.c < COLORS.length ? sh.c : 0;
  if (sh.type === 'path' || sh.type === 'erase') {
    const pts = Array.isArray(sh.pts) ? sh.pts.slice(0, MAX_PATH_POINTS).map((p) => [num(p && p[0], WIDTH), num(p && p[1], HEIGHT)]) : [];
    if (pts.length < 2) throw new Error('線が短すぎます');
    if (countPoints(shapes) + pts.length > MAX_TOTAL_POINTS) throw new Error('これ以上描けません。「1つ戻す」か「全部消す」をしてください');
    return [...shapes, sh.type === 'erase' ? { type: 'erase', pts } : { type: 'path', pts, c }];
  }
  if (sh.type !== 'line' && sh.type !== 'circle') throw new Error('その道具は使えません');
  return [...shapes, { type: sh.type, x1: num(sh.x1, WIDTH), y1: num(sh.y1, HEIGHT), x2: num(sh.x2, WIDTH), y2: num(sh.y2, HEIGHT), c }];
}

// 書いた言葉を比べやすくする（全角/半角・カタカナ/ひらがな・空白の違いは無視）
export function normalizeText(text) {
  return String(text || '').normalize('NFKC').trim()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}
