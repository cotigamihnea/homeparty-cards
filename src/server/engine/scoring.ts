import { SUDDEN_DEATH_MAX_ROUNDS } from '../../shared/constants.js';
import { discardWhite } from './blanks.js';
import { requireRound } from './players.js';
import { beginRound } from './round.js';
import { contestants, topScorers } from './scoreboard.js';
import type { GameState } from './state.js';
import { closeWriting } from './writing.js';

export interface Standing {
    playerId: string;
    score: number;
    /** Dense rank: equal scores share a place. */
    rank: number;
}

/** After the result screen: game over (maybe after the Happy Ending), sudden death, or the next round. */
export function endRound(state: GameState, now: number): GameState {
    const settled = discardPlayedCards(state);
    if (requireRound(settled).finale) return finishGame(settled);
    const { pointsToWin, roundLimit } = settled.settings;
    if (pointsToWin !== null) {
        return contestants(settled).some((contestant) => contestant.score >= pointsToWin)
            ? gameDecided(settled, now)
            : beginRound(settled, now);
    }
    const leaderIds = topScorers(settled);
    if (settled.suddenDeath) {
        if (leaderIds.length === 1 || settled.suddenDeath.round >= SUDDEN_DEATH_MAX_ROUNDS) {
            return gameDecided(settled, now);
        }
        return beginRound(
            { ...settled, suddenDeath: { round: settled.suddenDeath.round + 1, contenderIds: leaderIds } },
            now,
        );
    }
    if (roundLimit !== null && requireRound(settled).number >= roundLimit) {
        if (leaderIds.length === 1) return gameDecided(settled, now);
        return beginRound({ ...settled, suddenDeath: { round: 1, contenderIds: leaderIds } }, now);
    }
    return beginRound(settled, now);
}

/** The winner is settled: the Happy Ending's haiku round if the rule is on (for glory only), else game over. */
function gameDecided(state: GameState, now: number): GameState {
    return state.haiku ? beginRound({ ...state, suddenDeath: null }, now, state.haiku) : finishGame(state);
}

/** GAME_OVER: the top score wins; equal top scores are co-winners. */
export function finishGame(state: GameState): GameState {
    return {
        ...state,
        phase: 'GAME_OVER',
        phaseEndsAt: null,
        paused: false,
        pausedRemainingMs: null,
        pausedAt: null,
        suddenDeath: null,
        winnerIds: topScorers(state),
        fever: closeWriting(state.fever),
    };
}

export function backToLobby(state: GameState): GameState {
    return {
        ...state,
        phase: 'LOBBY',
        players: state.players.map((player) => ({ ...player, score: 0, hand: [], dealtIn: false })),
        lastCzarSeat: null,
        whiteDraw: [],
        whiteDiscard: [],
        blackDraw: [],
        blackDiscard: [],
        round: null,
        phaseEndsAt: null,
        paused: false,
        pausedRemainingMs: null,
        pausedAt: null,
        suddenDeath: null,
        haiku: null,
        blankTexts: {},
        rando: null,
        bestOf: [],
        winnerIds: [],
        fever: null,
    };
}

export function standings(state: GameState): Standing[] {
    const sorted = contestants(state).sort((a, b) => b.score - a.score || a.seat - b.seat);
    const distinctScores = [...new Set(sorted.map((contestant) => contestant.score))];
    return sorted.map((contestant) => ({
        playerId: contestant.id,
        score: contestant.score,
        rank: distinctScores.indexOf(contestant.score) + 1,
    }));
}

/** A won round's cards were on show during the result; now they go to the discard piles. */
function discardPlayedCards(state: GameState): GameState {
    const round = state.round;
    if (!round || round.outcome?.kind !== 'winner') return state;
    const discarded = discardWhite(
        state,
        round.submissions.flatMap((submission) => submission.cardIds),
    );
    return {
        ...discarded,
        blackDiscard: [...state.blackDiscard, round.black],
        round: { ...round, submissions: [] },
    };
}
