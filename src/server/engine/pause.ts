import { MIN_PLAYERS } from '../../shared/constants.js';
import { connectedPlayers } from './players.js';
import { progressSubmitting } from './round.js';
import { IN_GAME_PHASES, type GameState } from './state.js';
import { progressWriting } from './writing.js';

/** Fewer than 3 connected players during a game freezes the phase timer; enough players resume it (min 10 s). */
export function applyPauseRule(state: GameState, now: number): GameState {
    const shouldPause = IN_GAME_PHASES.includes(state.phase) && connectedPlayers(state).length < MIN_PLAYERS;
    if (shouldPause === state.paused) return state;
    if (shouldPause) {
        const remaining = state.phaseEndsAt === null ? null : Math.max(0, state.phaseEndsAt - now);
        return { ...state, paused: true, pausedRemainingMs: remaining, pausedAt: now, phaseEndsAt: null };
    }
    const remaining = state.pausedRemainingMs;
    return {
        ...resumeReveal(state, now),
        paused: false,
        pausedRemainingMs: null,
        pausedAt: null,
        phaseEndsAt: remaining === null ? null : now + Math.max(remaining, state.timing.resumeMinMs),
    };
}

/** A reveal cut short by a pause carries on from the same answer: it moves later by the length of the pause. */
function resumeReveal(state: GameState, now: number): GameState {
    const round = state.round;
    if (state.phase !== 'JUDGING' || !round || round.revealed || state.pausedAt === null) return state;
    const shift = now - state.pausedAt;
    return {
        ...state,
        round: { ...round, revealStartedAt: round.revealStartedAt + shift, revealEndsAt: round.revealEndsAt + shift },
    };
}

/** After anyone joins, drops, returns or is kicked: maybe pause or resume, then maybe move on. */
export function afterSeatChange(state: GameState, now: number): GameState {
    return progressWriting(progressSubmitting(applyPauseRule(ensureVip(state), now), now), now);
}

/** A crown nobody could take (e.g. the VIP was kicked while everyone was away) goes to the first seat that is here. */
function ensureVip(state: GameState): GameState {
    if (state.vipId !== null) return state;
    const first = state.players.find((player) => player.connected);
    return first ? { ...state, vipId: first.id } : state;
}
