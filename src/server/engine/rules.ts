import { checkBlankText, type BlankAnswer } from '../../shared/blanks.js';
import { AVATAR_COUNT, MAX_PLAYERS, MIN_PLAYERS } from '../../shared/constants.js';
import { sameName, validateName } from '../../shared/names.js';
import type { Reason } from '../../shared/reasons.js';
import { isValidSettingsPatch } from '../../shared/settings.js';
import { deckProblem } from '../../shared/deckRules.js';
import type { Action, Actor, DealtDeck } from './actions.js';
import { hasAnnounced } from './announcements.js';
import { isBlankId } from './blanks.js';
import { connectedPlayers, findPlayer, requirePlayer, requireRound } from './players.js';
import { IN_GAME_PHASES, type GameState } from './state.js';
import { isContender } from './submitters.js';
import { checkWriting } from './writing.js';

export function isAdmin(state: GameState, actor: Actor): boolean {
    return actor.kind === 'host' || actor.playerId === state.vipId;
}

/** The single source of rules: null when the action is allowed, otherwise why not. */
export function checkAction(state: GameState, action: Action): Reason | null {
    if ('by' in action && !isAdmin(state, action.by)) return 'NOT_VIP';
    switch (action.type) {
        case 'PLAYER_JOINED':
            return checkJoin(state, action.playerId, action.name);
        case 'PLAYER_DISCONNECTED':
        case 'PLAYER_RECONNECTED':
            return findPlayer(state, action.playerId) ? null : 'UNKNOWN_PLAYER';
        case 'KICK_PLAYER':
            if (!findPlayer(state, action.playerId)) return 'UNKNOWN_PLAYER';
            if (action.by.kind === 'player' && action.by.playerId === action.playerId) return 'BAD_REQUEST';
            return null;
        case 'TRANSFER_VIP': {
            const target = findPlayer(state, action.playerId);
            if (action.playerId === state.vipId || !target) return 'UNKNOWN_PLAYER';
            return target.connected ? null : 'PLAYER_AWAY';
        }
        case 'SET_AVATAR':
            return checkAvatar(state, action.playerId, action.avatar);
        case 'UPDATE_SETTINGS':
            if (state.phase !== 'LOBBY' && state.phase !== 'GAME_OVER') return 'WRONG_PHASE';
            return isValidSettingsPatch(action.settings) ? null : 'INVALID_SETTINGS';
        case 'START_GAME':
            if (state.phase !== 'LOBBY') return 'WRONG_PHASE';
            return checkDeal(state, action.deck);
        case 'SUBMIT_CARDS':
            return (
                checkSubmit(state, action.playerId, action.cardIds) ?? checkBlanks(action.cardIds, action.blanks ?? [])
            );
        case 'REBOOT_HAND':
            return checkReboot(state, action.playerId);
        case 'DISCARD_CARD':
            return checkConfession(state, action.playerId, action.cardId);
        case 'CZAR_HIGHLIGHT':
            return checkCzarChoice(state, action.playerId, action.submissionId);
        case 'CZAR_PICK': {
            const reason = checkCzarChoice(state, action.playerId, action.submissionId);
            if (reason) return reason;
            if (state.paused) return 'GAME_PAUSED';
            // The server's own "revealed" (what every screen was told) wins over a wall clock that may have stepped back.
            const round = requireRound(state);
            return !round.revealed && action.now < round.revealEndsAt ? 'STILL_REVEALING' : null;
        }
        case 'ADVANCE':
            if (state.phase !== 'ROUND_RESULT') return 'WRONG_PHASE';
            return state.paused ? 'GAME_PAUSED' : null;
        case 'END_GAME':
            return IN_GAME_PHASES.includes(state.phase) ? null : 'WRONG_PHASE';
        case 'PLAY_AGAIN':
            if (state.phase !== 'GAME_OVER') return 'WRONG_PHASE';
            return checkDeal(state, action.deck);
        case 'BACK_TO_LOBBY':
            return state.phase === 'GAME_OVER' ? null : 'WRONG_PHASE';
        case 'TICK':
            return null;
        case 'WRITE_CARD':
        case 'EDIT_WRITTEN_CARD':
        case 'REMOVE_WRITTEN_CARD':
        case 'START_NOW':
        case 'FEVER_SAVED':
            return checkWriting(state, action);
    }
}

function checkAvatar(state: GameState, playerId: string, avatar: number): Reason | null {
    if (!findPlayer(state, playerId)) return 'UNKNOWN_PLAYER';
    if (!Number.isInteger(avatar) || avatar < 0 || avatar >= AVATAR_COUNT) return 'BAD_REQUEST';
    const holder = state.players.find((player) => player.avatar === avatar);
    return holder && holder.id !== playerId ? 'AVATAR_TAKEN' : null;
}

function checkCzarChoice(state: GameState, playerId: string, submissionId: string): Reason | null {
    const round = state.round;
    if (state.phase !== 'JUDGING' || !round) return 'WRONG_PHASE';
    if (playerId !== round.czarId) return 'NOT_CZAR';
    return round.submissions.some((submission) => submission.id === submissionId) ? null : 'UNKNOWN_SUBMISSION';
}

function checkDeal(state: GameState, deck: DealtDeck): Reason | null {
    if (connectedPlayers(state).length < MIN_PLAYERS) return 'NOT_ENOUGH_PLAYERS';
    const counts = { white: deck.white.length, black: deck.black.length, custom: deck.custom === true };
    return deckProblem(counts, state.players.length, state.settings.handSize, state.settings.gameMode);
}

/** Answering, and what house rules allow while answering: only for players who answer this round. */
function checkAnswerer(state: GameState, playerId: string): Reason | null {
    const round = state.round;
    if (state.phase !== 'SUBMITTING' || !round) return 'WRONG_PHASE';
    const player = findPlayer(state, playerId);
    if (!player) return 'UNKNOWN_PLAYER';
    if (player.id === round.czarId) return 'CZAR_CANNOT_SUBMIT';
    if (!player.dealtIn || !isContender(state, player.id)) return 'NOT_IN_ROUND';
    return null;
}

function checkReboot(state: GameState, playerId: string): Reason | null {
    if (!state.settings.rebootTheUniverse) return 'RULE_OFF';
    const reason = checkAnswerer(state, playerId);
    if (reason) return reason;
    const round = requireRound(state);
    // The winner is settled in the Happy Ending, and a sudden-death tie is decided by the cards alone.
    if (round.finale || state.suddenDeath) return 'WRONG_PHASE';
    if (requirePlayer(state, playerId).score < 1) return 'NO_POINTS';
    return hasAnnounced(round, 'reboot', playerId) ? 'ALREADY_USED' : null;
}

function checkConfession(state: GameState, playerId: string, cardId: string): Reason | null {
    if (!state.settings.neverHaveIEver) return 'RULE_OFF';
    const reason = checkAnswerer(state, playerId);
    if (reason) return reason;
    if (!requirePlayer(state, playerId).hand.includes(cardId)) return 'NOT_YOUR_CARDS';
    // Nobody fails to understand a blank card.
    if (isBlankId(cardId)) return 'BAD_REQUEST';
    return hasAnnounced(requireRound(state), 'confession', playerId) ? 'ALREADY_USED' : null;
}

function checkSubmit(state: GameState, playerId: string, cardIds: readonly string[]): Reason | null {
    const reason = checkAnswerer(state, playerId);
    if (reason) return reason;
    const round = requireRound(state);
    const player = requirePlayer(state, playerId);
    if (cardIds.length !== round.black.pick || new Set(cardIds).size !== cardIds.length) return 'WRONG_CARD_COUNT';
    const previous = round.pending.find((entry) => entry.playerId === playerId)?.cardIds ?? [];
    const available = new Set([...player.hand, ...previous]);
    return cardIds.every((id) => available.has(id)) ? null : 'NOT_YOUR_CARDS';
}

/** What is written on blanks: something, within the limit, on each blank of the answer and nothing else. */
function checkBlanks(cardIds: readonly string[], blanks: readonly BlankAnswer[]): Reason | null {
    const written = blanks.map((blank) => blank.cardId);
    const onAnswerBlanks = written.every((id) => isBlankId(id) && cardIds.includes(id));
    if (!onAnswerBlanks || new Set(written).size !== written.length) return 'BAD_REQUEST';
    for (const id of cardIds.filter(isBlankId)) {
        const reason = checkBlankText(blanks.find((blank) => blank.cardId === id)?.text ?? '');
        if (reason) return reason;
    }
    return null;
}

function checkJoin(state: GameState, playerId: string, rawName: string): Reason | null {
    if (findPlayer(state, playerId)) return 'ALREADY_JOINED';
    if (state.players.length >= MAX_PLAYERS) return 'GAME_FULL';
    const check = validateName(rawName);
    if (!check.ok) return check.reason;
    if (state.players.some((player) => sameName(player.name, check.name))) return 'NAME_TAKEN';
    return null;
}
