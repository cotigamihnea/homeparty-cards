import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCardLibrary, type CardLibrary } from '../../src/server/cards/library.js';
import { czarOf, everyoneAnswers, expectOk, gameServer, pickWhenRevealed, type TestPhone } from './gameServer.js';

let library: CardLibrary;
let game: Awaited<ReturnType<typeof gameServer>>;

beforeAll(() => {
    library = loadCardLibrary();
});
beforeEach(async () => {
    game = await gameServer(library);
});
afterEach(async () => {
    await game.close();
});

async function seated(names: readonly string[]): Promise<TestPhone[]> {
    const phones = [];
    for (const name of names) phones.push(await game.join(name));
    return phones;
}

function sameCards(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

describe('a full game over the network', () => {
    it('four phones play to 5 points: the server deals, times, reveals and scores every round', async () => {
        const tv = await game.tv();
        const phones = await seated(['Ana', 'Bogdan', 'Cara', 'Dan']);
        const [ana] = phones as [TestPhone];
        expectOk(await ana.socket.emitWithAck('updateSettings', { patch: { pointsToWin: 5 } }));
        expectOk(await ana.socket.emitWithAck('startGame'));

        for (let round = 1; round <= 20; round++) {
            const answers = await everyoneAnswers(phones, round);
            const czar = czarOf(phones, ana.views.latest());
            const judging = await czar.views.until((v) => v.phase === 'JUDGING' && v.round?.number === round);
            const tvJudging = await tv.views.until((v) => v.phase === 'JUDGING' && v.round?.number === round);
            expect(tvJudging.judging?.submissions).toEqual(judging.judging?.submissions);

            const favourite = czar.id === ana.id ? [...answers.keys()][0]! : ana.id;
            const chosen = judging.judging!.submissions.find((s) =>
                sameCards(
                    s.cards.map((card) => card.id),
                    answers.get(favourite)!,
                ),
            )!;
            expectOk(await czar.socket.emitWithAck('czarHighlight', { submissionId: chosen.id }));
            await tv.views.until((v) => v.judging?.highlightedId === chosen.id);
            expectOk(await pickWhenRevealed(czar, chosen.id));

            const result = await tv.views.until((v) => v.phase === 'ROUND_RESULT' && v.round?.number === round);
            expect(result.result).toMatchObject({ kind: 'winner', winnerId: favourite });
            if (result.players.some((p) => p.score === 5)) break;
            if (round % 2 === 0) expectOk(await ana.socket.emitWithAck('advance'));
        }

        const over = await tv.views.until((v) => v.phase === 'GAME_OVER');
        expect(over.gameOver?.winnerIds).toEqual([ana.id]);
        expect(over.players.find((p) => p.id === ana.id)?.score).toBe(5);
        expect(over.gameOver?.bestOf.length).toBeGreaterThan(0);

        expectOk(await ana.socket.emitWithAck('playAgain'));
        await tv.views.until((v) => v.phase === 'ROUND_START' && v.players.every((p) => p.score === 0));
        expectOk(await ana.socket.emitWithAck('endGame'));
        await tv.views.until((v) => v.phase === 'GAME_OVER');
        expectOk(await ana.socket.emitWithAck('backToLobby'));
        await tv.views.until((v) => v.phase === 'LOBBY');
    });
});

describe('the Czar dropping while judging', () => {
    async function judgingWithCzarGone() {
        const tv = await game.tv();
        const phones = await seated(['Ana', 'Bogdan', 'Cara', 'Dan', 'Eve']);
        expectOk(await phones[0]!.socket.emitWithAck('startGame'));
        const answers = await everyoneAnswers(phones, 1);
        const czar = czarOf(phones, phones[0]!.views.latest());
        await czar.views.until((v) => v.phase === 'JUDGING');
        czar.socket.disconnect();
        await tv.views.until((v) => v.players.some((p) => p.id === czar.id && !p.connected));
        return { tv, phones, answers, czar };
    }

    it('skips the round after the grace period and gives everyone their cards back', async () => {
        const { tv, phones, answers } = await judgingWithCzarGone();
        const result = await tv.views.until((v) => v.phase === 'ROUND_RESULT');
        expect(result.result).toEqual({ kind: 'void', reason: 'CZAR_LEFT' });
        for (const phone of phones.filter((p) => answers.has(p.id))) {
            const view = await phone.views.until((v) => v.phase === 'ROUND_RESULT');
            const hand = new Set(view.hand.map((card) => card.id));
            expect(answers.get(phone.id)!.every((id) => hand.has(id))).toBe(true);
        }
    });

    it('lets a Czar who is back in time pick as usual', async () => {
        const { tv, czar } = await judgingWithCzarGone();
        const { ack, phone } = await game.resume(czar.token);
        expectOk(ack);
        const view = await phone.views.until((v) => v.phase === 'JUDGING' && v.judging !== null);
        expectOk(await pickWhenRevealed({ ...czar, ...phone }, view.judging!.submissions[0]!.id));
        const result = await tv.views.until((v) => v.phase === 'ROUND_RESULT');
        expect(result.result?.kind).toBe('winner');
    });
});

describe('joining mid-game', () => {
    it('a late joiner waits with no cards and is dealt in at the next round', async () => {
        const tv = await game.tv();
        const phones = await seated(['Ana', 'Bogdan', 'Cara']);
        expectOk(await phones[0]!.socket.emitWithAck('startGame'));
        await everyoneAnswers(phones, 1);
        const eve = await game.join('Eve');
        const waiting = eve.views.latest();
        expect([waiting.hand, waiting.canSubmit]).toEqual([[], false]);
        expect(waiting.players.find((p) => p.id === eve.id)?.inRound).toBe(false);

        const czar = czarOf(phones, phones[0]!.views.latest());
        const judging = await czar.views.until((v) => v.phase === 'JUDGING');
        expectOk(await pickWhenRevealed(czar, judging.judging!.submissions[0]!.id));
        const dealt = await eve.views.until((v) => v.phase === 'SUBMITTING' && v.round?.number === 2);
        expect(dealt.hand).toHaveLength(10);
        expect(dealt.players.find((p) => p.id === eve.id)?.inRound).toBe(true);
        await tv.views.until((v) => v.round?.number === 2);
    });
});
