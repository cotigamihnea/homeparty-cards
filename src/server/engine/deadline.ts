import { czarGraceEndsAt, vipGraceEndsAt } from './connection.js';
import type { GameState } from './state.js';

function revealEndsAt(state: GameState): number | null {
    return state.phase === 'JUDGING' && state.round && !state.round.revealed ? state.round.revealEndsAt : null;
}

/** The next moment a TICK can change the state, or null when nothing is time-based right now. */
export function nextDeadline(state: GameState): number | null {
    const running = state.paused ? [] : [state.phaseEndsAt, czarGraceEndsAt(state), revealEndsAt(state)];
    const deadlines = [vipGraceEndsAt(state), ...running].filter((at): at is number => at !== null);
    return deadlines.length > 0 ? Math.min(...deadlines) : null;
}
