import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isValidSettingsPatch } from '../../src/shared/settings.js';

describe('DEFAULT_SETTINGS', () => {
    it('matches GAME_DESIGN §3 (7 points, round limit 15, hand 10, 60 s timers, English, house rules off)', () => {
        expect(DEFAULT_SETTINGS).toEqual({
            pointsToWin: 7,
            roundLimit: 15,
            handSize: 10,
            submitSeconds: 60,
            judgeSeconds: 60,
            packIds: [],
            language: 'en',
            rebootTheUniverse: false,
            randoCardrissian: false,
            happyEnding: false,
            neverHaveIEver: false,
            blankCards: 0,
            autoPlay: false,
            gameMode: 'classic',
            writingMinutes: 5,
        });
        expect(isValidSettingsPatch(DEFAULT_SETTINGS)).toBe(true);
    });
});

describe('isValidSettingsPatch', () => {
    it.each([
        [{}],
        [{ pointsToWin: null, roundLimit: null }],
        [{ pointsToWin: 5 }],
        [{ roundLimit: 20 }],
        [{ handSize: 7 }],
        [{ handSize: 12 }],
        [{ submitSeconds: 0, judgeSeconds: 90 }],
        [{ packIds: ['cah-base-set', 'science-pack'] }],
        [{ language: 'ro' }],
        [{ rebootTheUniverse: true, randoCardrissian: true, happyEnding: true }],
        [{ neverHaveIEver: false, autoPlay: true }],
        [{ blankCards: 0 }],
        [{ blankCards: 3 }],
        [{ gameMode: 'customFever' }],
        [{ gameMode: 'classic', writingMinutes: 1 }],
        [{ writingMinutes: 10 }],
        [{ writingMinutes: null }],
    ])('accepts %j', (patch) => {
        expect(isValidSettingsPatch(patch)).toBe(true);
    });

    it.each([
        [null],
        [[]],
        ['settings'],
        [{ pointsToWin: 6 }],
        [{ roundLimit: 12 }],
        [{ handSize: 6 }],
        [{ handSize: 13 }],
        [{ handSize: 10.5 }],
        [{ submitSeconds: 30 }],
        [{ judgeSeconds: '60' }],
        [{ packIds: 'cah-base-set' }],
        [{ packIds: [42] }],
        [{ packIds: ['a'.repeat(101)] }],
        [{ language: 'de' }],
        [{ rebootTheUniverse: 'yes' }],
        [{ randoCardrissian: 1 }],
        [{ happyEnding: null }],
        [{ autoPlay: undefined }],
        [{ blankCards: 4 }],
        [{ blankCards: -1 }],
        [{ blankCards: 1.5 }],
        [{ blankCards: '2' }],
        [{ gameMode: 'fever' }],
        [{ writingMinutes: 0 }],
        [{ writingMinutes: 11 }],
        [{ writingMinutes: 2.5 }],
        [{ unknownField: 1 }],
        [{ toString: 1 }],
        [JSON.parse('{"__proto__": {"handSize": 10}}')],
    ])('rejects %j', (patch) => {
        expect(isValidSettingsPatch(patch)).toBe(false);
    });
});
