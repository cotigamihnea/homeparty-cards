import type { GameState } from './state.js';

/** Starts a phase timer; while the game is paused it is kept as time left and only starts on resume. */
export function withPhaseTimer(state: GameState, durationMs: number, now: number): GameState {
    return state.paused
        ? { ...state, phaseEndsAt: null, pausedRemainingMs: durationMs }
        : { ...state, phaseEndsAt: now + durationMs, pausedRemainingMs: null };
}
