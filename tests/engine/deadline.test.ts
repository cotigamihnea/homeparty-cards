import { describe, expect, it } from 'vitest';
import { CZAR_RECONNECT_GRACE_MS, VIP_RECONNECT_GRACE_MS } from '../../src/shared/constants.js';
import { nextDeadline } from '../../src/server/engine/deadline.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { T0, apply, expire, startedGame, submitFirst } from './helpers.js';

const away = (playerId: string, now: number) => ({ type: 'PLAYER_DISCONNECTED' as const, playerId, now });

describe('nextDeadline during a game', () => {
    it('is the phase timer', () => {
        const state = startedGame();
        expect(nextDeadline(state)).toBe(state.phaseEndsAt);
    });

    it('ignores the frozen phase timer while paused, but still counts the VIP grace', () => {
        const paused = apply(expire(startedGame()), away('p4', T0), away('p1', T0 + 2));
        expect(paused.paused).toBe(true);
        expect(nextDeadline(paused)).toBe(T0 + 2 + VIP_RECONNECT_GRACE_MS);
    });

    it('is the end of the Czar’s grace when that comes before the judging timer', () => {
        let state = expire(startedGame({ names: ['Ana', 'Bogdan', 'Cara', 'Dan', 'Eve'] }));
        for (const id of ['p2', 'p3', 'p4', 'p5']) state = submitFirst(state, id);
        state = reduce(state, { type: 'TRANSFER_VIP', by: { kind: 'host' }, playerId: 'p2' });
        const dropAt = state.round!.judgingStartedAt + 1;
        state = reduce(state, away('p1', dropAt));
        expect(nextDeadline(state)).toBe(state.round!.revealEndsAt);
        state = reduce(state, { type: 'TICK', now: state.round!.revealEndsAt });
        expect(nextDeadline(state)).toBe(dropAt + CZAR_RECONNECT_GRACE_MS);
    });

    it('is empty at game over', () => {
        expect(nextDeadline(reduce(startedGame(), { type: 'END_GAME', by: { kind: 'host' }, now: T0 }))).toBeNull();
    });
});
