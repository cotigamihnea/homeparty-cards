import { describe, expect, it } from 'vitest';
import { BLANK_TEXT_MAX, checkBlankText, normalizeBlankText } from '../../src/shared/blanks.js';

describe('blank card text', () => {
    it('is one clean line: trimmed, spaces collapsed, invisible characters out', () => {
        expect(normalizeBlankText('  My   own\\nwords\t ')).toBe('My own\\nwords');
        expect(normalizeBlankText('My\nown\r\nwords')).toBe('My own words');
        expect(normalizeBlankText('A‮bc\u0007d')).toBe('Abcd');
    });

    it('must say something', () => {
        expect(checkBlankText('')).toBe('BLANK_EMPTY');
        expect(checkBlankText('  \n ')).toBe('BLANK_EMPTY');
        expect(checkBlankText('​')).toBe('BLANK_EMPTY');
        expect(checkBlankText('Grandma')).toBeNull();
    });

    it(`fits on a card: at most ${BLANK_TEXT_MAX} characters, an emoji counting as one`, () => {
        expect(BLANK_TEXT_MAX).toBe(80);
        expect(checkBlankText('x'.repeat(80))).toBeNull();
        expect(checkBlankText('x'.repeat(81))).toBe('BLANK_TOO_LONG');
        expect(checkBlankText('👨‍👩‍👧'.repeat(80))).toBeNull();
        expect(checkBlankText(` ${'x'.repeat(80)}   `)).toBeNull();
    });
});
