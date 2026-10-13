import { RANDO_ID } from '../../shared/constants.js';
import { discardWhite } from './blanks.js';
import { drawWhite } from './deck.js';
import { requireRound } from './players.js';
import type { GameState } from './state.js';
import { isContender } from './submitters.js';

/** Rando Cardrissian answers once the players have: the top `pick` cards of the deck (if it plays this round). */
export function addRandoAnswer(state: GameState): GameState {
    if (!state.rando || !isContender(state, RANDO_ID)) return state;
    const round = requireRound(state);
    const [cards, next] = drawWhite(state, round.black.pick);
    if (cards.length < round.black.pick) return discardWhite(next, cards);
    return { ...next, round: { ...round, pending: [...round.pending, { playerId: RANDO_ID, cardIds: cards }] } };
}
