import { describe, expect, it } from 'vitest';
import { DECK_FORMAT, deckFileJson, readDeckFile } from '../../src/server/cards/customDeckFile.js';

const deck = (fields: Record<string, unknown>) => ({
    format: DECK_FORMAT,
    version: 1,
    name: 'Office Party',
    ...fields,
});

describe('reading a deck file', () => {
    it('reads the format the game writes', () => {
        const json = JSON.parse(
            '{ "format": "homeparty-cards-deck", "version": 1, "name": "Office Party", "white": ["A stapler with feelings."], "black": [{ "text": "What did HR find in _?", "pick": 1 }] }',
        );
        expect(readDeckFile(json)).toEqual({
            name: 'Office Party',
            cards: { white: ['A stapler with feelings.'], black: [{ text: 'What did HR find in _?', pick: 1 }] },
            skipped: 0,
        });
    });

    it('still reads decks saved or exported before the game was renamed', () => {
        const json = { format: 'homeparty-cah-deck', version: 1, name: 'Old Office', white: ['A.'], black: [] };
        expect(readDeckFile(json)).toEqual({ name: 'Old Office', cards: { white: ['A.'], black: [] }, skipped: 0 });
    });

    it('refuses anything that is not a deck', () => {
        for (const value of [
            null,
            [],
            'deck',
            { format: 'other', name: 'x', white: [], black: [] },
            deck({ name: undefined, white: [], black: [] }),
            deck({ name: '   ', white: [], black: [] }),
            deck({ white: 'Bees.', black: [] }),
            deck({ white: [], black: {} }),
        ]) {
            expect(readDeckFile(value)).toBe('NOT_A_DECK');
        }
    });

    it('skips and counts cards that break a rule or repeat', () => {
        const read = readDeckFile(
            deck({
                white: ['Bees.', 'bees', 'x'.repeat(81), 42, '  Two\nlines  '],
                black: [{ text: '_ _ _ _' }, { text: 'Fine _.', pick: 1 }, 7, { pick: 1 }],
            }),
        );
        expect(read).toEqual({
            name: 'Office Party',
            cards: { white: ['Bees.', 'Two lines'], black: [{ text: 'Fine _.', pick: 1 }] },
            skipped: 6,
        });
    });

    it('takes black cards written as plain text, as a person might write the file by hand', () => {
        const read = readDeckFile(deck({ white: [], black: ['Why _?', { text: '_ meets _.' }] }));
        if (read === 'NOT_A_DECK') throw new Error('not a deck');
        expect(read.cards.black).toEqual([
            { text: 'Why _?', pick: 1 },
            { text: '_ meets _.', pick: 2 },
        ]);
        expect(read.skipped).toBe(0);
    });

    it('works the Pick out from the blanks, whatever the file claims', () => {
        const read = readDeckFile(deck({ white: [], black: [{ text: 'One _ only.', pick: 3 }, { text: '_ and _' }] }));
        expect(read).not.toBe('NOT_A_DECK');
        if (read === 'NOT_A_DECK') return;
        expect(read.cards.black.map((card) => card.pick)).toEqual([1, 2]);
    });

    it('keeps at most 500 white and 200 black cards, counting the rest as skipped', () => {
        const white = Array.from({ length: 510 }, (_, i) => `White ${i}`);
        const black = Array.from({ length: 205 }, (_, i) => ({ text: `Black ${i} _` }));
        const read = readDeckFile(deck({ white, black }));
        if (read === 'NOT_A_DECK') throw new Error('not a deck');
        expect(read.cards.white).toHaveLength(500);
        expect(read.cards.black).toHaveLength(200);
        expect(read.skipped).toBe(15);
    });

    it('reads back exactly what it writes', () => {
        const cards = { white: ['A.', 'B "quoted".'], black: [{ text: '_ meets _.', pick: 2 }] };
        const text = deckFileJson({ name: 'Round trip', ...cards });
        expect(JSON.parse(text)).toMatchObject({ format: 'homeparty-cards-deck', version: 1 });
        expect(readDeckFile(JSON.parse(text))).toEqual({ name: 'Round trip', cards, skipped: 0 });
    });
});
