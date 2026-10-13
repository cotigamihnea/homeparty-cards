import { describe, expect, it } from 'vitest';
import { drawWhite } from '../../src/server/engine/deck.js';
import { requirePlayer, requireRound } from '../../src/server/engine/players.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import { createInitialState } from '../../src/server/engine/state.js';
import { HOST, T0, as, lobbyWith, makeDeck, seat, startedGame } from './helpers.js';

describe('engine invariant helpers', () => {
    it('fail loudly instead of silently ignoring a broken invariant', () => {
        expect(() => requireRound(createInitialState())).toThrow(/no current round/);
        expect(() => requirePlayer(createInitialState(), 'ghost')).toThrow(/no seat ghost/);
        expect(requireRound(startedGame()).number).toBe(1);
        expect(requirePlayer(lobbyWith(['Ana']), 'p1').name).toBe('Ana');
    });
});

describe('edge cases the random games rarely reach', () => {
    it('keeps the first disconnect time when a phone is reported away twice', () => {
        const once = reduce(lobbyWith(['Ana', 'Bogdan']), { type: 'PLAYER_DISCONNECTED', playerId: 'p1', now: T0 });
        const twice = reduce(once, { type: 'PLAYER_DISCONNECTED', playerId: 'p1', now: T0 + 25_000 });
        expect(seat(twice, 'p1').disconnectedAt).toBe(T0);
    });

    it('draws fewer cards instead of failing when no white card is left anywhere', () => {
        const state = { ...startedGame(), whiteDraw: ['last'], whiteDiscard: [] };
        const [cards, after] = drawWhite(state, 3);
        expect(cards).toEqual(['last']);
        expect([after.whiteDraw, after.whiteDiscard]).toEqual([[], []]);
    });

    it('only lets the VIP or host replay or leave a finished game', () => {
        const over = reduce(startedGame(), { type: 'END_GAME', by: HOST, now: T0 });
        expect(checkAction(over, { type: 'PLAY_AGAIN', by: as('p2'), deck: makeDeck(), seed: 1, now: T0 })).toBe(
            'NOT_VIP',
        );
        expect(checkAction(over, { type: 'BACK_TO_LOBBY', by: as('p2') })).toBe('NOT_VIP');
    });
});
