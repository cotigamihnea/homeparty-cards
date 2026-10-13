import { normalizeBlankText, type BlankAnswer } from '../../shared/blanks.js';
import { updatePlayer } from './players.js';
import { randomId } from './rng.js';
import type { GameState } from './state.js';

const PREFIX = 'blank-';

export function isBlankId(cardId: string): boolean {
    return cardId.startsWith(PREFIX);
}

/**
 * A player's blank cards for the whole game, dealt with their first hand (they count towards the hand size). Their
 * ids are random, so a written answer can't be traced back to a seat.
 */
export function dealBlanks(state: GameState, playerId: string): GameState {
    // Blanks are dealt as a round begins, when every blank in play is in a hand.
    const used = new Set(state.players.flatMap((player) => player.hand).filter(isBlankId));
    let rng = state.rng;
    const blanks: string[] = [];
    for (let i = 0; i < state.settings.blankCards; i++) {
        let id: string;
        do {
            [id, rng] = randomId(rng);
            id = PREFIX + id;
        } while (used.has(id));
        used.add(id);
        blanks.push(id);
    }
    return updatePlayer({ ...state, rng }, playerId, (player) => ({ ...player, hand: [...player.hand, ...blanks] }));
}

/** What players wrote on the blanks of their answer, cleaned up. */
export function writeBlanks(state: GameState, blanks: readonly BlankAnswer[]): GameState {
    if (blanks.length === 0) return state;
    const written = Object.fromEntries(blanks.map(({ cardId, text }) => [cardId, normalizeBlankText(text)]));
    return { ...state, blankTexts: { ...state.blankTexts, ...written } };
}

/** What is written on these cards' blanks, for keeping after the cards leave play. */
export function writtenOn(state: GameState, cardIds: readonly string[]): Record<string, string> {
    const written: Record<string, string> = {};
    for (const id of cardIds) {
        const text = state.blankTexts[id];
        if (text !== undefined) written[id] = text;
    }
    return written;
}

/** These blanks are back in a hand, or out of the game: what was written on them is gone. */
export function eraseBlanks(state: GameState, cardIds: readonly string[]): GameState {
    const erased = cardIds.filter((id) => Object.hasOwn(state.blankTexts, id));
    if (erased.length === 0) return state;
    return {
        ...state,
        blankTexts: Object.fromEntries(Object.entries(state.blankTexts).filter(([id]) => !erased.includes(id))),
    };
}

/** White cards leave play: normal ones go to the discard pile; a blank is gone for good, with its text. */
export function discardWhite(state: GameState, cardIds: readonly string[]): GameState {
    const kept = eraseBlanks(state, cardIds);
    return { ...kept, whiteDiscard: [...kept.whiteDiscard, ...cardIds.filter((id) => !isBlankId(id))] };
}
