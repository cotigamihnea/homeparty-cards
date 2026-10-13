// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import { settingsSummary } from '../../src/client/ui/settings/summary.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';

const deck = { white: 4351, black: 951, problem: null };

describe('settingsSummary', () => {
    setLanguage('en');

    it('says how the game is won, the hand, the timers, the language, the packs and the house rules', () => {
        const lines = settingsSummary({ ...DEFAULT_SETTINGS, packIds: ['a', 'b'] }, deck);
        expect(lines).toEqual([
            { label: 'Win', value: 'First to 7 points' },
            { label: 'Hand', value: '10 cards' },
            { label: 'Answer timer', value: '60 s' },
            { label: 'Judging timer', value: '60 s' },
            { label: 'Language', value: 'English' },
            { label: 'Packs', value: '2 packs: 4,351 white, 951 black cards' },
            { label: 'House rules', value: 'None' },
        ]);
    });

    it('with unlimited points, the game ends after a number of rounds, or never', () => {
        const rounds = settingsSummary({ ...DEFAULT_SETTINGS, pointsToWin: null, roundLimit: 15 }, deck);
        expect(rounds[0]).toEqual({ label: 'Win', value: 'Most points after 15 rounds' });
        const endless = settingsSummary({ ...DEFAULT_SETTINGS, pointsToWin: null, roundLimit: null }, deck);
        expect(endless[0]).toEqual({ label: 'Win', value: 'No limit: the VIP ends the game' });
    });

    it('names Custom Fever and its writing time first; a classic game needs no such line', () => {
        const fever = settingsSummary({ ...DEFAULT_SETTINGS, gameMode: 'customFever', writingMinutes: 5 }, deck);
        expect(fever[0]).toEqual({ label: 'Game', value: 'Custom Fever, 5 min to write' });
        const unlimited = settingsSummary({ ...DEFAULT_SETTINGS, gameMode: 'customFever', writingMinutes: null }, deck);
        expect(unlimited[0]).toEqual({ label: 'Game', value: 'Custom Fever, no time limit' });
        expect(settingsSummary(DEFAULT_SETTINGS, deck)[0]?.label).toBe('Win');
    });

    it('shows a timer that is off as Off', () => {
        const lines = settingsSummary({ ...DEFAULT_SETTINGS, submitSeconds: 0 }, deck);
        expect(lines[2]).toEqual({ label: 'Answer timer', value: 'Off' });
    });

    it('names the house rules that are on, briefly, in the order of the rules', () => {
        const lines = settingsSummary(
            { ...DEFAULT_SETTINGS, autoPlay: true, randoCardrissian: true, blankCards: 2, rebootTheUniverse: true },
            deck,
        );
        expect(lines[6]).toEqual({
            label: 'House rules',
            value: 'Reboot, Rando, 2 blanks, Auto-play',
        });
    });

    it('speaks Romanian when the game does', () => {
        setLanguage('ro');
        const lines = settingsSummary({ ...DEFAULT_SETTINGS, packIds: ['a'], language: 'ro' }, deck);
        expect(lines[4]).toEqual({ label: 'Limba', value: 'Română' });
        expect(lines[5]?.value).toContain('4.351');
        setLanguage('en');
    });
});
