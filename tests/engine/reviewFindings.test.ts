import { describe, expect, it } from 'vitest';
import { RESUME_MIN_MS, VOID_RESULT_MS } from '../../src/shared/constants.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { HOST, T0, allWhiteCards, apply, expire, lobbyWith, seat, startedGame, submitFirst } from './helpers.js';

const away = (playerId: string, now = T0) => ({ type: 'PLAYER_DISCONNECTED' as const, playerId, now });
const back = (playerId: string, now = T0) => ({ type: 'PLAYER_RECONNECTED' as const, playerId, now });
const kick = (playerId: string, now = T0) => ({ type: 'KICK_PLAYER' as const, by: HOST, playerId, now });

describe('kicking while the game is paused', () => {
    it('keeps the void result frozen and resumes it with its own time, not the old phase’s', () => {
        let state = expire(startedGame({ settings: { submitSeconds: 0 } }));
        state = apply(state, away('p3'), away('p4'), kick('p1', T0 + 5));
        expect(state.round?.outcome).toEqual({ kind: 'void', reason: 'CZAR_LEFT' });
        expect([state.paused, state.phaseEndsAt, state.pausedRemainingMs]).toEqual([true, null, VOID_RESULT_MS]);
        state = apply(state, back('p3', T0 + 50), back('p4', T0 + 60));
        expect(state.phaseEndsAt).toBe(T0 + 60 + Math.max(VOID_RESULT_MS, RESUME_MIN_MS));
        expect(expire(state).round?.number).toBe(2);
    });
});

describe('a crown that nobody could take', () => {
    it('goes to the first player who is back', () => {
        let state = apply(lobbyWith(['Ana', 'Bogdan', 'Cara']), away('p2'), away('p3'), kick('p1'));
        expect(state.vipId).toBeNull();
        state = reduce(state, back('p3', T0 + 10));
        expect(state.vipId).toBe('p3');
    });
});

describe('a Czar who drops during the round intro', () => {
    it('is skipped: the next connected seat judges this round', () => {
        const state = expire(reduce(startedGame(), away('p1', T0 + 1)));
        expect(state.phase).toBe('SUBMITTING');
        expect(state.round?.czarId).toBe('p2');
        const nextRound = expire(expire(state));
        expect(nextRound.round?.czarId).toBe('p3');
    });
});

describe('kicking an author while answers are judged', () => {
    function judgingOfFive() {
        let state = expire(startedGame({ names: ['Ana', 'Bogdan', 'Cara', 'Dan', 'Eve'] }));
        for (const id of ['p2', 'p3', 'p4', 'p5']) state = submitFirst(state, id);
        return state;
    }

    it('leaves their anonymous answer in place so nobody learns which one was theirs', () => {
        const judging = judgingOfFive();
        const kicked = reduce(judging, kick('p4'));
        expect(kicked.phase).toBe('JUDGING');
        expect(kicked.round?.submissions.map((s) => s.id)).toEqual(judging.round?.submissions.map((s) => s.id));
        expect(new Set(allWhiteCards(kicked)).size).toBe(allWhiteCards(kicked).length);
    });

    it('does not lose their cards if the round is then voided', () => {
        const voided = expire(reduce(judgingOfFive(), kick('p4')));
        expect(voided.round?.outcome).toEqual({ kind: 'void', reason: 'CZAR_TIMEOUT' });
        expect(allWhiteCards(voided)).toHaveLength(400);
        expect(new Set(allWhiteCards(voided)).size).toBe(400);
    });

    it('can still be picked, but nobody scores for it', () => {
        const judging = judgingOfFive();
        const theirs = judging.round!.submissions.find((s) => s.playerId === 'p4')!;
        const kicked = reduce(judging, kick('p4'));
        const result = reduce(kicked, {
            type: 'CZAR_PICK',
            playerId: 'p1',
            submissionId: theirs.id,
            now: judging.round!.revealEndsAt,
        });
        expect(result.round?.outcome).toMatchObject({ kind: 'winner', winnerId: 'p4' });
        expect(result.players.every((p) => p.score === 0)).toBe(true);
        expect(allWhiteCards(expire(result))).toHaveLength(400);
        expect(seat(result, 'p2').score).toBe(0);
    });
});
