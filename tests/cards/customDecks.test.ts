import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECK_FORMAT } from '../../src/server/cards/customDeckFile.js';
import { openDeckStore, type DeckFs, type DeckStore } from '../../src/server/cards/customDecks.js';

let folder: string;
const quiet = () => {};

beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cah-decks-'));
});
afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
});

function created(store: DeckStore, name: string): string {
    const outcome = store.create(name);
    if (!outcome.ok) throw new Error(outcome.reason);
    return outcome.deckId;
}

const files = () => fs.readdirSync(folder).sort();
const fileOf = (deckId: string) => JSON.parse(fs.readFileSync(path.join(folder, `${deckId}.json`), 'utf8'));

describe('the custom deck store', () => {
    it('saves each deck in its own file, named by an id the server makes', () => {
        const store = openDeckStore(folder, undefined, quiet);
        const id = created(store, '../../evil');
        expect(id).toMatch(/^custom-[0-9a-f]{8}$/);
        expect(files()).toEqual([`${id}.json`]);
        expect(fileOf(id)).toEqual({ format: DECK_FORMAT, version: 1, name: '../../evil', white: [], black: [] });
        expect(store.list().map((deck) => deck.name)).toEqual(['../../evil']);
    });

    it('starts empty when the folder does not exist yet, and makes it on the first save', () => {
        const missing = path.join(folder, 'not-yet');
        const store = openDeckStore(missing, undefined, quiet);
        expect(store.list()).toEqual([]);
        created(store, 'First');
        expect(fs.readdirSync(missing)).toHaveLength(1);
    });

    it('renames, adds, edits and removes cards, writing the file and counting versions each time', () => {
        const store = openDeckStore(folder, undefined, quiet);
        const id = created(store, 'Office');
        const versions = [store.version];
        const steps = [
            () => store.rename(id, 'Office Party'),
            () => store.addCard(id, 'white', 'A stapler.'),
            () => store.addCard(id, 'white', 'Free cake.'),
            () => store.addCard(id, 'black', 'What did HR find in _?'),
            () => store.editCard(id, 'white', 'a stapler', 'A stapler with feelings.'),
            () => store.removeCard(id, 'white', 'free cake'),
        ];
        for (const step of steps) {
            expect(step()).toEqual({ ok: true });
            versions.push(store.version);
        }
        expect(new Set(versions).size).toBe(versions.length);
        const expected = {
            id,
            name: 'Office Party',
            white: ['A stapler with feelings.'],
            black: [{ text: 'What did HR find in _?', pick: 1 }],
        };
        expect(store.get(id)).toEqual(expected);
        expect(openDeckStore(folder, undefined, quiet).get(id)).toEqual(expected);
    });

    it('refuses a card already in the deck, but lets a card be re-typed in another case', () => {
        const store = openDeckStore(folder, undefined, quiet);
        const id = created(store, 'Deck');
        store.addCard(id, 'white', 'Bees.');
        expect(store.addCard(id, 'white', ' bees ')).toEqual({ ok: false, reason: 'CARD_DUPLICATE' });
        expect(store.addCard(id, 'white', 'Bees?')).toEqual({ ok: true });
        expect(store.addCard(id, 'black', 'Bees.')).toEqual({ ok: true });
        expect(store.editCard(id, 'white', 'Bees.', 'BEES.')).toEqual({ ok: true });
        expect(store.editCard(id, 'white', 'Bees?', 'bees')).toEqual({ ok: false, reason: 'CARD_DUPLICATE' });
        expect(store.get(id)?.white).toEqual(['BEES.', 'Bees?']);
    });

    it('says when a card is already gone, and leaves the other cards alone', () => {
        const store = openDeckStore(folder, undefined, quiet);
        const id = created(store, 'Deck');
        store.addCard(id, 'white', 'Keep me.');
        expect(store.removeCard(id, 'white', 'Gone.')).toEqual({ ok: false, reason: 'CARD_NOT_FOUND' });
        expect(store.editCard(id, 'white', 'Gone.', 'New.')).toEqual({ ok: false, reason: 'CARD_NOT_FOUND' });
        expect(store.get(id)?.white).toEqual(['Keep me.']);
        expect(store.addCard('custom-00000000', 'white', 'x')).toEqual({ ok: false, reason: 'DECK_NOT_FOUND' });
    });

    it('checks the card and name rules', () => {
        const store = openDeckStore(folder, undefined, quiet);
        const id = created(store, 'Deck');
        expect(store.addCard(id, 'white', ' ')).toEqual({ ok: false, reason: 'CARD_EMPTY' });
        expect(store.addCard(id, 'black', '_ _ _ _')).toEqual({ ok: false, reason: 'CARD_TOO_MANY_BLANKS' });
        expect(store.create('')).toEqual({ ok: false, reason: 'DECK_NAME_EMPTY' });
        expect(store.create('deck')).toEqual({ ok: false, reason: 'DECK_NAME_TAKEN' });
        const other = created(store, 'Other');
        expect(store.rename(other, 'DECK')).toEqual({ ok: false, reason: 'DECK_NAME_TAKEN' });
        expect(store.rename(other, 'other')).toEqual({ ok: true });
    });

    it('holds at most 100 decks and 500 white cards in a deck', () => {
        const store = openDeckStore(folder, undefined, quiet);
        for (let i = 0; i < 100; i++) created(store, `Deck ${i}`);
        expect(store.create('One more')).toEqual({ ok: false, reason: 'DECK_LIMIT' });
        const id = store.list()[0]!.id;
        for (let i = 0; i < 500; i++) expect(store.addCard(id, 'white', `Card ${i}`).ok).toBe(true);
        expect(store.addCard(id, 'white', 'Card 500')).toEqual({ ok: false, reason: 'DECK_FULL' });
    });

    it('loads what it can from the folder: broken or foreign files are skipped and never touched', () => {
        const write = (name: string, content: string) => fs.writeFileSync(path.join(folder, name), content);
        write('broken.json', '{');
        write('other.json', '{"format":"x"}');
        write('notes.txt', 'not a deck');
        const dropped = { format: DECK_FORMAT, version: 1, name: 'Office', white: ['A.'], black: [] };
        write('Office.cah-deck.json', JSON.stringify(dropped));
        const big = { ...dropped, name: 'Big', white: Array.from({ length: 600 }, (_, i) => `W${i}`) };
        write('big.json', JSON.stringify(big));
        const log = vi.fn();

        const store = openDeckStore(folder, undefined, log);
        expect(store.list().map((deck) => [deck.name, deck.white.length])).toEqual([
            ['Big', 500],
            ['Office', 1],
        ]);
        expect(log).toHaveBeenCalled();
        expect(fs.readFileSync(path.join(folder, 'broken.json'), 'utf8')).toBe('{');
        const office = store.list().find((deck) => deck.name === 'Office')!;
        expect(openDeckStore(folder, undefined, quiet).get(office.id)?.name).toBe('Office');

        // A dropped-in file keeps its own name when the deck changes.
        expect(store.addCard(office.id, 'white', 'B.')).toEqual({ ok: true });
        expect(JSON.parse(fs.readFileSync(path.join(folder, 'Office.cah-deck.json'), 'utf8')).white).toEqual([
            'A.',
            'B.',
        ]);
    });

    it('reads a deck file saved with a byte order mark (Notepad, PowerShell)', () => {
        const deck = { format: DECK_FORMAT, version: 1, name: 'Notepad', white: ['A.'], black: [] };
        fs.writeFileSync(path.join(folder, 'notepad.json'), `\uFEFF${JSON.stringify(deck)}`, 'utf8');
        expect(
            openDeckStore(folder, undefined, quiet)
                .list()
                .map((d) => d.name),
        ).toEqual(['Notepad']);
    });

    it('starts with no decks, rather than not at all, when the folder cannot be read', () => {
        const notAFolder = path.join(folder, 'custom-decks');
        fs.writeFileSync(notAFolder, 'a file where the folder should be');
        const log = vi.fn();
        const store = openDeckStore(notAFolder, undefined, log);
        expect(store.list()).toEqual([]);
        expect(log).toHaveBeenCalled();
        expect(store.create('New')).toEqual({ ok: false, reason: 'DECK_SAVE_FAILED' });
    });

    it('when the disk refuses a write, keeps the deck as it was and leaves no temporary file', () => {
        const failing: DeckFs = {
            ...fs,
            renameSync: () => {
                throw Object.assign(new Error('busy'), { code: 'EPERM' });
            },
        };
        const good = openDeckStore(folder, undefined, quiet);
        const id = created(good, 'Deck');
        good.addCard(id, 'white', 'Before.');

        const store = openDeckStore(folder, failing, quiet);
        expect(store.addCard(id, 'white', 'After.')).toEqual({ ok: false, reason: 'DECK_SAVE_FAILED' });
        expect(store.get(id)?.white).toEqual(['Before.']);
        expect(store.create('New')).toEqual({ ok: false, reason: 'DECK_SAVE_FAILED' });
        expect(store.list()).toHaveLength(1);
        expect(files()).toEqual([`${id}.json`]);
    });

    it('tries again when Windows briefly locks the file', () => {
        let refusals = 2;
        const flaky: DeckFs = {
            ...fs,
            renameSync: (from, to) => {
                if (refusals-- > 0) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
                fs.renameSync(from, to);
            },
        };
        const store = openDeckStore(folder, flaky, quiet);
        const id = created(store, 'Deck');
        expect(fileOf(id).name).toBe('Deck');
    });

    it('exports a deck and imports it back as a copy with a free name', () => {
        const store = openDeckStore(folder, undefined, quiet);
        const id = created(store, 'Office: Party');
        store.addCard(id, 'white', 'A stapler.');
        store.addCard(id, 'black', '_ meets _.');
        const exported = store.exportDeck(id);
        if (!exported.ok) throw new Error(exported.reason);
        expect(exported.fileName).toBe('Office- Party.cah-deck.json');

        const imported = store.importDeck(exported.json);
        if (!imported.ok) throw new Error(imported.reason);
        expect(imported).toMatchObject({ name: 'Office: Party (2)', imported: 2, skipped: 0 });
        const copy = store.get(imported.deckId)!;
        expect({ white: copy.white, black: copy.black }).toEqual({
            white: ['A stapler.'],
            black: [{ text: '_ meets _.', pick: 2 }],
        });
        expect(store.importDeck(exported.json)).toMatchObject({ ok: true, name: 'Office: Party (3)' });
    });

    it('refuses an import that is not a deck, and counts the cards it had to skip', () => {
        const store = openDeckStore(folder, undefined, quiet);
        expect(store.importDeck('{oops')).toEqual({ ok: false, reason: 'NOT_A_DECK' });
        expect(store.importDeck('{"format":"x"}')).toEqual({ ok: false, reason: 'NOT_A_DECK' });
        const json = JSON.stringify({
            format: DECK_FORMAT,
            version: 1,
            name: 'Mixed',
            white: ['Fine.', ''],
            black: [7],
        });
        expect(store.importDeck(json)).toMatchObject({ ok: true, name: 'Mixed', imported: 1, skipped: 2 });
        const empty = JSON.stringify({ format: DECK_FORMAT, version: 1, name: 'Empty', white: [], black: [] });
        expect(store.importDeck(empty)).toMatchObject({ ok: true, imported: 0, skipped: 0 });
    });

    it('saves a set of cards as a new deck, never failing over a taken name', () => {
        const store = openDeckStore(folder, undefined, quiet);
        const cards = { white: ['A.'], black: [{ text: 'Why _?', pick: 1 }] };
        expect(store.saveDeck('Fever', cards)).toMatchObject({ ok: true, name: 'Fever' });
        const again = store.saveDeck('fever', cards);
        expect(again).toMatchObject({ ok: true, name: 'fever (2)' });
        if (!again.ok) throw new Error(again.reason);
        expect(store.get(again.deckId)).toMatchObject(cards);
        expect(store.saveDeck('  ', cards)).toEqual({ ok: false, reason: 'DECK_NAME_EMPTY' });
    });

    it('deletes a deck and its file', () => {
        const store = openDeckStore(folder, undefined, quiet);
        const id = created(store, 'Doomed');
        expect(store.remove(id)).toEqual({ ok: true });
        expect(files()).toEqual([]);
        expect(store.get(id)).toBeUndefined();
        expect(store.remove(id)).toEqual({ ok: false, reason: 'DECK_NOT_FOUND' });
    });
});
