// ジジ抜き（サーバーとブラウザで共通）。くわしい決まりは oldmaid.js
// ジョーカーは使わず、はじめに1枚を誰にも見せずに抜いておく。その相方（ジジ）が最後に残った人の負け。
import * as core from './oldmaid.js';

export const id = 'jijinuki';
export const title = 'ジジ抜き';
export const init = (options, players, rng) => core.init(options, players, rng, 'jiji');
export const { minPlayers, maxPlayers, sideNames, lobbyReturn, logTitle, canActOutOfTurn, viewFor, phaseText, scoreOf, applyMove, aiMove } = core;
