import { announce } from './announcements.js';
import { discardWhite, isBlankId } from './blanks.js';
import { dealTo } from './deck.js';
import { requirePlayer, updatePlayer } from './players.js';
import type { GameState } from './state.js';

/**
 * Rebooting the Universe: a point for a whole new hand. The new cards are drawn before the old ones are discarded,
 * so none of them can come straight back. Blank cards stay (they are not from the deck), and an answer already sent
 * is not in the hand and stays where it is.
 */
export function rebootHand(state: GameState, playerId: string, now: number): GameState {
    const hand = requirePlayer(state, playerId).hand;
    const oldHand = hand.filter((id) => !isBlankId(id));
    const emptied = updatePlayer(state, playerId, (player) => ({
        ...player,
        score: player.score - 1,
        hand: hand.filter(isBlankId),
    }));
    const dealt = dealTo(emptied, playerId, oldHand.length);
    return announce(discardWhite(dealt, oldHand), { kind: 'reboot', playerId, at: now });
}
