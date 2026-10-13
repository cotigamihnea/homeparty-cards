import { describe, expect, it } from 'vitest';
import { nameLength, normalizeName, sameName, validateName } from '../../src/shared/names.js';

describe('normalizeName', () => {
    it('trims and collapses inner whitespace', () => {
        expect(normalizeName('  Ana    Maria \t')).toBe('Ana Maria');
    });

    it('removes invisible control and format characters', () => {
        expect(normalizeName('A​n\u0007a')).toBe('Ana');
        expect(normalizeName('Ana ​ Maria')).toBe('Ana Maria');
    });

    it('turns tabs and newlines inside a name into single spaces', () => {
        expect(normalizeName('Ana\tMaria\nPop')).toBe('Ana Maria Pop');
    });

    it('keeps zero-width joiners so emoji sequences survive', () => {
        expect(normalizeName('👨‍👩‍👧')).toBe('👨‍👩‍👧');
    });
});

describe('validateName', () => {
    it('accepts a normal name and returns it normalised', () => {
        expect(validateName('  Bogdan ')).toEqual({ ok: true, name: 'Bogdan' });
    });

    it.each(['', '   ', '​​', '‍'])('rejects %j as empty', (raw) => {
        expect(validateName(raw)).toEqual({ ok: false, reason: 'NAME_EMPTY' });
    });

    it('accepts exactly 16 characters and rejects 17', () => {
        expect(validateName('a'.repeat(16)).ok).toBe(true);
        expect(validateName('a'.repeat(17))).toEqual({ ok: false, reason: 'NAME_TOO_LONG' });
    });

    it('counts an emoji family as one character', () => {
        expect(nameLength('👨‍👩‍👧')).toBe(1);
        expect(validateName('👨‍👩‍👧'.repeat(16)).ok).toBe(true);
    });

    it('allows profanity and punctuation (it is CAH)', () => {
        expect(validateName('Sh*t-Lord 3000!')).toEqual({ ok: true, name: 'Sh*t-Lord 3000!' });
    });
});

describe('sameName', () => {
    it('compares case-insensitively', () => {
        expect(sameName('ANA', 'ana')).toBe(true);
        expect(sameName('Ana', 'Anna')).toBe(false);
    });
});
