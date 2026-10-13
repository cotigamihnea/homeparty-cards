import { autoPlayMissing } from './autoPlay.js';
import { czarGraceEndsAt, passCrownIfVipAway } from './connection.js';
import { finishSubmitting, startSubmitting, voidRound } from './round.js';
import { endRound } from './scoring.js';
import type { GameState } from './state.js';
import { finishWriting } from './writing.js';

/** Applies everything that is due at `now`; early, repeated or stale ticks change nothing. */
export function tick(state: GameState, now: number): GameState {
    const next = passCrownIfVipAway(state, now);
    if (next.paused) return next;
    const czarGraceEnd = czarGraceEndsAt(next);
    if (czarGraceEnd !== null && now >= czarGraceEnd) return voidRound(next, 'CZAR_LEFT', now);
    const revealed = markRevealed(next, now);
    if (revealed.phaseEndsAt === null || now < revealed.phaseEndsAt) return revealed;
    return phaseExpired(revealed, now);
}

function markRevealed(state: GameState, now: number): GameState {
    const round = state.round;
    if (state.phase !== 'JUDGING' || !round || round.revealed || now < round.revealEndsAt) return state;
    return { ...state, round: { ...round, revealed: true } };
}

function phaseExpired(next: GameState, now: number): GameState {
    switch (next.phase) {
        case 'WRITING':
            return finishWriting(next, now);
        case 'ROUND_START':
            return startSubmitting(next, now);
        case 'SUBMITTING':
            return finishSubmitting(autoPlayMissing(next), now);
        case 'JUDGING':
            return voidRound(next, 'CZAR_TIMEOUT', now);
        case 'ROUND_RESULT':
            return endRound(next, now);
        default:
            return next;
    }
}
