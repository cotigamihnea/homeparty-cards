import type { Action } from './actions.js';
import { confessCard } from './confess.js';
import { markDisconnected, markReconnected } from './connection.js';
import { highlight, pickWinner } from './judging.js';
import { kickPlayer } from './kick.js';
import { addPlayer, setAvatar } from './lobby.js';
import { afterSeatChange, applyPauseRule } from './pause.js';
import { rebootHand } from './reboot.js';
import { startGame, submitCards } from './round.js';
import { checkAction } from './rules.js';
import { backToLobby, endRound, finishGame } from './scoring.js';
import type { GameState } from './state.js';
import { tick } from './tick.js';
import { editWrittenCard, finishWriting, removeWrittenCard, startWriting, writeCard } from './writing.js';

/** Pure: a refused action returns the same state object; inputs are never mutated. */
export function reduce(state: GameState, action: Action): GameState {
    if (checkAction(state, action) !== null) return state;
    switch (action.type) {
        case 'PLAYER_JOINED':
            return afterSeatChange(addPlayer(state, action), action.now);
        case 'PLAYER_DISCONNECTED':
            return afterSeatChange(markDisconnected(state, action.playerId, action.now), action.now);
        case 'PLAYER_RECONNECTED':
            return afterSeatChange(markReconnected(state, action.playerId), action.now);
        case 'KICK_PLAYER':
            return afterSeatChange(kickPlayer(state, action.playerId, action.now), action.now);
        case 'TRANSFER_VIP':
            return { ...state, vipId: action.playerId };
        case 'SET_AVATAR':
            return setAvatar(state, action.playerId, action.avatar);
        case 'UPDATE_SETTINGS':
            return { ...state, settings: { ...state.settings, ...action.settings } };
        case 'START_GAME':
        case 'PLAY_AGAIN':
            return state.settings.gameMode === 'customFever'
                ? startWriting(state, action.deck, action.seed, action.now)
                : startGame(state, action.deck, action.seed, action.now);
        case 'SUBMIT_CARDS':
            return submitCards(state, action.playerId, action.cardIds, action.blanks ?? [], action.now);
        case 'REBOOT_HAND':
            return rebootHand(state, action.playerId, action.now);
        case 'DISCARD_CARD':
            return confessCard(state, action.playerId, action.cardId, action.now);
        case 'CZAR_HIGHLIGHT':
            return highlight(state, action.submissionId);
        case 'CZAR_PICK':
            return pickWinner(state, action.submissionId, action.now);
        case 'ADVANCE':
            return endRound(state, action.now);
        case 'END_GAME':
            return finishGame(state);
        case 'BACK_TO_LOBBY':
            return backToLobby(state);
        case 'TICK':
            return tick(state, action.now);
        case 'WRITE_CARD':
            return writeCard(state, action.playerId, action.color, action.text, action.now);
        case 'EDIT_WRITTEN_CARD':
            return editWrittenCard(state, action.cardId, action.text);
        case 'REMOVE_WRITTEN_CARD':
            return removeWrittenCard(state, action.cardId);
        case 'START_NOW':
            // The VIP may start while the game is paused: round 1 then waits, paused, like any round.
            return applyPauseRule(finishWriting(state, action.now), action.now);
        case 'FEVER_SAVED':
            return { ...state, fever: state.fever && { ...state.fever, savedAs: action.name } };
    }
}
