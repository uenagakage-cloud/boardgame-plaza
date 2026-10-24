// クライアント設定
// クライアントを GitHub Pages など別の場所に置く場合は、ゲームサーバーの URL を指定する
// 例: export const SERVER_URL = 'https://dino-rush.onrender.com';
export const SERVER_URL = '';

// このファイルの1つ上のフォルダ（ひとりで動かすときは / 、ゲームいっぱいの中では /dino/）をサーバーの場所にする
const BASE = new URL('..', import.meta.url).href.replace(/\/$/, '');

export function serverHttpUrl(path) {
  return (SERVER_URL || BASE).replace(/\/$/, '') + path;
}

export function serverWsUrl() {
  return serverHttpUrl('/ws').replace(/^http/, 'ws');
}
