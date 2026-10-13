import { describe, expect, it } from 'vitest';
import { checkAction } from '../../src/server/engine/rules.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { AVATAR_COUNT } from '../../src/shared/constants.js';
import { lobbyWith, seat, startedGame } from './helpers.js';

const choose = (playerId: string, avatar: number) => ({ type: 'SET_AVATAR' as const, playerId, avatar });

describe('avatars', () => {
    it('a joiner gets the first colour nobody has', () => {
        const state = lobbyWith(['Ana', 'Bogdan', 'Cara']);
        expect(state.players.map((player) => player.avatar)).toEqual([0, 1, 2]);
    });

    it('a player can change to a free colour, and the freed one goes to the next joiner', () => {
        let state = reduce(lobbyWith(['Ana', 'Bogdan']), choose('p1', 7));
        expect(seat(state, 'p1').avatar).toBe(7);
        state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p3', name: 'Cara', now: 0 });
        expect(seat(state, 'p3').avatar).toBe(0);
    });

    it('refuses a colour someone else has', () => {
        const state = lobbyWith(['Ana', 'Bogdan']);
        expect(checkAction(state, choose('p1', 1))).toBe('AVATAR_TAKEN');
        expect(reduce(state, choose('p1', 1))).toBe(state);
    });

    it('accepts your own colour again without changing anything', () => {
        const state = lobbyWith(['Ana', 'Bogdan']);
        expect(checkAction(state, choose('p2', 1))).toBeNull();
        expect(seat(reduce(state, choose('p2', 1)), 'p2').avatar).toBe(1);
    });

    it('refuses colours that do not exist', () => {
        const state = lobbyWith(['Ana']);
        for (const avatar of [-1, AVATAR_COUNT, 1.5, Number.NaN]) {
            expect(checkAction(state, choose('p1', avatar))).toBe('BAD_REQUEST');
        }
    });

    it('refuses an unknown player', () => {
        expect(checkAction(lobbyWith(['Ana']), choose('nobody', 3))).toBe('UNKNOWN_PLAYER');
    });

    it('works during a game too', () => {
        const state = reduce(startedGame(), choose('p2', 11));
        expect(seat(state, 'p2').avatar).toBe(11);
    });
});
