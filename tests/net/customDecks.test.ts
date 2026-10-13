import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadCardLibrary, type CardLibrary } from '../../src/server/cards/library.js';
import type { CardColor } from '../../src/shared/customCards.js';
import { expectOk, gameServer, type TestPhone } from './gameServer.js';
import type { TestSocket } from './socketHelpers.js';

let library: CardLibrary;
let game: Awaited<ReturnType<typeof gameServer>>;

beforeAll(() => {
    library = loadCardLibrary();
});
afterEach(async () => {
    await game.close();
});

async function newDeck(socket: TestSocket, name: string): Promise<string> {
    const created = await socket.emitWithAck('createDeck', { name });
    if (!created.ok) throw new Error(created.reason);
    return created.deckId;
}

async function fill(socket: TestSocket, deckId: string, color: CardColor, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
        const text = color === 'white' ? `Custom white ${i}.` : `Custom black ${i}: _.`;
        expectOk(await socket.emitWithAck('addDeckCard', { deckId, color, text }));
    }
}

async function threePlayers(): Promise<TestPhone[]> {
    return [await game.join('Ana'), await game.join('Bogdan'), await game.join('Cara')];
}

describe('custom decks over the network', () => {
    it('the VIP builds a deck and plays a game with only that deck', async () => {
        game = await gameServer(library);
        const [ana] = await threePlayers();
        const deckId = await newDeck(ana!.socket, 'Office');
        await fill(ana!.socket, deckId, 'white', 39);
        await fill(ana!.socket, deckId, 'black', 10);
        expectOk(await ana!.socket.emitWithAck('updateSettings', { patch: { packIds: [deckId] } }));
        const view = await ana!.views.until((v) => v.settings.packIds[0] === deckId);
        expect(view.deck).toEqual({ white: 39, black: 10, problem: null });

        expectOk(await ana!.socket.emitWithAck('startGame'));
        const started = await ana!.views.until((v) => v.phase === 'ROUND_START');
        expect(started.round?.black.text).toMatch(/^Custom black \d+: _\.$/);
        expect(started.hand.every((card) => card.text.startsWith('Custom white'))).toBe(true);
    });

    it('only the VIP and the laptop may touch decks, and only in the lobby', async () => {
        game = await gameServer(library);
        const laptop = await game.tv();
        const [ana, bogdan] = await threePlayers();
        const deckId = await newDeck(laptop.socket, 'Laptop deck');
        const card = { deckId, color: 'white' as const, text: 'A.' };
        const refusals = (socket: TestSocket) =>
            Promise.all([
                socket.emitWithAck('getDeck', { deckId }),
                socket.emitWithAck('createDeck', { name: 'Nope' }),
                socket.emitWithAck('renameDeck', { deckId, name: 'Nope' }),
                socket.emitWithAck('addDeckCard', card),
                socket.emitWithAck('editDeckCard', { ...card, oldText: 'A.' }),
                socket.emitWithAck('removeDeckCard', card),
                socket.emitWithAck('deleteDeck', { deckId }),
                socket.emitWithAck('exportDeck', { deckId }),
                socket.emitWithAck('importDeck', { json: '{}' }),
            ]);

        for (const answer of await refusals(bogdan!.socket)) expect(answer).toEqual({ ok: false, reason: 'NOT_VIP' });

        expectOk(await ana!.socket.emitWithAck('startGame'));
        await ana!.views.until((v) => v.phase === 'ROUND_START');
        for (const answer of await refusals(ana!.socket)) {
            expect(answer).toEqual({ ok: false, reason: 'WRONG_PHASE' });
        }
        for (const answer of await refusals(laptop.socket)) {
            expect(answer).toEqual({ ok: false, reason: 'WRONG_PHASE' });
        }
    });

    it('a TV that is not the laptop only watches: no decks, and no folder path', async () => {
        game = await gameServer(library, { isAdminAddress: () => false });
        const watcher = await game.tv();
        expect(watcher.admin).toBe(false);
        expect(await watcher.socket.emitWithAck('hostHello')).toEqual({ admin: false, decksFolder: null });
        expect(await watcher.socket.emitWithAck('createDeck', { name: 'X' })).toEqual({ ok: false, reason: 'NOT_VIP' });
    });

    it('the laptop learns where its decks are saved, and every screen learns when they change', async () => {
        game = await gameServer(library);
        const laptop = await game.tv();
        expect(await laptop.socket.emitWithAck('hostHello')).toEqual({ admin: true, decksFolder: game.decksFolder });
        const ana = await game.join('Ana');
        const before = ana.views.latest().catalogVersion;
        const deckId = await newDeck(laptop.socket, 'Fresh');
        await ana.views.until((v) => v.catalogVersion > before);
        const now = ana.views.latest().catalogVersion;
        expectOk(await ana.socket.emitWithAck('addDeckCard', { deckId, color: 'white', text: 'New.' }));
        await laptop.views.until((v) => v.catalogVersion > now);
        const packs = await ana.socket.emitWithAck('listPacks');
        expect(packs[0]).toEqual({ id: deckId, name: 'Fresh', kind: 'custom', white: 1, black: 0 });
    });

    it('deleting the only selected deck leaves an empty selection that cannot start', async () => {
        game = await gameServer(library);
        const [ana] = await threePlayers();
        const deckId = await newDeck(ana!.socket, 'Doomed');
        await fill(ana!.socket, deckId, 'white', 39);
        await fill(ana!.socket, deckId, 'black', 10);
        expectOk(await ana!.socket.emitWithAck('updateSettings', { patch: { packIds: [deckId] } }));
        await ana!.views.until((v) => v.settings.packIds[0] === deckId);

        expectOk(await ana!.socket.emitWithAck('deleteDeck', { deckId }));
        const view = await ana!.views.until((v) => v.settings.packIds.length === 0);
        expect(view.deck).toEqual({ white: 0, black: 0, problem: 'NOT_ENOUGH_WHITE_CARDS' });
        expect(await ana!.socket.emitWithAck('startGame')).toEqual({ ok: false, reason: 'NOT_ENOUGH_WHITE_CARDS' });
    });

    it('the VIP phone and the laptop removing the same card: one wins, the other is told it is gone', async () => {
        game = await gameServer(library);
        const laptop = await game.tv();
        const ana = await game.join('Ana');
        const deckId = await newDeck(ana.socket, 'Shared');
        await fill(ana.socket, deckId, 'white', 2);
        const remove = { deckId, color: 'white' as const, text: 'Custom white 0.' };
        const answers = await Promise.all([
            ana.socket.emitWithAck('removeDeckCard', remove),
            laptop.socket.emitWithAck('removeDeckCard', remove),
        ]);
        expect(answers).toContainEqual({ ok: true });
        expect(answers).toContainEqual({ ok: false, reason: 'CARD_NOT_FOUND' });
        const deck = await ana.socket.emitWithAck('getDeck', { deckId });
        expect(deck.ok && deck.deck.white).toEqual(['Custom white 1.']);
    });

    it('exports a deck and imports it back as a copy', async () => {
        game = await gameServer(library);
        const ana = await game.join('Ana');
        const deckId = await newDeck(ana.socket, 'Office: Party');
        await fill(ana.socket, deckId, 'white', 2);
        await fill(ana.socket, deckId, 'black', 1);
        const exported = await ana.socket.emitWithAck('exportDeck', { deckId });
        if (!exported.ok) throw new Error(exported.reason);
        expect(exported.fileName).toBe('Office- Party.cah-deck.json');

        const imported = await ana.socket.emitWithAck('importDeck', { json: exported.json });
        if (!imported.ok) throw new Error(imported.reason);
        expect(imported).toMatchObject({ name: 'Office: Party (2)', imported: 3, skipped: 0 });
        const copy = await ana.socket.emitWithAck('getDeck', { deckId: imported.deckId });
        const original = await ana.socket.emitWithAck('getDeck', { deckId });
        if (!copy.ok || !original.ok) throw new Error('missing deck');
        expect({ white: copy.deck.white, black: copy.deck.black }).toEqual({
            white: original.deck.white,
            black: original.deck.black,
        });
    });

    it('refuses an import over 256 KB and payloads of the wrong shape', async () => {
        game = await gameServer(library);
        const ana = await game.join('Ana');
        const deckId = await newDeck(ana.socket, 'Deck');
        const big = 'x'.repeat(256 * 1024 + 1);
        expect(await ana.socket.emitWithAck('importDeck', { json: big })).toEqual({ ok: false, reason: 'BAD_REQUEST' });
        const bad = [
            ['addDeckCard', { deckId, color: 'red', text: 'A.' }],
            ['addDeckCard', { deckId, color: 'white', text: 7 }],
            ['editDeckCard', { deckId, color: 'white', text: 'A.' }],
            ['renameDeck', { deckId }],
            ['getDeck', {}],
            ['createDeck', { name: 'x'.repeat(201) }],
        ] as const;
        for (const [event, payload] of bad) {
            const emit = ana.socket.emitWithAck.bind(ana.socket) as (e: string, p: unknown) => Promise<unknown>;
            expect(await emit(event, payload)).toEqual({ ok: false, reason: 'BAD_REQUEST' });
        }
    });
});
