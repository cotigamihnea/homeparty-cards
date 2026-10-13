import { describe, expect, it } from 'vitest';
import { en } from '../../src/client/ui/i18n/en.js';
import { ro } from '../../src/client/ui/i18n/ro.js';
import { format, isPlural, lookup, plural, type Entry } from '../../src/client/ui/i18n/translate.js';

function leaves(node: unknown, prefix = ''): [string, Entry][] {
    if (typeof node === 'string' || isPlural(node)) return [[prefix, node]];
    return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
        leaves(child, prefix ? `${prefix}.${key}` : key),
    );
}

function placeholders(entry: Entry): string[] {
    const text = typeof entry === 'string' ? entry : entry.other;
    return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

describe('format', () => {
    it('fills placeholders and leaves unknown ones visible', () => {
        expect(format('Hi {name}, {missing}', 'en', { name: 'Ana' })).toBe('Hi Ana, {missing}');
    });

    it('picks English plural forms', () => {
        const entry = plural({ one: '{count} player', other: '{count} players' });
        expect(format(entry, 'en', { count: 1 })).toBe('1 player');
        expect(format(entry, 'en', { count: 3 })).toBe('3 players');
    });

    it('picks Romanian one / few / other forms', () => {
        const entry = plural({ one: '{count} jucător', few: '{count} jucători', other: '{count} de jucători' });
        expect(format(entry, 'ro', { count: 1 })).toBe('1 jucător');
        expect(format(entry, 'ro', { count: 2 })).toBe('2 jucători');
        expect(format(entry, 'ro', { count: 20 })).toBe('20 de jucători');
    });
});

describe('dictionaries', () => {
    it('lookup walks dotted keys and falls back to the key itself', () => {
        expect(lookup(en, 'phone.join')).toBe('Join game');
        expect(lookup(en, 'phone.nope')).toBe('phone.nope');
    });

    it('Romanian has every English message, non-empty, with the same placeholders', () => {
        const roLeaves = new Map(leaves(ro));
        for (const [key, entry] of leaves(en)) {
            const roEntry = roLeaves.get(key);
            expect(roEntry, key).toBeDefined();
            if (!roEntry) continue;
            expect(typeof roEntry === 'string' ? roEntry : roEntry.other, key).not.toBe('');
            expect(placeholders(roEntry), key).toEqual(placeholders(entry));
        }
    });
});
