import { describe, expect, it } from 'vitest';
import { buildLibrary, cardKey } from '../../src/server/cards/library.js';
import { TINY_DATA } from './fixtures.js';

const library = buildLibrary(TINY_DATA);

describe('buildLibrary', () => {
    it('gives packs slug ids (unique) and sorts them base, expansions, themed, fan', () => {
        expect(library.packs.map((pack) => [pack.id, pack.kind, pack.official])).toEqual([
            ['cah-base-set', 'base', true],
            ['cah-first-expansion', 'expansion', true],
            ['science-pack', 'themed', true],
            ['science-pack-2', 'themed', true],
            ['weird-fan-pack', 'fan', false],
        ]);
    });

    it('counts unique playable cards per pack', () => {
        const base = library.packs.find((pack) => pack.id === 'cah-base-set');
        const fan = library.packs.find((pack) => pack.id === 'weird-fan-pack');
        expect([base?.whiteCount, base?.blackCount]).toEqual([2, 1]);
        expect([fan?.whiteCount, fan?.blackCount]).toEqual([1, 0]);
    });

    it('looks cards up by id and leaves out black cards with more than 3 picks', () => {
        expect(library.white('w2')).toEqual({ id: 'w2', text: 'Bees?' });
        expect(library.black('b0')).toEqual({ id: 'b0', text: '_ is bad.', pick: 1 });
        expect(library.black('b2')).toBeUndefined();
        expect(library.white('w999')).toBeUndefined();
    });

    it('lists the cards of a pack', () => {
        expect(library.cardsInPack('cah-base-set')).toEqual({ white: ['w0', 'w6'], black: ['b0'] });
        expect(library.cardsInPack('nope')).toBeUndefined();
    });
});

describe('cardKey', () => {
    it('ignores case, curly quotes, spacing and one trailing period', () => {
        expect(cardKey('Being on  fire.')).toBe(cardKey('being on fire'));
        expect(cardKey('“Quotes” here.')).toBe(cardKey('"Quotes" here'));
        expect(cardKey('It’s fine')).toBe(cardKey("It's fine"));
        expect(cardKey('Bees?')).not.toBe(cardKey('Bees!'));
    });
});
