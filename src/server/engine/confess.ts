import { announce } from './announcements.js';
import { discardWhite } from './blanks.js';
import { drawWhite } from './deck.js';
import { updatePlayer } from './players.js';
import type { GameState } from './state.js';

/**
 * Never Have I Ever: a card the player doesn't understand is swapped for a new one in the same place and shown to
 * the room. The new card is drawn before the old one is discarded, so it can't come straight back.
 */
export function confessCard(state: GameState, playerId: string, cardId: string, now: number): GameState {
    const [drawn, afterDraw] = drawWhite(state, 1);
    const swapped = updatePlayer(afterDraw, playerId, (player) => ({
        ...player,
        hand: player.hand.flatMap((id) => (id === cardId ? drawn : [id])),
    }));
    return announce(discardWhite(swapped, [cardId]), { kind: 'confession', playerId, cardId, at: now });
}
