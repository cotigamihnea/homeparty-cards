import { describe, expect, it } from 'vitest';
import { findReclaimableSeat } from '../../src/server/engine/lobby.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import { createInitialState } from '../../src/server/engine/state.js';
import { HOST, T0, apply, as, deepFreeze, lobbyWith, seat } from './helpers.js';

const join = (playerId: string, name: string) => ({ type: 'PLAYER_JOINED' as const, playerId, name, now: T0 });

describe('joining', () => {
    it('seats players in join order, connected, with no cards or points yet; the first is VIP', () => {
        const state = lobbyWith(['Ana', 'Bogdan']);
        expect(state.players.map((p) => [p.id, p.name, p.seat, p.connected, p.score, p.hand, p.dealtIn])).toEqual([
            ['p1', 'Ana', 0, true, 0, [], false],
            ['p2', 'Bogdan', 1, true, 0, [], false],
        ]);
        expect(state.vipId).toBe('p1');
    });

    it('stores the normalised name', () => {
        expect(seat(lobbyWith(['  Ana   Maria ']), 'p1').name).toBe('Ana Maria');
    });

    it('rejects names already used by any seat, even a disconnected one', () => {
        const state = apply(lobbyWith(['Ana']), { type: 'PLAYER_DISCONNECTED', playerId: 'p1', now: T0 });
        expect(checkAction(state, join('p2', 'ANA'))).toBe('NAME_TAKEN');
    });

    it('rejects invalid names, a 13th player and a repeated id', () => {
        expect(checkAction(createInitialState(), join('p1', '​'))).toBe('NAME_EMPTY');
        expect(checkAction(createInitialState(), join('p1', 'x'.repeat(17)))).toBe('NAME_TOO_LONG');
        const full = lobbyWith(Array.from({ length: 12 }, (_, i) => `Player ${i + 1}`));
        expect(checkAction(full, join('p13', 'Late'))).toBe('GAME_FULL');
        expect(checkAction(lobbyWith(['Ana']), join('p1', 'Other'))).toBe('ALREADY_JOINED');
    });

    it('gives unique avatars and reuses the avatar of a kicked seat', () => {
        const state = lobbyWith(['Ana', 'Bogdan', 'Cara']);
        expect(new Set(state.players.map((p) => p.avatar)).size).toBe(3);
        const freed = seat(state, 'p2').avatar;
        const next = apply(state, { type: 'KICK_PLAYER', by: HOST, playerId: 'p2', now: T0 }, join('p4', 'Dan'));
        expect(seat(next, 'p4').avatar).toBe(freed);
        expect(seat(next, 'p4').seat).toBe(3);
    });
});

describe('findReclaimableSeat', () => {
    it('finds a disconnected seat by name, case-insensitively', () => {
        const state = apply(lobbyWith(['Ana', 'Bogdan']), { type: 'PLAYER_DISCONNECTED', playerId: 'p2', now: T0 });
        expect(findReclaimableSeat(state, ' bogdan ')).toBe('p2');
    });

    it('ignores connected seats and unknown names', () => {
        const state = lobbyWith(['Ana']);
        expect(findReclaimableSeat(state, 'Ana')).toBeNull();
        expect(findReclaimableSeat(state, 'Zoe')).toBeNull();
    });
});

describe('kicking', () => {
    it('lets the VIP or the host remove a seat', () => {
        const byVip = reduce(lobbyWith(['Ana', 'Bogdan']), {
            type: 'KICK_PLAYER',
            by: as('p1'),
            playerId: 'p2',
            now: T0,
        });
        expect(byVip.players.map((p) => p.id)).toEqual(['p1']);
        const byHost = reduce(lobbyWith(['Ana', 'Bogdan']), { type: 'KICK_PLAYER', by: HOST, playerId: 'p2', now: T0 });
        expect(byHost.players.map((p) => p.id)).toEqual(['p1']);
    });

    it('refuses other players, unknown seats and the VIP kicking themselves', () => {
        const state = lobbyWith(['Ana', 'Bogdan']);
        expect(checkAction(state, { type: 'KICK_PLAYER', by: as('p2'), playerId: 'p1', now: T0 })).toBe('NOT_VIP');
        expect(checkAction(state, { type: 'KICK_PLAYER', by: HOST, playerId: 'x', now: T0 })).toBe('UNKNOWN_PLAYER');
        expect(checkAction(state, { type: 'KICK_PLAYER', by: as('p1'), playerId: 'p1', now: T0 })).toBe('BAD_REQUEST');
    });

    it('passes the crown to the next connected seat when the VIP is kicked', () => {
        const state = apply(
            lobbyWith(['Ana', 'Bogdan', 'Cara']),
            { type: 'PLAYER_DISCONNECTED', playerId: 'p2', now: T0 },
            { type: 'KICK_PLAYER', by: HOST, playerId: 'p1', now: T0 },
        );
        expect(state.vipId).toBe('p3');
    });

    it('clears the crown when the last seat is kicked', () => {
        expect(reduce(lobbyWith(['Ana']), { type: 'KICK_PLAYER', by: HOST, playerId: 'p1', now: T0 }).vipId).toBeNull();
    });
});

describe('transferring the crown', () => {
    it('lets the VIP or the host pass it', () => {
        const state = lobbyWith(['Ana', 'Bogdan', 'Cara']);
        expect(reduce(state, { type: 'TRANSFER_VIP', by: as('p1'), playerId: 'p2' }).vipId).toBe('p2');
        expect(reduce(state, { type: 'TRANSFER_VIP', by: HOST, playerId: 'p3' }).vipId).toBe('p3');
    });

    it('refuses non-VIPs, the current VIP as target and unknown seats', () => {
        const state = lobbyWith(['Ana', 'Bogdan']);
        expect(checkAction(state, { type: 'TRANSFER_VIP', by: as('p2'), playerId: 'p2' })).toBe('NOT_VIP');
        expect(checkAction(state, { type: 'TRANSFER_VIP', by: as('p1'), playerId: 'p1' })).toBe('UNKNOWN_PLAYER');
        expect(checkAction(state, { type: 'TRANSFER_VIP', by: HOST, playerId: 'x' })).toBe('UNKNOWN_PLAYER');
    });

    it('refuses to pass it to a player whose phone is away', () => {
        const away = reduce(lobbyWith(['Ana', 'Bogdan']), { type: 'PLAYER_DISCONNECTED', playerId: 'p2', now: T0 });
        expect(checkAction(away, { type: 'TRANSFER_VIP', by: as('p1'), playerId: 'p2' })).toBe('PLAYER_AWAY');
    });
});

describe('settings', () => {
    it('lets the VIP or the host change them in the lobby', () => {
        const state = reduce(lobbyWith(['Ana']), { type: 'UPDATE_SETTINGS', by: as('p1'), settings: { handSize: 8 } });
        expect(state.settings.handSize).toBe(8);
        expect(
            reduce(state, { type: 'UPDATE_SETTINGS', by: HOST, settings: { language: 'ro' } }).settings,
        ).toMatchObject({
            handSize: 8,
            language: 'ro',
        });
    });

    it('refuses other players and invalid values', () => {
        const state = lobbyWith(['Ana', 'Bogdan']);
        expect(checkAction(state, { type: 'UPDATE_SETTINGS', by: as('p2'), settings: { handSize: 8 } })).toBe(
            'NOT_VIP',
        );
        expect(checkAction(state, { type: 'UPDATE_SETTINGS', by: HOST, settings: { handSize: 3 } })).toBe(
            'INVALID_SETTINGS',
        );
    });
});

describe('purity', () => {
    it('returns the same state object for a refused action and never mutates its input', () => {
        const state = deepFreeze(lobbyWith(['Ana', 'Bogdan']));
        expect(reduce(state, join('p3', 'ana'))).toBe(state);
        expect(() =>
            apply(
                state,
                join('p3', 'Cara'),
                { type: 'PLAYER_DISCONNECTED', playerId: 'p1', now: T0 },
                { type: 'PLAYER_RECONNECTED', playerId: 'p1', now: T0 },
                { type: 'TRANSFER_VIP', by: HOST, playerId: 'p2' },
                { type: 'UPDATE_SETTINGS', by: HOST, settings: { handSize: 9 } },
                { type: 'KICK_PLAYER', by: HOST, playerId: 'p3', now: T0 },
                { type: 'TICK', now: T0 + 60_000 },
            ),
        ).not.toThrow();
    });
});
