import { describe, expect, it } from 'vitest';
import {
    CZAR_RECONNECT_GRACE_MS,
    DEFAULT_TIMING,
    RESULT_MS,
    RESUME_MIN_MS,
    REVEAL_MS_PER_SUBMISSION,
    ROUND_INTRO_MS,
    VIP_RECONNECT_GRACE_MS,
    VOID_RESULT_MS,
    type Timing,
} from '../../src/shared/constants.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { createInitialState } from '../../src/server/engine/state.js';
import { T0, apply, expire, playRound, startedGame, submitFirst } from './helpers.js';

const FAST: Timing = {
    roundIntroMs: 100,
    revealMsPerSubmission: 50,
    resultMs: 200,
    voidResultMs: 150,
    czarGraceMs: 300,
    vipGraceMs: 400,
    resumeMinMs: 25,
    secondMs: 10,
};

describe('timing', () => {
    it('defaults to the documented durations', () => {
        expect(DEFAULT_TIMING).toEqual({
            roundIntroMs: ROUND_INTRO_MS,
            revealMsPerSubmission: REVEAL_MS_PER_SUBMISSION,
            resultMs: RESULT_MS,
            voidResultMs: VOID_RESULT_MS,
            czarGraceMs: CZAR_RECONNECT_GRACE_MS,
            vipGraceMs: VIP_RECONNECT_GRACE_MS,
            resumeMinMs: RESUME_MIN_MS,
            secondMs: 1000,
        });
        expect(createInitialState().timing).toEqual(DEFAULT_TIMING);
    });

    it('drives every phase length of a game created with custom timing', () => {
        const start = startedGame({ timing: FAST });
        expect(start.phaseEndsAt).toBe(T0 + FAST.roundIntroMs);
        let judging = expire(start);
        for (const id of ['p2', 'p3', 'p4']) judging = submitFirst(judging, id);
        expect(judging.round?.revealEndsAt).toBe(judging.round!.judgingStartedAt + 3 * FAST.revealMsPerSubmission);
        const result = playRound(startedGame({ timing: FAST }), 'p2');
        expect(result.phaseEndsAt).toBe(result.round!.revealEndsAt + FAST.resultMs);
        const submitting = expire(startedGame({ timing: FAST }));
        expect(expire(submitting).phaseEndsAt).toBe(submitting.phaseEndsAt! + FAST.voidResultMs);
    });

    it('runs the answer and judging timers in timing seconds, so tests can run out a 60 s timer quickly', () => {
        const submitting = expire(startedGame({ timing: FAST }));
        expect(submitting.phaseEndsAt).toBe(T0 + FAST.roundIntroMs + 60 * FAST.secondMs);
        let judging = submitting;
        for (const id of ['p2', 'p3', 'p4']) judging = submitFirst(judging, id);
        expect(judging.phaseEndsAt).toBe(judging.round!.revealEndsAt + 60 * FAST.secondMs);
    });

    it('drives the Czar and VIP grace periods and the resume minimum', () => {
        let judging = expire(startedGame({ timing: FAST, names: ['Ana', 'Bogdan', 'Cara', 'Dan', 'Eve'] }));
        for (const id of ['p2', 'p3', 'p4', 'p5']) judging = submitFirst(judging, id);
        const dropAt = judging.round!.judgingStartedAt;
        judging = reduce(judging, { type: 'TRANSFER_VIP', by: { kind: 'host' }, playerId: 'p2' });
        judging = reduce(judging, { type: 'PLAYER_DISCONNECTED', playerId: 'p1', now: dropAt });
        expect(reduce(judging, { type: 'TICK', now: dropAt + FAST.czarGraceMs }).phase).toBe('ROUND_RESULT');

        const vipAway = reduce(startedGame({ timing: FAST }), { type: 'PLAYER_DISCONNECTED', playerId: 'p1', now: T0 });
        expect(reduce(vipAway, { type: 'TICK', now: T0 + FAST.vipGraceMs }).vipId).toBe('p2');

        const submitting = expire(startedGame({ timing: FAST }));
        const paused = apply(
            submitting,
            { type: 'PLAYER_DISCONNECTED', playerId: 'p3', now: T0 },
            { type: 'PLAYER_DISCONNECTED', playerId: 'p4', now: submitting.phaseEndsAt! - 1 },
        );
        const resumed = reduce(paused, { type: 'PLAYER_RECONNECTED', playerId: 'p3', now: T0 + 999 });
        expect(resumed.phaseEndsAt).toBe(T0 + 999 + FAST.resumeMinMs);
    });
});
