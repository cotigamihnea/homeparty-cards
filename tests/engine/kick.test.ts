import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/server/engine/reduce.js';
import type { GameState } from '../../src/server/engine/state.js';
import { HOST, T0, allWhiteCards, expire, playRound, seat, startedGame, submitFirst } from './helpers.js';

const kick = (playerId: string) => ({ type: 'KICK_PLAYER' as const, by: HOST, playerId, now: T0 + 1 });
const five = ['Ana', 'Bogdan', 'Cara', 'Dan', 'Eve'];

function conserved(state: GameState): boolean {
    const cards = allWhiteCards(state);
    return cards.length === 400 && new Set(cards).size === 400;
}

describe('kicking during a game', () => {
    it('discards the kicked hand and answer and keeps every other card where it is', () => {
        const submitting = submitFirst(expire(startedGame({ names: five })), 'p3');
        const state = reduce(submitting, kick('p3'));
        expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p4', 'p5']);
        expect(state.round?.pending).toEqual([]);
        expect(conserved(state)).toBe(true);
    });

    it('voids the round when the Czar is kicked, giving answers back', () => {
        const submitting = submitFirst(expire(startedGame({ names: five })), 'p3');
        const state = reduce(submitting, kick('p1'));
        expect(state.round?.outcome).toEqual({ kind: 'void', reason: 'CZAR_LEFT' });
        expect(state.players.every((p) => p.hand.length === 10)).toBe(true);
        expect(conserved(state)).toBe(true);
    });

    it('keeps the result on screen when the winner is kicked, and still discards the cards later', () => {
        const result = playRound(startedGame({ names: five }), 'p3');
        const state = reduce(result, kick('p3'));
        expect(state.phase).toBe('ROUND_RESULT');
        expect(conserved(state)).toBe(true);
        expect(conserved(expire(state))).toBe(true);
    });

    it('removes a kicked contender from sudden death', () => {
        let state = startedGame({ names: five, settings: { pointsToWin: null, roundLimit: 10 } });
        for (let round = 0; round < 10; round++) {
            const czar = state.round!.czarId;
            const [p2, p3] = [seat(state, 'p2').score, seat(state, 'p3').score];
            const winner = czar === 'p2' ? 'p3' : czar === 'p3' ? 'p2' : p3 < p2 ? 'p3' : 'p2';
            state = expire(playRound(state, winner));
        }
        expect(state.suddenDeath?.contenderIds).toEqual(['p2', 'p3']);
        expect(reduce(state, kick('p3')).suddenDeath?.contenderIds).toEqual(['p2']);
    });

    it('pauses when the kick leaves fewer than 3 connected players', () => {
        const state = reduce(expire(startedGame({ names: ['Ana', 'Bogdan', 'Cara'] })), kick('p3'));
        expect(state.paused).toBe(true);
    });
});
