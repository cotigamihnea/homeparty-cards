import { describe, expect, it } from 'vitest';
import { basePackIds, buildDeck, defaultPackIds } from '../../src/server/cards/deck.js';
import { deckProblem } from '../../src/shared/deckRules.js';
import { loadCardLibrary } from '../../src/server/cards/library.js';
import { loadCardData } from '../../src/server/cards/loader.js';
import { MAX_PICK, MAX_PLAYERS } from '../../src/shared/constants.js';
import { BLANK_DISPLAY, countBlanks, parseCardText, toPlainText } from '../../src/shared/cardText.js';

const data = loadCardData();
const library = loadCardLibrary();

/** True when `plain` is `original` with some `*` characters removed and nothing else changed. */
function onlyStarsRemoved(original: string, plain: string): boolean {
    let p = 0;
    for (const char of original) {
        if (char === plain[p]) p++;
        else if (char !== '*') return false;
    }
    return p === plain.length;
}

describe('the real card data', () => {
    it('has a blank for every pick on every playable black card that has blanks', () => {
        const mismatched = data.black.filter((card) => {
            const blanks = countBlanks(card.text);
            return card.pick <= MAX_PICK && blanks > 0 && blanks !== card.pick;
        });
        expect(mismatched).toEqual([]);
    });

    it('parses every card without losing characters (only emphasis stars may disappear)', () => {
        const broken = [
            ...data.white.filter(
                (text) => !onlyStarsRemoved(text, toPlainText(parseCardText(text, { blanks: false }))),
            ),
            ...data.black
                .map((card) => card.text)
                .filter((text) => {
                    const plain = toPlainText(parseCardText(text, { blanks: true })).replaceAll(BLANK_DISPLAY, '_');
                    return !onlyStarsRemoved(text.replace(/_+/g, '_'), plain);
                }),
        ];
        expect(broken).toEqual([]);
    });

    it('has 71 official packs and finds the base set', () => {
        expect(library.packs.filter((pack) => pack.official)).toHaveLength(71);
        expect(basePackIds(library)).toEqual(['cah-base-set']);
    });

    it('leaves out the three black cards that need more than 3 answers', () => {
        expect(data.black.filter((card, i) => card.pick > 3 && library.black(`b${i}`) === undefined)).toHaveLength(3);
    });

    it('builds default and base-only decks big enough for a full table', () => {
        const counts = (deck: { white: string[]; black: string[] }) => ({
            white: deck.white.length,
            black: deck.black.length,
        });
        expect(deckProblem(counts(buildDeck(library, defaultPackIds(library))), MAX_PLAYERS, 10)).toBeNull();
        expect(deckProblem(counts(buildDeck(library, basePackIds(library))), MAX_PLAYERS, 10)).toBeNull();
    });
});
