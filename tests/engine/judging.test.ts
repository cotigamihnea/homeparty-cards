import { describe, expect, it } from 'vitest';
import { RESULT_MS, REVEAL_MS_PER_SUBMISSION } from '../../src/shared/constants.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import type { GameState } from '../../src/server/engine/state.js';
import { HOST, T0, allWhiteCards, as, expire, seat, startedGame, submitFirst } from './helpers.js';

function judgingWith(seed = 7, settings = {}): GameState {
    let state = expire(startedGame({ seed, settings }));
    for (const id of ['p2', 'p3', 'p4']) state = submitFirst(state, id);
    return state;
}

const highlight = (playerId: string, submissionId: string) => ({
    type: 'CZAR_HIGHLIGHT' as const,
    playerId,
    submissionId,
});
const pick = (playerId: string, submissionId: string, now: number) => ({
    type: 'CZAR_PICK' as const,
    playerId,
    submissionId,
    now,
});

describe('judging starts', () => {
    const judging = judgingWith();
    const round = judging.round!;

    it('hides the authors behind opaque random ids', () => {
        expect(round.submissions).toHaveLength(3);
        const ids = round.submissions.map((s) => s.id);
        expect(new Set(ids).size).toBe(3);
        expect(ids.every((id) => /^[a-z0-9]{8}$/.test(id))).toBe(true);
        expect(ids.some((id) => ['p2', 'p3', 'p4'].some((p) => id.includes(p)))).toBe(false);
    });

    it('shuffles the order (not the order players answered in) across seeds', () => {
        const orders = new Set(
            Array.from({ length: 12 }, (_, seed) =>
                judgingWith(seed + 1)
                    .round!.submissions.map((s) => s.playerId)
                    .join(),
            ),
        );
        expect(orders.size).toBeGreaterThan(1);
    });

    it('reveals answers one by one, then starts the judging timer', () => {
        expect(round.revealEndsAt).toBe(round.judgingStartedAt + 3 * REVEAL_MS_PER_SUBMISSION);
        expect(judging.phaseEndsAt).toBe(round.revealEndsAt + 60_000);
        expect(judgingWith(7, { judgeSeconds: 0 }).phaseEndsAt).toBeNull();
    });
});

describe('the Czar', () => {
    const judging = judgingWith();
    const round = judging.round!;
    const first = round.submissions[0]!;

    it('can highlight any answer, even during the reveal', () => {
        expect(reduce(judging, highlight('p1', first.id)).round?.highlightedId).toBe(first.id);
    });

    it('is the only one who can highlight or pick, and only real answers', () => {
        expect(checkAction(judging, highlight('p2', first.id))).toBe('NOT_CZAR');
        expect(checkAction(judging, highlight('p1', 'nope'))).toBe('UNKNOWN_SUBMISSION');
        expect(checkAction(judging, pick('p2', first.id, round.revealEndsAt))).toBe('NOT_CZAR');
        expect(checkAction(judging, pick('p1', 'nope', round.revealEndsAt))).toBe('UNKNOWN_SUBMISSION');
        expect(checkAction(startedGame(), highlight('p1', first.id))).toBe('WRONG_PHASE');
    });

    it('cannot pick before every answer has been revealed', () => {
        expect(checkAction(judging, pick('p1', first.id, round.revealEndsAt - 1))).toBe('STILL_REVEALING');
    });

    it('picks a winner: +1 point, outcome, best-of entry, result screen', () => {
        const result = reduce(judging, pick('p1', first.id, round.revealEndsAt));
        expect(result.phase).toBe('ROUND_RESULT');
        expect(seat(result, first.playerId).score).toBe(1);
        expect(result.round?.outcome).toEqual({ kind: 'winner', winnerId: first.playerId, submissionId: first.id });
        expect(result.bestOf).toEqual([
            { round: 1, black: round.black, cardIds: first.cardIds, written: {}, winnerId: first.playerId },
        ]);
        expect(result.phaseEndsAt).toBe(round.revealEndsAt + RESULT_MS);
        expect(new Set(allWhiteCards(result)).size).toBe(allWhiteCards(result).length);
    });

    it('discards the played cards when the result screen ends', () => {
        const next = expire(reduce(judging, pick('p1', first.id, round.revealEndsAt)));
        expect(next.round?.number).toBe(2);
        expect(next.whiteDiscard).toEqual(expect.arrayContaining(round.submissions.flatMap((s) => s.cardIds)));
        expect(next.blackDiscard).toContainEqual(round.black);
        expect(allWhiteCards(next)).toHaveLength(400);
    });

    it('falls asleep: when the judging timer runs out the round is void and the cards go back', () => {
        const voided = expire(judging);
        expect(voided.round?.outcome).toEqual({ kind: 'void', reason: 'CZAR_TIMEOUT' });
        expect(voided.players.every((p) => p.hand.length === 10)).toBe(true);
        expect(voided.players.every((p) => p.score === 0)).toBe(true);
    });
});

describe('advancing the result screen', () => {
    const result = reduce(
        judgingWith(),
        pick('p1', judgingWith().round!.submissions[0]!.id, judgingWith().round!.revealEndsAt),
    );

    it('lets the VIP or the host skip ahead to the next round', () => {
        expect(reduce(result, { type: 'ADVANCE', by: as('p1'), now: T0 + 50_000 }).round?.number).toBe(2);
        expect(reduce(result, { type: 'ADVANCE', by: HOST, now: T0 + 50_000 }).round?.number).toBe(2);
    });

    it('refuses others and the wrong phase', () => {
        expect(checkAction(result, { type: 'ADVANCE', by: as('p2'), now: T0 })).toBe('NOT_VIP');
        expect(checkAction(judgingWith(), { type: 'ADVANCE', by: HOST, now: T0 })).toBe('WRONG_PHASE');
    });
});
