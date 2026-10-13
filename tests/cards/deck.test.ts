import { describe, expect, it } from 'vitest';
import { basePackIds, buildDeck, defaultPackIds, officialPackIds } from '../../src/server/cards/deck.js';
import { deckProblem } from '../../src/shared/deckRules.js';
import { buildLibrary } from '../../src/server/cards/library.js';
import { TINY_DATA } from './fixtures.js';

const library = buildLibrary(TINY_DATA);

describe('buildDeck', () => {
    it('takes the selected packs in library order and drops duplicate text across packs', () => {
        expect(buildDeck(library, ['science-pack', 'cah-first-expansion'])).toEqual({
            white: ['w2', 'w3'],
            black: ['b1'],
        });
    });

    it('combines base and expansion cards', () => {
        expect(buildDeck(library, ['cah-first-expansion', 'cah-base-set'])).toEqual({
            white: ['w0', 'w6', 'w2', 'w3'],
            black: ['b0', 'b1'],
        });
    });

    it('ignores unknown pack ids', () => {
        expect(buildDeck(library, ['nope'])).toEqual({ white: [], black: [] });
    });
});

describe('pack shortcuts', () => {
    it('default = official only; base only = the base set', () => {
        expect(officialPackIds(library)).toEqual([
            'cah-base-set',
            'cah-first-expansion',
            'science-pack',
            'science-pack-2',
        ]);
        expect(defaultPackIds(library)).toEqual(officialPackIds(library));
        expect(basePackIds(library)).toEqual(['cah-base-set']);
    });
});

describe('deckProblem', () => {
    const deck = (white: number, black: number) => ({ white, black });

    it('needs players × 10 × 2 white cards and 20 black cards', () => {
        expect(deckProblem(deck(59, 20), 3, 10)).toBe('NOT_ENOUGH_WHITE_CARDS');
        expect(deckProblem(deck(60, 19), 3, 10)).toBe('NOT_ENOUGH_BLACK_CARDS');
        expect(deckProblem(deck(60, 20), 3, 10)).toBeNull();
        expect(deckProblem(deck(239, 20), 12, 10)).toBe('NOT_ENOUGH_WHITE_CARDS');
        expect(deckProblem(deck(60, 20), 3, 12)).toBeNull();
    });

    it('in Custom Fever, the packs must be able to fill every quota if nobody writes', () => {
        expect(deckProblem(deck(38, 12), 3, 10, 'customFever')).toBe('NOT_ENOUGH_WHITE_CARDS');
        expect(deckProblem(deck(39, 11), 3, 10, 'customFever')).toBe('NOT_ENOUGH_BLACK_CARDS');
        expect(deckProblem(deck(39, 12), 3, 10, 'customFever')).toBeNull();
        expect(deckProblem({ white: 39, black: 12, custom: true }, 3, 10, 'customFever')).toBeNull();
        expect(deckProblem({ white: 39, black: 11, custom: true }, 3, 10, 'customFever')).toBe(
            'NOT_ENOUGH_BLACK_CARDS',
        );
        expect(deckProblem(deck(39, 12), 3, 10, 'classic')).toBe('NOT_ENOUGH_WHITE_CARDS');
    });

    it('with a custom deck in the selection, needs only a hand plus 3 white cards each and 10 black cards', () => {
        const custom = (white: number, black: number) => ({ white, black, custom: true });
        expect(deckProblem(custom(38, 10), 3, 10)).toBe('NOT_ENOUGH_WHITE_CARDS');
        expect(deckProblem(custom(39, 9), 3, 10)).toBe('NOT_ENOUGH_BLACK_CARDS');
        expect(deckProblem(custom(39, 10), 3, 10)).toBeNull();
        expect(deckProblem(custom(44, 10), 3, 12)).toBe('NOT_ENOUGH_WHITE_CARDS');
        expect(deckProblem(custom(45, 10), 3, 12)).toBeNull();
    });
});
