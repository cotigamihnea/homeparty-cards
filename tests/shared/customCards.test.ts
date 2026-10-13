import { describe, expect, it } from 'vitest';
import {
    blackPick,
    checkCardText,
    checkDeckName,
    deckFileName,
    normalizeCardText,
} from '../../src/shared/customCards.js';

describe('custom card text', () => {
    it('keeps a white card on one tidy line', () => {
        expect(checkCardText('white', '  A stapler.  ')).toBeNull();
        expect(normalizeCardText('  A stapler.  ')).toBe('A stapler.');
        expect(normalizeCardText('Two\nlines')).toBe('Two lines');
    });

    it('refuses an empty card', () => {
        expect(checkCardText('white', '')).toBe('CARD_EMPTY');
        expect(checkCardText('black', '   ')).toBe('CARD_EMPTY');
    });

    it('counts length in characters as people see them: 80 for white, 200 for black', () => {
        expect(checkCardText('white', 'x'.repeat(80))).toBeNull();
        expect(checkCardText('white', 'x'.repeat(81))).toBe('CARD_TOO_LONG');
        expect(checkCardText('white', '👩‍👩‍👧'.repeat(80))).toBeNull();
        expect(checkCardText('black', 'x'.repeat(200))).toBeNull();
        expect(checkCardText('black', 'x'.repeat(201))).toBe('CARD_TOO_LONG');
    });

    it('allows up to three blanks on a black card; underscores on a white card are just text', () => {
        expect(checkCardText('black', '_ and _ and _.')).toBeNull();
        expect(checkCardText('black', '_ and _ and _ and _')).toBe('CARD_TOO_MANY_BLANKS');
        expect(checkCardText('white', 'a_b_c_d_e')).toBeNull();
    });

    it('takes the Pick from the blanks: none or one is Pick 1', () => {
        expect(blackPick('Why?')).toBe(1);
        expect(blackPick('_ is bad.')).toBe(1);
        expect(blackPick('_ meets _.')).toBe(2);
        expect(blackPick('___ / _ / __')).toBe(3);
    });
});

describe('custom deck names', () => {
    it('needs 1–40 characters', () => {
        expect(checkDeckName('')).toBe('DECK_NAME_EMPTY');
        expect(checkDeckName('  ')).toBe('DECK_NAME_EMPTY');
        expect(checkDeckName('x'.repeat(41))).toBe('DECK_NAME_TOO_LONG');
        expect(checkDeckName('Office Party')).toBeNull();
    });

    it('makes a file name Windows accepts', () => {
        expect(deckFileName('Office: "Party"/2?')).toBe('Office- -Party--2-.cah-deck.json');
        expect(deckFileName('  ')).toBe('deck.cah-deck.json');
        expect(deckFileName('Fun')).toBe('Fun.cah-deck.json');
    });
});
