import { describe, expect, it } from 'vitest';
import { withCustomDecks } from '../../src/server/cards/customLibrary.js';
import { buildDeck } from '../../src/server/cards/deck.js';
import { buildLibrary } from '../../src/server/cards/library.js';
import type { CustomDeck } from '../../src/shared/customCards.js';
import { TINY_DATA } from './fixtures.js';

const base = buildLibrary(TINY_DATA);
const zed: CustomDeck = {
    id: 'custom-0000000a',
    name: 'Zed',
    white: ['Zed one.', 'Zed two.'],
    black: [{ text: 'Why _?', pick: 1 }],
};
const alpha: CustomDeck = {
    id: 'custom-0000000b',
    name: 'alpha',
    white: ['Alpha.'],
    black: [
        { text: 'Hello.', pick: 1 },
        { text: '_ meets _.', pick: 2 },
    ],
};

describe('custom decks in the card library', () => {
    const library = withCustomDecks(base, [zed, alpha]);

    it('puts the custom decks first, by name, as packs of their own kind', () => {
        expect(library.packs.slice(0, 2)).toEqual([
            { id: alpha.id, name: 'alpha', kind: 'custom', official: false, whiteCount: 1, blackCount: 2 },
            { id: zed.id, name: 'Zed', kind: 'custom', official: false, whiteCount: 2, blackCount: 1 },
        ]);
        expect(library.packs.slice(2)).toEqual(base.packs);
    });

    it('gives every custom card an id inside its deck, and finds its text', () => {
        expect(library.cardsInPack(zed.id)).toEqual({
            white: [`${zed.id}:w0`, `${zed.id}:w1`],
            black: [`${zed.id}:b0`],
        });
        expect(library.white(`${zed.id}:w1`)).toEqual({ id: `${zed.id}:w1`, text: 'Zed two.' });
        expect(library.black(`${alpha.id}:b1`)).toEqual({ id: `${alpha.id}:b1`, text: '_ meets _.', pick: 2 });
        expect(library.white(`${zed.id}:w9`)).toBeUndefined();
        expect(library.white('custom-ffffffff:w0')).toBeUndefined();
    });

    it('still knows every official card', () => {
        expect(library.white('w0')).toEqual(base.white('w0'));
        expect(library.black('b0')).toEqual(base.black('b0'));
        expect(library.cardsInPack('cah-base-set')).toEqual(base.cardsInPack('cah-base-set'));
    });

    it('builds a deck from custom and official packs together', () => {
        const deck = buildDeck(library, [alpha.id, 'cah-base-set']);
        expect(deck.white).toEqual([`${alpha.id}:w0`, ...buildDeck(base, ['cah-base-set']).white]);
        expect(deck.black.slice(0, 2)).toEqual([`${alpha.id}:b0`, `${alpha.id}:b1`]);
    });
});
