import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadCardLibrary, type CardLibrary } from '../../src/server/cards/library.js';
import { expectOk, gameServer, type TestPhone } from './gameServer.js';

let library: CardLibrary;
let game: Awaited<ReturnType<typeof gameServer>>;

beforeAll(() => {
    library = loadCardLibrary();
});
afterEach(async () => {
    await game.close();
});

async function feverTable(options: Parameters<typeof gameServer>[1] = {}): Promise<TestPhone[]> {
    game = await gameServer(library, options);
    const phones = [await game.join('Ana'), await game.join('Bogdan'), await game.join('Cara')];
    expectOk(
        await phones[0]!.socket.emitWithAck('updateSettings', { patch: { gameMode: 'customFever', handSize: 7 } }),
    );
    expectOk(await phones[0]!.socket.emitWithAck('startGame'));
    await phones[0]!.views.until((view) => view.phase === 'WRITING');
    return phones;
}

describe('Custom Fever over the network', () => {
    it('each phone writes, edits and removes its own cards; nobody else can touch them', async () => {
        const [ana, bogdan] = await feverTable();
        const tv = await game.tv();
        expectOk(await ana!.socket.emitWithAck('writeCard', { color: 'white', text: 'A stapler.' }));
        const mine = await ana!.views.until((view) => view.myWritten.length === 1);
        const cardId = mine.myWritten[0]!.id;
        expect(await bogdan!.socket.emitWithAck('editWrittenCard', { cardId, text: 'Mine.' })).toEqual({
            ok: false,
            reason: 'NOT_YOUR_CARD',
        });
        expect(await bogdan!.socket.emitWithAck('removeWrittenCard', { cardId })).toEqual({
            ok: false,
            reason: 'NOT_YOUR_CARD',
        });
        expect(await tv.socket.emitWithAck('writeCard', { color: 'white', text: 'TV card.' })).toEqual({
            ok: false,
            reason: 'NOT_JOINED',
        });
        expectOk(await ana!.socket.emitWithAck('editWrittenCard', { cardId, text: 'A stapler with feelings.' }));
        await ana!.views.until((view) => view.myWritten[0]?.text === 'A stapler with feelings.');
        expectOk(await ana!.socket.emitWithAck('removeWrittenCard', { cardId }));
        await ana!.views.until((view) => view.myWritten.length === 0);
        for (const payload of [
            { color: 'red', text: 'x' },
            { color: 'white' },
            { color: 'white', text: 'x'.repeat(1001) },
        ]) {
            const emit = ana!.socket.emitWithAck.bind(ana!.socket) as (e: string, p: unknown) => Promise<unknown>;
            expect(await emit('writeCard', payload)).toEqual({ ok: false, reason: 'BAD_REQUEST' });
        }
    });

    it('the VIP can start before everyone is done; others cannot', async () => {
        const [ana, bogdan] = await feverTable();
        expectOk(await ana!.socket.emitWithAck('writeCard', { color: 'black', text: 'Why _?' }));
        expect(await bogdan!.socket.emitWithAck('startNow')).toEqual({ ok: false, reason: 'NOT_VIP' });
        expectOk(await ana!.socket.emitWithAck('startNow'));
        await ana!.views.until((view) => view.phase === 'ROUND_START' || view.phase === 'SUBMITTING');
    });

    it('saves exactly the written cards as a custom deck, once, at the game over', async () => {
        const [ana, bogdan, cara] = await feverTable();
        expectOk(await ana!.socket.emitWithAck('writeCard', { color: 'white', text: 'Bees.' }));
        expectOk(await bogdan!.socket.emitWithAck('writeCard', { color: 'white', text: 'bees' }));
        expectOk(await cara!.socket.emitWithAck('writeCard', { color: 'black', text: 'Why _?' }));
        expect(await ana!.socket.emitWithAck('saveFeverDeck', { name: 'Too soon' })).toEqual({
            ok: false,
            reason: 'WRONG_PHASE',
        });
        expectOk(await ana!.socket.emitWithAck('endGame'));
        await ana!.views.until((view) => view.phase === 'GAME_OVER');
        expect(await bogdan!.socket.emitWithAck('saveFeverDeck', { name: 'Mine' })).toEqual({
            ok: false,
            reason: 'NOT_VIP',
        });

        expect(await ana!.socket.emitWithAck('saveFeverDeck', { name: 'Party night' })).toEqual({
            ok: true,
            name: 'Party night',
        });
        const saved = await cara!.views.until((view) => view.gameOver?.fever?.savedAs === 'Party night');
        expect(saved.gameOver?.fever).toEqual({ white: 2, black: 1, savedAs: 'Party night' });
        const deck = game.server.decks.list().find((d) => d.name === 'Party night')!;
        // "Bees." and "bees" are one card; which spelling stays depends on the random card order.
        expect(deck.white).toHaveLength(1);
        expect(['Bees.', 'bees']).toContain(deck.white[0]);
        expect(deck.black).toEqual([{ text: 'Why _?', pick: 1 }]);
        expect(await ana!.socket.emitWithAck('saveFeverDeck', { name: 'Again' })).toEqual({
            ok: false,
            reason: 'ALREADY_SAVED',
        });
        expect(game.server.decks.list()).toHaveLength(1);
        const packs = await ana!.socket.emitWithAck('listPacks');
        expect(packs[0]).toMatchObject({ name: 'Party night', kind: 'custom', white: 1, black: 1 });
    });

    it('a classic game has nothing to save, and writes no file', async () => {
        game = await gameServer(library);
        const phones = [await game.join('Ana'), await game.join('Bogdan'), await game.join('Cara')];
        expectOk(await phones[0]!.socket.emitWithAck('startGame'));
        expectOk(await phones[0]!.socket.emitWithAck('endGame'));
        await phones[0]!.views.until((view) => view.phase === 'GAME_OVER');
        expect(await phones[0]!.socket.emitWithAck('saveFeverDeck', { name: 'X' })).toEqual({
            ok: false,
            reason: 'WRONG_PHASE',
        });
        expect(game.server.decks.list()).toEqual([]);
    });

    it('when the disk refuses, says so and leaves the cards unsaved, so the VIP can try again', async () => {
        const notAFolder = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cah-fever-')), 'decks');
        fs.writeFileSync(notAFolder, 'a file where the folder should be');
        const [ana] = await feverTable({ customDecksDir: notAFolder });
        expectOk(await ana!.socket.emitWithAck('writeCard', { color: 'white', text: 'A.' }));
        expectOk(await ana!.socket.emitWithAck('endGame'));
        await ana!.views.until((view) => view.phase === 'GAME_OVER');
        expect(await ana!.socket.emitWithAck('saveFeverDeck', { name: 'Party night' })).toEqual({
            ok: false,
            reason: 'DECK_SAVE_FAILED',
        });
        expect(ana!.views.latest().gameOver?.fever?.savedAs).toBeNull();
        fs.rmSync(path.dirname(notAFolder), { recursive: true, force: true });
    });
});
