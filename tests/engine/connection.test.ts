import { describe, expect, it } from 'vitest';
import { VIP_RECONNECT_GRACE_MS } from '../../src/shared/constants.js';
import { nextDeadline } from '../../src/server/engine/deadline.js';
import { checkAction } from '../../src/server/engine/rules.js';
import { T0, apply, lobbyWith, seat } from './helpers.js';

const away = (playerId: string, now = T0) => ({ type: 'PLAYER_DISCONNECTED' as const, playerId, now });
const back = (playerId: string, now = T0) => ({ type: 'PLAYER_RECONNECTED' as const, playerId, now });
const tick = (now: number) => ({ type: 'TICK' as const, now });

describe('disconnecting and reconnecting', () => {
    it('keeps the seat and remembers when the phone went away', () => {
        const state = apply(lobbyWith(['Ana', 'Bogdan']), away('p2', T0 + 5));
        expect(state.players).toHaveLength(2);
        expect([seat(state, 'p2').connected, seat(state, 'p2').disconnectedAt]).toEqual([false, T0 + 5]);
        const restored = apply(state, back('p2', T0 + 9));
        expect([seat(restored, 'p2').connected, seat(restored, 'p2').disconnectedAt]).toEqual([true, null]);
    });

    it('refuses unknown seats', () => {
        expect(checkAction(lobbyWith(['Ana']), away('x'))).toBe('UNKNOWN_PLAYER');
        expect(checkAction(lobbyWith(['Ana']), back('x'))).toBe('UNKNOWN_PLAYER');
    });
});

describe('VIP away for 30 s', () => {
    const vipAway = apply(lobbyWith(['Ana', 'Bogdan', 'Cara']), away('p2'), away('p1'));

    it('keeps the crown until the grace period is over', () => {
        expect(apply(vipAway, tick(T0 + VIP_RECONNECT_GRACE_MS - 1)).vipId).toBe('p1');
    });

    it('then passes it to the next connected seat, skipping disconnected ones', () => {
        expect(apply(vipAway, tick(T0 + VIP_RECONNECT_GRACE_MS)).vipId).toBe('p3');
    });

    it('does not give it back when the old VIP returns', () => {
        expect(apply(vipAway, tick(T0 + VIP_RECONNECT_GRACE_MS), back('p1')).vipId).toBe('p3');
    });

    it('keeps the crown when nobody connected could take it', () => {
        const allAway = apply(lobbyWith(['Ana', 'Bogdan']), away('p1'), away('p2'));
        expect(apply(allAway, tick(T0 + 10 * VIP_RECONNECT_GRACE_MS)).vipId).toBe('p1');
    });

    it('wraps around the table to find the next seat', () => {
        const state = apply(
            lobbyWith(['Ana', 'Bogdan', 'Cara']),
            { type: 'TRANSFER_VIP', by: { kind: 'host' }, playerId: 'p3' },
            away('p3'),
        );
        expect(apply(state, tick(T0 + VIP_RECONNECT_GRACE_MS)).vipId).toBe('p1');
    });
});

describe('nextDeadline in the lobby', () => {
    it('is empty when nobody is away', () => {
        expect(nextDeadline(lobbyWith(['Ana', 'Bogdan']))).toBeNull();
    });

    it('is the end of the VIP grace period when the VIP is away and someone can take the crown', () => {
        expect(nextDeadline(apply(lobbyWith(['Ana', 'Bogdan']), away('p1', T0 + 7)))).toBe(
            T0 + 7 + VIP_RECONNECT_GRACE_MS,
        );
    });

    it('is empty when the VIP is away but nobody connected could take the crown', () => {
        expect(nextDeadline(apply(lobbyWith(['Ana']), away('p1')))).toBeNull();
    });
});
