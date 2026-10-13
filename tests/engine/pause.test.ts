import { describe, expect, it } from 'vitest';
import { CZAR_RECONNECT_GRACE_MS, RESUME_MIN_MS, VIP_RECONNECT_GRACE_MS } from '../../src/shared/constants.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import { HOST, T0, apply, expire, lobbyWith, seat, startedGame, submitFirst } from './helpers.js';

const away = (playerId: string, now: number) => ({ type: 'PLAYER_DISCONNECTED' as const, playerId, now });
const back = (playerId: string, now: number) => ({ type: 'PLAYER_RECONNECTED' as const, playerId, now });
const tick = (now: number) => ({ type: 'TICK' as const, now });

describe('pausing below 3 connected players', () => {
    const submitting = expire(startedGame());
    const ends = submitting.phaseEndsAt!;

    it('freezes the phase timer and remembers the time left', () => {
        const paused = apply(submitting, away('p4', ends - 40_000), away('p3', ends - 40_000));
        expect([paused.paused, paused.phaseEndsAt, paused.pausedRemainingMs]).toEqual([true, null, 40_000]);
    });

    it('does not move on while paused, but answers are still accepted', () => {
        const paused = apply(submitting, away('p4', T0), away('p3', T0));
        const later = reduce(paused, tick(ends + 600_000));
        expect(later.phase).toBe('SUBMITTING');
        expect(submitFirst(later, 'p2').round?.pending).toHaveLength(1);
    });

    it('resumes with the time that was left (at least 10 s) when enough players are back', () => {
        const paused = apply(submitting, away('p4', ends - 40_000), away('p3', ends - 40_000));
        expect(reduce(paused, back('p3', T0 + 500_000)).phaseEndsAt).toBe(T0 + 500_000 + 40_000);
        const almostOut = apply(submitting, away('p4', ends - 1_000), away('p3', ends - 1_000));
        expect(reduce(almostOut, back('p3', T0 + 500_000)).phaseEndsAt).toBe(T0 + 500_000 + RESUME_MIN_MS);
    });

    it('resumes without a timer when the phase has none', () => {
        const noTimer = expire(startedGame({ settings: { submitSeconds: 0 } }));
        const resumed = apply(noTimer, away('p4', T0), away('p3', T0), back('p3', T0 + 5));
        expect([resumed.paused, resumed.phaseEndsAt]).toEqual([false, null]);
    });

    it('moves on right after resuming if everyone who is here has already answered', () => {
        let state = submitFirst(submitFirst(submitting, 'p2'), 'p3');
        state = apply(state, away('p3', T0), away('p4', T0));
        expect(state.paused).toBe(true);
        expect(state.phase).toBe('SUBMITTING');
        expect(reduce(state, back('p3', T0 + 10)).phase).toBe('JUDGING');
    });

    it('a late joiner can end the pause', () => {
        const paused = apply(submitting, away('p4', T0), away('p3', T0));
        expect(reduce(paused, { type: 'PLAYER_JOINED', playerId: 'p5', name: 'Eve', now: T0 + 3 }).paused).toBe(false);
    });

    it('blocks the pick and the result skip while paused', () => {
        let judging = submitting;
        for (const id of ['p2', 'p3', 'p4']) judging = submitFirst(judging, id);
        const pick = {
            type: 'CZAR_PICK' as const,
            playerId: 'p1',
            submissionId: judging.round!.submissions[0]!.id,
            now: judging.round!.revealEndsAt,
        };
        const paused = apply(judging, away('p4', T0), away('p3', T0));
        expect(checkAction(paused, pick)).toBe('GAME_PAUSED');
        const result = apply(reduce(judging, pick), away('p4', T0), away('p3', T0));
        expect(checkAction(result, { type: 'ADVANCE', by: HOST, now: T0 })).toBe('GAME_PAUSED');
    });

    it('still hands the crown over while paused', () => {
        const paused = apply(submitting, away('p4', T0), away('p1', T0));
        expect(reduce(paused, tick(T0 + VIP_RECONNECT_GRACE_MS)).vipId).toBe('p2');
    });

    it('never pauses the lobby', () => {
        expect(apply(lobbyWith(['Ana', 'Bogdan', 'Cara']), away('p3', T0)).paused).toBe(false);
    });
});

describe('a player dropping while answers are open', () => {
    it('moves to judging when the last missing player drops and enough answers are in', () => {
        let state = expire(startedGame({ names: ['Ana', 'Bogdan', 'Cara', 'Dan', 'Eve'] }));
        for (const id of ['p2', 'p3', 'p4']) state = submitFirst(state, id);
        expect(state.phase).toBe('SUBMITTING');
        expect(reduce(state, away('p5', T0 + 1)).phase).toBe('JUDGING');
    });
});

describe('the Czar dropping', () => {
    function judgingWithCzarAway(awayAt: number) {
        let state = expire(startedGame({ names: ['Ana', 'Bogdan', 'Cara', 'Dan', 'Eve'] }));
        state = reduce(state, away('p1', awayAt));
        for (const id of ['p2', 'p3', 'p4', 'p5']) state = submitFirst(state, id, awayAt);
        return state;
    }

    it('keeps collecting answers; the 20 s grace starts when judging starts', () => {
        const judging = judgingWithCzarAway(T0 + 4_000);
        expect(judging.phase).toBe('JUDGING');
        const startedAt = judging.round!.judgingStartedAt;
        expect(reduce(judging, tick(startedAt + CZAR_RECONNECT_GRACE_MS - 1)).phase).toBe('JUDGING');
        expect(reduce(judging, tick(startedAt + CZAR_RECONNECT_GRACE_MS)).round?.outcome).toEqual({
            kind: 'void',
            reason: 'CZAR_LEFT',
        });
    });

    it('counts the grace from the disconnect when that happens during judging', () => {
        let state = expire(startedGame({ names: ['Ana', 'Bogdan', 'Cara', 'Dan', 'Eve'] }));
        for (const id of ['p2', 'p3', 'p4', 'p5']) state = submitFirst(state, id);
        const dropAt = state.round!.judgingStartedAt + 7_000;
        state = reduce(state, away('p1', dropAt));
        expect(reduce(state, tick(dropAt + CZAR_RECONNECT_GRACE_MS - 1)).phase).toBe('JUDGING');
        expect(reduce(state, tick(dropAt + CZAR_RECONNECT_GRACE_MS)).phase).toBe('ROUND_RESULT');
    });

    it('carries on normally if the Czar comes back in time', () => {
        const judging = judgingWithCzarAway(T0 + 4_000);
        const startedAt = judging.round!.judgingStartedAt;
        const returned = reduce(judging, back('p1', startedAt + 5_000));
        expect(reduce(returned, tick(startedAt + CZAR_RECONNECT_GRACE_MS + 1)).phase).toBe('JUDGING');
        expect(seat(returned, 'p1').connected).toBe(true);
    });
});
