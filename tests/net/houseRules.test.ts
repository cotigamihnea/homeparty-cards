import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCardLibrary, type CardLibrary } from '../../src/server/cards/library.js';
import type { Settings } from '../../src/shared/settings.js';
import { expectOk, gameServer, type TestPhone } from './gameServer.js';

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

/** Four phones in a game with these settings, answers open; returns a phone that answers this round. */
async function answering(settings: Partial<Settings>): Promise<{ phones: TestPhone[]; player: TestPhone }> {
    const phones = [];
    for (const name of ['Ana', 'Bogdan', 'Cara', 'Dan']) phones.push(await game.join(name));
    const [ana] = phones as [TestPhone];
    expectOk(await ana.socket.emitWithAck('updateSettings', { patch: settings }));
    expectOk(await ana.socket.emitWithAck('startGame'));
    const view = await ana.views.until((v) => v.phase === 'SUBMITTING');
    const player = phones.find((phone) => phone.id !== view.round?.czarId)!;
    return { phones, player };
}

describe('house-rule commands over the network', () => {
    it('rebootHand reaches the engine for the phone that sends it', async () => {
        const { player } = await answering({ rebootTheUniverse: true });
        expect(await player.socket.emitWithAck('rebootHand')).toEqual({ ok: false, reason: 'NO_POINTS' });
        const tv = await game.tv();
        expect(await tv.socket.emitWithAck('rebootHand')).toEqual({ ok: false, reason: 'NOT_JOINED' });
    });

    it('rebootHand is refused while the rule is off', async () => {
        const { player } = await answering({});
        expect(await player.socket.emitWithAck('rebootHand')).toEqual({ ok: false, reason: 'RULE_OFF' });
    });

    it('discardCard confesses a card from the hand, and refuses a bad payload', async () => {
        const { player } = await answering({ neverHaveIEver: true });
        const card = (await player.views.until((v) => v.phase === 'SUBMITTING')).hand[0]!;
        expectOk(await player.socket.emitWithAck('discardCard', { cardId: card.id }));
        const view = await player.views.until((v) => v.round!.announcements.length === 1);
        expect(view.round!.announcements[0]).toMatchObject({
            kind: 'confession',
            playerId: player.id,
            text: card.text,
        });
        expect(view.hand.map((c) => c.id)).not.toContain(card.id);
        expect(await player.socket.emitWithAck('discardCard', { cardId: 42 } as never)).toEqual({
            ok: false,
            reason: 'BAD_REQUEST',
        });
    });

    it('submitCards carries what is written on blank cards, and refuses a malformed one', async () => {
        const { player } = await answering({ blankCards: 1 });
        const view = await player.views.until((v) => v.phase === 'SUBMITTING');
        const blank = view.hand.find((card) => card.blank)!;
        expect(view.round!.black.pick).toBeGreaterThanOrEqual(1);
        const others = view.hand.filter((card) => !card.blank).slice(0, view.round!.black.pick - 1);
        const cardIds = [blank.id, ...others.map((card) => card.id)];
        for (const blanks of [{}, [{ cardId: blank.id, text: 7 }], [{ cardId: blank.id, text: 'x'.repeat(401) }]]) {
            expect(await player.socket.emitWithAck('submitCards', { cardIds, blanks } as never)).toEqual({
                ok: false,
                reason: 'BAD_REQUEST',
            });
        }
        expectOk(
            await player.socket.emitWithAck('submitCards', { cardIds, blanks: [{ cardId: blank.id, text: 'Mine' }] }),
        );
        const sent = await player.views.until((v) => v.mySubmission !== null);
        expect(sent.mySubmission![0]).toEqual({ id: blank.id, text: 'Mine', blank: true });
    });
});
