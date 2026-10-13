import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import { standings } from '../../src/server/engine/scoring.js';
import {
    HOST,
    T0,
    apply,
    as,
    expire,
    lobbyWith,
    makeDeck,
    playRound,
    playRounds,
    seat,
    startedGame,
} from './helpers.js';

describe('points to win', () => {
    it('ends the game when someone reaches the target, after the result screen', () => {
        const state = playRounds(startedGame({ settings: { pointsToWin: 5 } }), 40, 'p2');
        expect(state.phase).toBe('GAME_OVER');
        expect(state.winnerIds).toEqual(['p2']);
        expect(seat(state, 'p2').score).toBe(5);
        expect(state.phaseEndsAt).toBeNull();
    });

    it('keeps playing until then', () => {
        const state = playRounds(startedGame({ settings: { pointsToWin: 10 } }), 6, 'p2');
        expect(state.phase).toBe('ROUND_START');
    });
});

describe('round limit (unlimited points)', () => {
    it('ends after the last round with a clear leader', () => {
        const state = playRounds(startedGame({ settings: { pointsToWin: null, roundLimit: 10 } }), 10, 'p2');
        expect(state.phase).toBe('GAME_OVER');
        expect(state.winnerIds).toEqual(['p2']);
    });

    it('keeps going with no limit', () => {
        const state = playRounds(startedGame({ settings: { pointsToWin: null, roundLimit: null } }), 25, 'p2');
        expect(state.phase).toBe('ROUND_START');
        expect(state.round?.number).toBe(26);
    });
});

describe('sudden death', () => {
    /** Round limit 10 with the Czar rotating p1→p4: p2 and p3 alternate wins and end 5–5. */
    function tiedAtLimit() {
        let state = startedGame({ settings: { pointsToWin: null, roundLimit: 10 } });
        for (const winner of ['p2', 'p3', 'p2', 'p3', 'p2', 'p3', 'p2', 'p3', 'p2', 'p3']) {
            state = expire(playRound(state, winner));
        }
        return state;
    }

    it('starts when the round limit ends in a tie, with only the tied players answering', () => {
        const state = tiedAtLimit();
        expect([seat(state, 'p2').score, seat(state, 'p3').score]).toEqual([5, 5]);
        expect(state.suddenDeath).toEqual({ round: 1, contenderIds: ['p2', 'p3'] });
        expect(state.round?.number).toBe(11);
        expect(['p1', 'p4']).toContain(state.round?.czarId);
        const submitting = expire(state);
        const outsider = ['p1', 'p4'].find((id) => id !== state.round?.czarId)!;
        expect(
            checkAction(submitting, {
                type: 'SUBMIT_CARDS',
                playerId: outsider,
                cardIds: seat(submitting, outsider).hand.slice(0, 1),
                now: T0,
            }),
        ).toBe('NOT_IN_ROUND');
    });

    it('ends as soon as one contender wins a round', () => {
        const state = expire(playRound(tiedAtLimit(), 'p3'));
        expect(state.phase).toBe('GAME_OVER');
        expect(state.winnerIds).toEqual(['p3']);
        expect(state.suddenDeath).toBeNull();
    });

    it('gives up after 3 sudden-death rounds and declares co-winners', () => {
        let state = tiedAtLimit();
        for (let i = 0; i < 3; i++) state = expire(expire(expire(state)));
        expect(state.phase).toBe('GAME_OVER');
        expect(state.winnerIds).toEqual(['p2', 'p3']);
    });

    it('when everyone is tied, the Czar rotates as usual and cannot win', () => {
        let state = startedGame({ names: ['Ana', 'Bogdan', 'Cara'], settings: { pointsToWin: null, roundLimit: 15 } });
        for (let i = 0; i < 5; i++) {
            for (const winner of ['p2', 'p3', 'p1']) state = expire(playRound(state, winner));
        }
        expect(state.suddenDeath).toEqual({ round: 1, contenderIds: ['p1', 'p2', 'p3'] });
        const czar = state.round!.czarId;
        const submitting = expire(state);
        expect(
            checkAction(submitting, {
                type: 'SUBMIT_CARDS',
                playerId: czar,
                cardIds: seat(submitting, czar).hand.slice(0, 1),
                now: T0,
            }),
        ).toBe('CZAR_CANNOT_SUBMIT');
    });
});

describe('ending, replaying and leaving', () => {
    it('lets the VIP or host end a game early; ties become co-winners', () => {
        const state = reduce(startedGame(), { type: 'END_GAME', by: as('p1'), now: T0 });
        expect(state.phase).toBe('GAME_OVER');
        expect(state.winnerIds).toEqual(['p1', 'p2', 'p3', 'p4']);
        expect(checkAction(startedGame(), { type: 'END_GAME', by: as('p2'), now: T0 })).toBe('NOT_VIP');
        expect(checkAction(lobbyWith(['Ana']), { type: 'END_GAME', by: HOST, now: T0 })).toBe('WRONG_PHASE');
    });

    it('ranks players with shared places for ties', () => {
        let state = startedGame();
        state = expire(playRound(state, 'p2'));
        state = expire(playRound(state, 'p3'));
        state = reduce(expire(playRound(state, 'p2')), { type: 'END_GAME', by: HOST, now: T0 });
        expect(standings(state)).toEqual([
            { playerId: 'p2', score: 2, rank: 1 },
            { playerId: 'p3', score: 1, rank: 2 },
            { playerId: 'p1', score: 0, rank: 3 },
            { playerId: 'p4', score: 0, rank: 3 },
        ]);
    });

    it('plays again with the same seats and settings, scores reset', () => {
        const over = reduce(playRounds(startedGame({ settings: { handSize: 8 } }), 3, 'p2'), {
            type: 'END_GAME',
            by: HOST,
            now: T0,
        });
        const again = reduce(over, { type: 'PLAY_AGAIN', by: as('p1'), deck: makeDeck(), seed: 99, now: T0 });
        expect(again.phase).toBe('ROUND_START');
        expect(again.round?.number).toBe(1);
        expect(again.players.every((p) => p.score === 0 && p.hand.length === 8)).toBe(true);
        expect(again.bestOf).toEqual([]);
        expect(checkAction(startedGame(), { type: 'PLAY_AGAIN', by: HOST, deck: makeDeck(), seed: 1, now: T0 })).toBe(
            'WRONG_PHASE',
        );
    });

    it('goes back to the lobby keeping seats, crown and settings', () => {
        const over = reduce(startedGame({ settings: { handSize: 9 } }), { type: 'END_GAME', by: HOST, now: T0 });
        const lobby = reduce(over, { type: 'BACK_TO_LOBBY', by: HOST });
        expect(lobby.phase).toBe('LOBBY');
        expect(lobby.players.map((p) => [p.id, p.score, p.hand.length, p.dealtIn])).toEqual([
            ['p1', 0, 0, false],
            ['p2', 0, 0, false],
            ['p3', 0, 0, false],
            ['p4', 0, 0, false],
        ]);
        expect([lobby.vipId, lobby.settings.handSize, lobby.round, lobby.whiteDraw.length]).toEqual(['p1', 9, null, 0]);
        expect(checkAction(startedGame(), { type: 'BACK_TO_LOBBY', by: HOST })).toBe('WRONG_PHASE');
    });

    it('allows settings changes between games', () => {
        const over = reduce(startedGame(), { type: 'END_GAME', by: HOST, now: T0 });
        expect(
            apply(over, { type: 'UPDATE_SETTINGS', by: HOST, settings: { pointsToWin: 10 } }).settings.pointsToWin,
        ).toBe(10);
        expect(checkAction(startedGame(), { type: 'UPDATE_SETTINGS', by: HOST, settings: { pointsToWin: 10 } })).toBe(
            'WRONG_PHASE',
        );
    });
});
