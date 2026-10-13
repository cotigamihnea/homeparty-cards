import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadCardLibrary, type CardLibrary } from '../../src/server/cards/library.js';
import { expectOk, gameServer } from './gameServer.js';

let library: CardLibrary;
let game: Awaited<ReturnType<typeof gameServer>>;

beforeAll(() => {
    library = loadCardLibrary();
});
afterEach(async () => {
    await game.close();
});

describe('the host laptop', () => {
    it('its own TV screen is an admin: it can kick, and the kicked phone is told, closed and cannot come back by token', async () => {
        game = await gameServer(library);
        const tv = await game.tv();
        expect(tv.admin).toBe(true);
        await game.join('Ana');
        const bogdan = await game.join('Bogdan');
        const kicked = new Promise<void>((resolve) => bogdan.socket.once('kicked', () => resolve()));
        const closed = new Promise<string>((resolve) => bogdan.socket.once('disconnect', resolve));

        expectOk(await tv.socket.emitWithAck('kick', { playerId: bogdan.id }));
        await kicked;
        expect(await closed).toBe('io server disconnect');
        await tv.views.until((view) => view.players.length === 1);
        expect((await game.resume(bogdan.token)).ack).toEqual({ ok: false, reason: 'KICKED' });
        const rejoined = await game.join('Bogdan');
        expect(rejoined.id).not.toBe(bogdan.id);
    });

    it('a TV screen opened from another device only watches', async () => {
        game = await gameServer(library, { isAdminAddress: () => false });
        const tv = await game.tv();
        expect(tv.admin).toBe(false);
        for (const name of ['Ana', 'Bogdan', 'Cara']) await game.join(name);
        await tv.views.until((view) => view.players.length === 3);
        expect(await tv.socket.emitWithAck('startGame')).toEqual({ ok: false, reason: 'NOT_VIP' });
        expect(await tv.socket.emitWithAck('kick', { playerId: tv.views.latest().players[1]!.id })).toEqual({
            ok: false,
            reason: 'NOT_VIP',
        });
    });

    it('a TV screen cannot also take a seat, and a phone cannot become the TV', async () => {
        game = await gameServer(library);
        const tv = await game.tv();
        expect(await tv.socket.emitWithAck('join', { name: 'Telly' })).toEqual({ ok: false, reason: 'BAD_REQUEST' });
        const ana = await game.join('Ana');
        expect(await ana.socket.emitWithAck('hostHello')).toEqual({ admin: false, decksFolder: null });
        expect(await ana.socket.emitWithAck('startGame')).toEqual({ ok: false, reason: 'NOT_ENOUGH_PLAYERS' });
    });
});

describe('VIP-only actions', () => {
    it('only the VIP phone can change settings, kick or start; the game deals from the chosen packs', async () => {
        game = await gameServer(library);
        const [ana, bogdan, cara] = [await game.join('Ana'), await game.join('Bogdan'), await game.join('Cara')];
        const base = { packIds: ['cah-base-set'], handSize: 7 };
        for (const event of ['startGame', 'endGame', 'playAgain', 'backToLobby', 'advance'] as const) {
            expect(await bogdan.socket.emitWithAck(event)).toEqual({ ok: false, reason: 'NOT_VIP' });
        }
        expect(await bogdan.socket.emitWithAck('updateSettings', { patch: base })).toEqual({
            ok: false,
            reason: 'NOT_VIP',
        });
        expect(await bogdan.socket.emitWithAck('kick', { playerId: cara.id })).toEqual({
            ok: false,
            reason: 'NOT_VIP',
        });

        expectOk(await ana.socket.emitWithAck('updateSettings', { patch: base }));
        expectOk(await ana.socket.emitWithAck('startGame'));
        const view = await cara.views.until((v) => v.phase === 'SUBMITTING');
        const baseWhite = new Set(library.cardsInPack('cah-base-set')!.white);
        expect(view.settings).toMatchObject(base);
        expect(view.hand).toHaveLength(7);
        expect(view.hand.every((card) => baseWhite.has(card.id) && card.text.length > 0)).toBe(true);
    });

    it('refuses packs that do not exist, bad values, and a deck too small to play', async () => {
        game = await gameServer(library);
        const ana = await game.join('Ana');
        for (const patch of [{ packIds: ['no-such-pack'] }, { handSize: 99 }, { secret: 1 }]) {
            expect(await ana.socket.emitWithAck('updateSettings', { patch } as never)).toEqual({
                ok: false,
                reason: 'INVALID_SETTINGS',
            });
        }
        await game.join('Bogdan');
        await game.join('Cara');
        expectOk(await ana.socket.emitWithAck('updateSettings', { patch: { packIds: [] } }));
        expect(await ana.socket.emitWithAck('startGame')).toEqual({ ok: false, reason: 'NOT_ENOUGH_WHITE_CARDS' });
    });
});

describe('payloads', () => {
    it('every event refuses malformed payloads, and events without an ack do not hurt', async () => {
        game = await gameServer(library);
        const ana = await game.join('Ana');
        const raw = ana.socket as unknown as { emitWithAck(event: string, ...args: unknown[]): Promise<unknown> };
        const bad: [string, unknown][] = [
            ['submitCards', { cardIds: 'w1' }],
            ['submitCards', { cardIds: [1] }],
            ['submitCards', { cardIds: ['w1', 'w2', 'w3', 'w4'] }],
            ['submitCards', null],
            ['czarPick', {}],
            ['czarHighlight', { submissionId: 5 }],
            ['kick', null],
            ['transferVip', { playerId: 'x'.repeat(500) }],
            ['updateSettings', 'everything'],
            ['resume', { sessionToken: 42 }],
            ['join', []],
        ];
        for (const [event, payload] of bad) {
            expect([event, await raw.emitWithAck(event, payload)]).toEqual([
                event,
                { ok: false, reason: 'BAD_REQUEST' },
            ]);
        }
        const loose = ana.socket as unknown as { emit(event: string, ...args: unknown[]): void };
        for (const event of ['startGame', 'submitCards', 'kick', 'resume', 'hostHello', 'nonsense']) loose.emit(event);
        loose.emit('czarPick', { submissionId: 'x' }, 'not a function');
        expect((await game.join('Still Up')).name).toBe('Still Up');
    });

    it('a connection that has not joined cannot play', async () => {
        game = await gameServer(library);
        const stranger = game.connect();
        expect(await stranger.emitWithAck('submitCards', { cardIds: ['w1'] })).toEqual({
            ok: false,
            reason: 'NOT_JOINED',
        });
        expect(await stranger.emitWithAck('startGame')).toEqual({ ok: false, reason: 'NOT_JOINED' });
    });
});
