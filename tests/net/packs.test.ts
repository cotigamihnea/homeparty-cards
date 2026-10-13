import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openDeckStore } from '../../src/server/cards/customDecks.js';
import { loadCardLibrary, type CardLibrary } from '../../src/server/cards/library.js';
import { cardSource } from '../../src/server/cards/source.js';
import type { ServerHello } from '../../src/shared/events.js';
import { expectOk, gameServer } from './gameServer.js';

let library: CardLibrary;
let game: Awaited<ReturnType<typeof gameServer>> | null = null;

beforeAll(() => {
    library = loadCardLibrary();
});
afterEach(async () => {
    await game?.close();
    game = null;
});

describe('the card source', () => {
    it('lists every pack in library order with its unique card counts', () => {
        const catalog = cardSource(library).catalog();
        expect(catalog).toHaveLength(library.packs.length);
        expect(catalog[0]).toEqual({ id: 'cah-base-set', name: 'CAH Base Set', kind: 'base', white: 1269, black: 278 });
        expect(catalog.map((pack) => pack.id)).toEqual(library.packs.map((pack) => pack.id));
    });

    it('counts the deck of a selection without duplicates, and remembers the last selection', () => {
        const source = cardSource(library);
        const official = library.packs.filter((pack) => pack.official).map((pack) => pack.id);
        const size = source.deckSize(official);
        expect(size).toEqual({ white: 4351, black: 951, custom: false });
        expect(source.deckSize([...official])).toBe(size);
        expect(source.deckSize([])).toEqual({ white: 0, black: 0, custom: false });
    });

    it("adds the laptop's own decks as packs, first, and follows every change to them", () => {
        const store = openDeckStore(fs.mkdtempSync(path.join(os.tmpdir(), 'cah-decks-')), undefined, () => {});
        const source = cardSource(library, store);
        const created = store.create('Office');
        if (!created.ok) throw new Error(created.reason);
        const id = created.deckId;
        store.addCard(id, 'white', 'A stapler.');
        const version = source.catalogVersion();
        expect(source.catalog()[0]).toEqual({ id, name: 'Office', kind: 'custom', white: 1, black: 0 });
        expect(source.hasPack(id)).toBe(true);
        expect(source.deckSize([id])).toEqual({ white: 1, black: 0, custom: true });
        expect(source.deckSize(['cah-base-set'])).toEqual({ white: 1269, black: 278, custom: false });

        store.addCard(id, 'black', 'Why _?');
        expect(source.catalogVersion()).toBeGreaterThan(version);
        expect(source.deckSize([id])).toEqual({ white: 1, black: 1, custom: true });
        const dealt = source.dealDeck([id, 'cah-base-set']);
        expect(dealt.custom).toBe(true);
        expect(dealt.white[0]).toBe(`${id}:w0`);
        expect(source.whiteText(`${id}:w0`)).toBe('A stapler.');
        expect(source.dealDeck(['cah-base-set']).custom).toBe(false);

        store.remove(id);
        expect(source.hasPack(id)).toBe(false);
        expect(source.catalog()[0]?.id).toBe('cah-base-set');
    });

    it('keeps the "Make a haiku." card at hand for the Happy Ending, whichever packs are chosen', () => {
        const source = cardSource(library);
        const fanOnly = library.packs.filter((pack) => pack.kind === 'fan').map((pack) => pack.id);
        const haiku = source.dealDeck(fanOnly).haiku!;
        expect(haiku.pick).toBe(3);
        expect(source.blackText(haiku.id)).toBe('Make a haiku.');
        expect(source.dealDeck(['cah-base-set']).haiku).toEqual(haiku);
    });
});

describe('over the network', () => {
    it('any screen can ask for the pack list', async () => {
        game = await gameServer(library);
        const socket = game.connect();
        const packs = await socket.emitWithAck('listPacks');
        expect(packs).toHaveLength(library.packs.length);
        expect(packs[0]?.id).toBe('cah-base-set');
    });

    it('every view carries the deck the selected packs make, and what is missing', async () => {
        game = await gameServer(library);
        const tv = await game.tv();
        const ana = await game.join('Ana');
        expect(ana.views.latest().deck).toEqual({ white: 4351, black: 951, problem: null });
        expectOk(await ana.socket.emitWithAck('updateSettings', { patch: { packIds: [] } }));
        const view = await tv.views.until((v) => v.deck.white === 0);
        expect(view.deck).toEqual({ white: 0, black: 0, problem: 'NOT_ENOUGH_WHITE_CARDS' });
    });

    it('a player picks a free colour; a taken one, a TV screen or a bad payload is refused', async () => {
        game = await gameServer(library);
        const tv = await game.tv();
        const ana = await game.join('Ana');
        const bogdan = await game.join('Bogdan');
        expectOk(await ana.socket.emitWithAck('setAvatar', { avatar: 9 }));
        const view = await tv.views.until((v) => v.players[0]?.avatar === 9);
        expect(view.players.map((player) => player.avatar)).toEqual([9, 1]);
        expect(await bogdan.socket.emitWithAck('setAvatar', { avatar: 9 })).toEqual({
            ok: false,
            reason: 'AVATAR_TAKEN',
        });
        expect(await tv.socket.emitWithAck('setAvatar', { avatar: 3 })).toEqual({ ok: false, reason: 'NOT_JOINED' });
        for (const payload of [{ avatar: '3' }, { avatar: 12 }, { avatar: -1 }, { avatar: 1.5 }, {}]) {
            expect(await bogdan.socket.emitWithAck('setAvatar', payload as { avatar: number })).toEqual({
                ok: false,
                reason: 'BAD_REQUEST',
            });
        }
    });

    it('a new game language reaches every screen, even a phone that has not joined yet', async () => {
        game = await gameServer(library);
        const ana = await game.join('Ana');
        const waiting = game.connect();
        const hello = new Promise<ServerHello>((resolve) => {
            waiting.on('serverHello', (message) => {
                if (message.lang === 'ro') resolve(message);
            });
        });
        await new Promise<void>((resolve) => waiting.once('connect', () => resolve()));
        expectOk(await ana.socket.emitWithAck('updateSettings', { patch: { language: 'ro' } }));
        expect(await hello).toEqual({ lang: 'ro' });
        expect((await ana.views.until((v) => v.lang === 'ro')).lang).toBe('ro');
    });
});
