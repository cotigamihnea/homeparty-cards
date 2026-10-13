import { isBlankId } from './blanks.js';
import { requireRound, updatePlayer } from './players.js';
import { shuffle } from './rng.js';
import type { GameState } from './state.js';
import { eligibleSubmitters } from './submitters.js';

/**
 * Auto-play on timeout: when the answer timer runs out, everyone who may answer and hasn't gets random cards from
 * their hand played for them (never a blank, which needs writing). A hand without enough cards is skipped.
 */
export function autoPlayMissing(state: GameState): GameState {
    if (!state.settings.autoPlay) return state;
    const { pick } = requireRound(state).black;
    const answered = new Set(requireRound(state).pending.map((entry) => entry.playerId));
    let next = state;
    for (const player of eligibleSubmitters(state).filter((p) => !answered.has(p.id))) {
        const playable = player.hand.filter((id) => !isBlankId(id));
        if (playable.length < pick) continue;
        const [shuffled, rng] = shuffle(playable, next.rng);
        const cardIds = shuffled.slice(0, pick);
        next = updatePlayer({ ...next, rng }, player.id, (p) => ({
            ...p,
            hand: p.hand.filter((id) => !cardIds.includes(id)),
        }));
        const round = requireRound(next);
        next = {
            ...next,
            round: { ...round, pending: [...round.pending, { playerId: player.id, cardIds, auto: true }] },
        };
    }
    return next;
}
