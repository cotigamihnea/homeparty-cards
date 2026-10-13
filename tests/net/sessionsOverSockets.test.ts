import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCardLibrary, type CardLibrary } from '../../src/server/cards/library.js';
import type { HostView } from '../../src/shared/views.js';
import { everyoneAnswers, expectOk, gameServer } from './gameServer.js';

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

async function fourInAGame() {
    const tv = await game.tv();
    const phones = [];
    for (const name of ['Ana', 'Bogdan', 'Cara', 'Dan']) phones.push(await game.join(name));
    expectOk(await phones[0]!.socket.emitWithAck('startGame'));
    await tv.views.until((view) => view.phase === 'SUBMITTING');
    return { tv, phones };
}

describe('session tokens', () => {
    it('join gives each phone a secret token that no screen ever sees', async () => {
        const tv = await game.tv();
        const ana = await game.join('Ana');
        const bogdan = await game.join('Bogdan');
        expect(ana.token).not.toBe(ana.id);
        await tv.views.until((view) => view.players.length === 2);
        const everything = JSON.stringify([tv.views.latest(), bogdan.views.latest(), ana.views.latest()]);
        expect(everything).not.toContain(ana.token);
        expect(everything).not.toContain(bogdan.token);
    });

    it('a phone that comes back with its token gets its seat, hand and answer back', async () => {
        const { tv, phones } = await fourInAGame();
        await everyoneAnswers(phones, 1);
        const answerer = phones.find((phone) => phone.views.latest().mySubmission)!;
        const before = answerer.views.latest();
        answerer.socket.disconnect();
        await tv.views.until((view) => view.players.some((p) => p.id === answerer.id && !p.connected));

        const { ack, phone } = await game.resume(answerer.token);
        expect(ack).toEqual({ ok: true, playerId: answerer.id, sessionToken: answerer.token });
        const after = await phone.views.until((view) => view.myId === answerer.id);
        expect(after.hand).toEqual(before.hand);
        expect(after.mySubmission).toEqual(before.mySubmission);
        await tv.views.until((view) => view.players.every((p) => p.connected));
    });

    it('refuses a token it does not know', async () => {
        const { ack } = await game.resume('not-a-real-token');
        expect(ack).toEqual({ ok: false, reason: 'UNKNOWN_SESSION' });
    });

    it('the newest connection takes over the seat; the old one is told and closed, and the seat never looks away', async () => {
        const tv = await game.tv();
        const ana = await game.join('Ana');
        const tvViews: HostView[] = [];
        tv.socket.on('hostView', (view) => tvViews.push(view));
        const replaced = new Promise<void>((resolve) => ana.socket.once('replaced', () => resolve()));
        const closed = new Promise<void>((resolve) => ana.socket.once('disconnect', () => resolve()));

        const { ack, phone } = await game.resume(ana.token);
        expect(ack).toMatchObject({ ok: true, playerId: ana.id });
        await Promise.all([replaced, closed]);
        await phone.views.until((view) => view.myId === ana.id);
        expect(await phone.socket.emitWithAck('transferVip', { playerId: ana.id })).toEqual({
            ok: false,
            reason: 'UNKNOWN_PLAYER',
        });
        expect(tvViews.every((view) => view.players.every((p) => p.connected))).toBe(true);
    });

    it('a phone cannot take a second seat', async () => {
        const ana = await game.join('Ana');
        const bogdan = await game.join('Bogdan');
        expect(await ana.socket.emitWithAck('resume', { sessionToken: bogdan.token })).toEqual({
            ok: false,
            reason: 'ALREADY_JOINED',
        });
    });

    it('a returning phone without its token still gets its seat back by typing the same name', async () => {
        const tv = await game.tv();
        const ana = await game.join('Ana');
        ana.socket.disconnect();
        await tv.views.until((view) => view.players[0]?.connected === false);
        const again = await game.join('ANA');
        expect([again.id, again.token]).toEqual([ana.id, ana.token]);
    });
});
