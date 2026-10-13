// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { countdown, tickCountdowns } from '../../src/client/ui/countdown.js';

describe('countdowns', () => {
    it('show the seconds left by the server clock and keep ticking down to zero', () => {
        const root = document.createElement('div');
        const timer = countdown(15_000, 11_000)!;
        root.append(timer);
        expect(timer.textContent).toBe('4');
        expect(timer.getAttribute('role')).toBe('timer');
        tickCountdowns(root, 13_100);
        expect(timer.textContent).toBe('2');
        tickCountdowns(root, 99_000);
        expect(timer.textContent).toBe('0');
    });

    it('show minutes and seconds for a long timer (Custom Fever writing), marked long so the ring fits it', () => {
        const root = document.createElement('div');
        const timer = countdown(296_000, 0, 300_000)!;
        root.append(timer);
        expect(timer.textContent).toBe('4:56');
        expect(timer.hasAttribute('data-long')).toBe(true);
        tickCountdowns(root, 196_000);
        expect(timer.textContent).toBe('1:40');
        tickCountdowns(root, 197_000);
        expect(timer.textContent).toBe('99');
        expect(timer.hasAttribute('data-long')).toBe(false);
    });

    it('show nothing when there is no deadline (timer off or game paused)', () => {
        expect(countdown(null, 0)).toBeNull();
    });

    it('draw a ring of the time left when the full length is known, and turn urgent in the last 10 seconds', () => {
        const root = document.createElement('div');
        const timer = countdown(40_000, 10_000, 60_000)!;
        root.append(timer);
        expect(timer.textContent).toBe('30');
        expect(timer.querySelector('svg.countdown-ring')).not.toBeNull();
        expect(Number(timer.style.getPropertyValue('--left'))).toBeCloseTo(0.5);
        expect(timer.hasAttribute('data-urgent')).toBe(false);
        tickCountdowns(root, 31_000);
        expect(timer.textContent).toBe('9');
        expect(Number(timer.style.getPropertyValue('--left'))).toBeCloseTo(0.15);
        expect(timer.hasAttribute('data-urgent')).toBe(true);
    });

    it('stay full while the time left is longer than the timer (answers still being read out)', () => {
        const timer = countdown(80_000, 0, 60_000)!;
        expect(Number(timer.style.getPropertyValue('--left'))).toBe(1);
    });

    it('have no ring without a full length', () => {
        expect(countdown(15_000, 11_000)!.querySelector('svg')).toBeNull();
    });
});
