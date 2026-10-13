import { writtenOn } from './blanks.js';
import { requireRound } from './players.js';
import { randomId, shuffle } from './rng.js';
import { addPoint } from './scoreboard.js';
import type { GameState, Submission } from './state.js';

/** Shuffles the answers, gives them opaque ids and starts the one-by-one reveal; the judging timer starts after it. */
export function startJudging(state: GameState, now: number): GameState {
    const round = requireRound(state);
    const [order, afterShuffle] = shuffle(round.pending, state.rng);
    let rng = afterShuffle;
    const usedIds = new Set<string>();
    const submissions: Submission[] = order.map((entry) => {
        let id: string;
        do [id, rng] = randomId(rng);
        while (usedIds.has(id));
        usedIds.add(id);
        return { ...entry, id };
    });
    const revealEndsAt = now + state.timing.revealMsPerSubmission * submissions.length;
    const judgeMs = state.settings.judgeSeconds * state.timing.secondMs;
    return {
        ...state,
        rng,
        phase: 'JUDGING',
        round: {
            ...round,
            pending: [],
            submissions,
            judgingStartedAt: now,
            revealStartedAt: now,
            revealEndsAt,
            revealed: revealEndsAt <= now,
            highlightedId: null,
        },
        phaseEndsAt: judgeMs > 0 ? revealEndsAt + judgeMs : null,
    };
}

export function highlight(state: GameState, submissionId: string): GameState {
    return { ...state, round: { ...requireRound(state), highlightedId: submissionId } };
}

/**
 * The Czar's pick: +1 point (none in the Happy Ending, whose haiku is for glory only) and a best-of entry. The cards
 * stay on show until the result screen ends.
 */
export function pickWinner(state: GameState, submissionId: string, now: number): GameState {
    const round = requireRound(state);
    const winning = round.submissions.find((submission) => submission.id === submissionId);
    if (!winning) throw new Error(`Engine invariant broken: no submission ${submissionId}`);
    const scored = round.finale ? state : addPoint(state, winning.playerId);
    return {
        ...scored,
        phase: 'ROUND_RESULT',
        bestOf: [
            ...scored.bestOf,
            {
                round: round.number,
                black: round.black,
                cardIds: winning.cardIds,
                written: writtenOn(state, winning.cardIds),
                winnerId: winning.playerId,
            },
        ],
        round: {
            ...round,
            highlightedId: submissionId,
            outcome: { kind: 'winner', winnerId: winning.playerId, submissionId },
        },
        phaseEndsAt: now + state.timing.resultMs,
    };
}
