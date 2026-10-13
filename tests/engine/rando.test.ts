import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/server/engine/reduce.js';
import type { GameState } from '../../src/server/engine/state.js';
import { toHostView } from '../../src/server/engine/views.js';
import { RANDO_ID } from '../../src/shared/constants.js';
import type { Settings } from '../../src/shared/settings.js';
import { NETWORK, TEXTS, allWhiteCards, expire, playRound, startedGame, submitFirst, withScores } from './helpers.js';

const RANDO = { randoCardrissian: true } satisfies Partial<Settings>;

function answering(settings: Partial<Settings> = RANDO): GameState {
    return expire(startedGame({ settings }));
}

function everyoneAnswers(state: GameState): GameState {
    return ['p2', 'p3', 'p4'].reduce((next, id) => submitFirst(next, id), state);
}

/** Round 10 of a game that ends after 10 rounds, everyone has answered, with these scores. */
function lastRound(scores: Record<string, number>, randoScore = 0): GameState {
    const state = everyoneAnswers(answering({ ...RANDO, pointsToWin: null, roundLimit: 10 }));
    return withScores({ ...state, round: { ...state.round!, number: 10 }, rando: { score: randoScore } }, scores);
}

/** Rando's answer is picked by the Czar. */
function randoWins(state: GameState): GameState {
    const round = state.round!;
    const randos = round.submissions.find((submission) => submission.playerId === RANDO_ID)!;
    return reduce(state, {
        type: 'CZAR_PICK',
        playerId: round.czarId,
        submissionId: randos.id,
        now: round.revealEndsAt,
    });
}

describe('Rando Cardrissian', () => {
    it('is not in the game while the house rule is off', () => {
        const judging = everyoneAnswers(answering({}));
        expect(judging.rando).toBeNull();
        expect(judging.round?.submissions.map((s) => s.playerId)).not.toContain(RANDO_ID);
    });

    it('answers with cards from the deck once the players have, never counted as a player', () => {
        const start = answering();
        expect(start.rando).toEqual({ score: 0 });
        expect(start.players.map((p) => p.id)).not.toContain(RANDO_ID);
        const waiting = submitFirst(submitFirst(start, 'p2'), 'p3');
        expect(toHostView(waiting, NETWORK, TEXTS, 0).round).toMatchObject({ answeredCount: 2, expectedCount: 3 });
        const judging = submitFirst(waiting, 'p4');
        expect(judging.phase).toBe('JUDGING');
        const randos = judging.round!.submissions.filter((s) => s.playerId === RANDO_ID);
        expect(randos).toHaveLength(1);
        expect(randos[0]!.cardIds).toHaveLength(1);
        expect(judging.players.flatMap((p) => p.hand)).not.toContain(randos[0]!.cardIds[0]);
        expect(new Set(allWhiteCards(judging)).size).toBe(allWhiteCards(judging).length);
    });

    it('makes the second answer a round needs, so one player against Rando is still judged', () => {
        const judging = expire(submitFirst(answering(), 'p2'));
        expect(judging.phase).toBe('JUDGING');
        expect(judging.round?.submissions).toHaveLength(2);
    });

    it('sits a round out when the deck has no cards left for it', () => {
        const judging = everyoneAnswers({ ...answering(), whiteDraw: [], whiteDiscard: [] });
        expect(judging.phase).toBe('JUDGING');
        expect(judging.round?.submissions.map((s) => s.playerId)).not.toContain(RANDO_ID);
    });

    it('alone is not enough: the round is skipped and its cards are discarded', () => {
        const skipped = expire(answering());
        expect(skipped.round?.outcome).toEqual({ kind: 'void', reason: 'TOO_FEW_SUBMISSIONS' });
        expect(new Set(allWhiteCards(skipped)).size).toBe(400);
    });

    it('scores its own wins, credited as the author', () => {
        const won = randoWins(everyoneAnswers(answering()));
        expect(won.rando).toEqual({ score: 1 });
        expect(won.players.every((p) => p.score === 0)).toBe(true);
        expect(won.bestOf.at(-1)?.winnerId).toBe(RANDO_ID);
        const view = toHostView(won, NETWORK, TEXTS, 0);
        expect(view.rando).toEqual({ score: 1 });
        expect(view.result).toMatchObject({ kind: 'winner', winnerId: RANDO_ID });
    });

    it('wins the game on reaching the target, and everyone else goes home in shame', () => {
        const nearly = { ...everyoneAnswers(answering({ ...RANDO, pointsToWin: 5 })), rando: { score: 4 } };
        const over = expire(randoWins(nearly));
        expect(over.phase).toBe('GAME_OVER');
        expect(over.winnerIds).toEqual([RANDO_ID]);
        expect(toHostView(over, NETWORK, TEXTS, 0).gameOver?.standings[0]).toEqual({
            playerId: RANDO_ID,
            score: 5,
            rank: 1,
        });
    });

    it('goes to sudden death when it ties for the lead after the round limit, and answers there', () => {
        const sudden = expire(randoWins(lastRound({ p2: 3 }, 2)));
        expect(sudden.suddenDeath).toEqual({ round: 1, contenderIds: ['p2', RANDO_ID] });
        const judging = submitFirst(expire(sudden), 'p2');
        expect(judging.round?.submissions.map((s) => s.playerId).sort()).toEqual([RANDO_ID, 'p2'].sort());
    });

    it('sits out a sudden death it is not part of', () => {
        const sudden = expire(playRound(lastRound({ p2: 3, p3: 3 }), 'p4'));
        expect(sudden.suddenDeath?.contenderIds).toEqual(['p2', 'p3']);
        const judging = submitFirst(submitFirst(expire(sudden), 'p2'), 'p3');
        expect(judging.round?.submissions.map((s) => s.playerId)).not.toContain(RANDO_ID);
    });
});
