import { describe, expect, it } from 'vitest';
import { once, resetOnNewGame, resetOnce } from '../../src/client/ui/motion.js';
import type { Phase } from '../../src/shared/views.js';

describe('once', () => {
    it('is true the first time a moment is shown and false on every re-render after', () => {
        resetOnce();
        expect(once('result-3')).toBe(true);
        expect(once('result-3')).toBe(false);
        expect(once('result-4')).toBe(true);
    });

    it('starts over after a reset (a new game)', () => {
        resetOnce();
        once('intro-1');
        resetOnce();
        expect(once('intro-1')).toBe(true);
    });
});

describe('resetOnNewGame', () => {
    const at = (phase: Phase, round: number | null, game = 1) => ({
        game,
        phase,
        round: round === null ? null : { number: round },
    });

    it('starts afresh back in the lobby, or when the final scores give way to a new game', () => {
        resetOnce();
        once('intro-1');
        resetOnNewGame(at('GAME_OVER', null), at('ROUND_START', 1));
        expect(once('intro-1')).toBe(true);
        resetOnNewGame(at('ROUND_RESULT', 3), at('LOBBY', null));
        expect(once('intro-1')).toBe(true);
    });

    it('starts afresh when a phone that slept through the end finds round 1 of a new game', () => {
        resetOnce();
        once('intro-1');
        resetOnNewGame(at('JUDGING', 7, 1), at('ROUND_START', 1, 2));
        expect(once('intro-1')).toBe(true);
    });

    it('keeps the moments of a game that is still going', () => {
        resetOnce();
        once('intro-2');
        resetOnNewGame(at('SUBMITTING', 2), at('JUDGING', 2));
        resetOnNewGame(at('ROUND_RESULT', 2), at('ROUND_START', 3));
        expect(once('intro-2')).toBe(false);
    });

    it('starts afresh whenever the game number changes, whatever the round or phase', () => {
        resetOnce();
        once('won-5');
        resetOnNewGame(at('JUDGING', 5, 1), at('ROUND_RESULT', 5, 2));
        expect(once('won-5')).toBe(true);
        once('game-won');
        resetOnNewGame(at('GAME_OVER', null, 2), at('GAME_OVER', null, 3));
        expect(once('game-won')).toBe(true);
    });
});
