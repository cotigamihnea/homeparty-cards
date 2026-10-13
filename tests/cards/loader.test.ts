import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultCardDataPath, loadCardData, parseCardData, sha256 } from '../../src/server/cards/loader.js';

const minimal = {
    white: ['Being on fire.', 'Bees?'],
    black: [{ text: 'What is that smell?', pick: 1 }],
    packs: [{ name: 'Tiny Pack', official: true, white: [0, 1], black: [0], description: 'ignored' }],
};

describe('parseCardData', () => {
    it('accepts a valid file and keeps only the fields the game uses', () => {
        const data = parseCardData(minimal);
        expect(data.white).toEqual(['Being on fire.', 'Bees?']);
        expect(data.packs[0]).toEqual({ name: 'Tiny Pack', official: true, white: [0, 1], black: [0] });
    });

    it.each([
        ['a non-object', 42, /root/],
        ['white that is not a string list', { ...minimal, white: [1] }, /white\[0\]/],
        ['a black card with pick 0', { ...minimal, black: [{ text: '_', pick: 0 }] }, /black\[0\]\.pick/],
        [
            'a pack index out of range',
            { ...minimal, packs: [{ ...minimal.packs[0], white: [7] }] },
            /packs\[0\]\.white\[0\]/,
        ],
    ])('rejects %s, naming the bad path', (_label, json, message) => {
        expect(() => parseCardData(json)).toThrow(message);
    });
});

describe('the committed card data', () => {
    it('is read from data/ by default', () => {
        const data = loadCardData();
        expect(path.basename(defaultCardDataPath())).toBe('cah-all-compact.json');
        expect([data.white.length, data.black.length, data.packs.length]).toEqual([22441, 6308, 205]);
    });

    it('matches the checksum recorded when it was fetched', () => {
        const sourceFile = path.join(path.dirname(defaultCardDataPath()), 'cah-all-compact.source.json');
        const source = JSON.parse(readFileSync(sourceFile, 'utf8')) as { sha256: string };
        expect(sha256(readFileSync(defaultCardDataPath()))).toBe(source.sha256);
    });
});
