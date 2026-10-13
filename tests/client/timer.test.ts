import { describe, expect, it } from 'vitest';
import { timerLength } from '../../src/client/ui/timer.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';
import { playerView } from './views.js';

const settings = { ...DEFAULT_SETTINGS, submitSeconds: 45, judgeSeconds: 90 };

describe('timerLength (the full length the countdown ring counts down from)', () => {
    it('is the answer timer while answers come in, and the judging timer while the Czar judges', () => {
        expect(timerLength(playerView({ phase: 'SUBMITTING', settings }))).toBe(45_000);
        expect(timerLength(playerView({ phase: 'JUDGING', settings }))).toBe(90_000);
    });

    it('has no ring for the short phases in between, or when the timer is off', () => {
        expect(timerLength(playerView({ phase: 'ROUND_START', settings }))).toBeNull();
        expect(timerLength(playerView({ phase: 'ROUND_RESULT', settings }))).toBeNull();
        expect(timerLength(playerView({ settings: { ...settings, submitSeconds: 0 } }))).toBeNull();
    });
});
