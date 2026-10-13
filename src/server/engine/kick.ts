import { discardWhite } from './blanks.js';
import { removeSeat } from './lobby.js';
import { requirePlayer } from './players.js';
import { voidRound } from './round.js';
import type { GameState } from './state.js';

/**
 * Removes a seat for good. Its hand and any answer still being collected are discarded, and a kicked Czar voids
 * the round. While judging, the kicked player's answer stays: removing it would show everyone which one was
 * theirs. It can still win, but nobody scores for it.
 */
export function kickPlayer(state: GameState, playerId: string, now: number): GameState {
    const player = requirePlayer(state, playerId);
    const round = state.round;
    const pendingAnswer = round?.pending.find((entry) => entry.playerId === playerId)?.cardIds ?? [];
    let next: GameState = {
        ...discardWhite(removeSeat(state, playerId), [...player.hand, ...pendingAnswer]),
        suddenDeath: state.suddenDeath && {
            ...state.suddenDeath,
            contenderIds: state.suddenDeath.contenderIds.filter((id) => id !== playerId),
        },
    };
    if (round) {
        next = { ...next, round: { ...round, pending: round.pending.filter((entry) => entry.playerId !== playerId) } };
    }
    const roundOpen = state.phase === 'ROUND_START' || state.phase === 'SUBMITTING' || state.phase === 'JUDGING';
    return roundOpen && round?.czarId === playerId ? voidRound(next, 'CZAR_LEFT', now) : next;
}
