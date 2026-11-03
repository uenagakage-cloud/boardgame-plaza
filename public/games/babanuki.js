// ババ抜き（サーバーとブラウザで共通）。くわしい決まりは oldmaid.js
import * as core from './oldmaid.js';

export const id = 'babanuki';
export const title = 'ババ抜き';
export const init = (options, players, rng) => core.init(options, players, rng, 'baba');
export const { minPlayers, maxPlayers, sideNames, lobbyReturn, logTitle, canActOutOfTurn, viewFor, phaseText, scoreOf, applyMove, aiMove } = core;
