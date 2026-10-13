import { describe, expect, it } from 'vitest';
import { createClock, secondsLeft } from '../../src/client/ui/clock.js';

describe('createClock', () => {
    it('follows the server clock even when the phone’s own clock is off', () => {
        let local = 5_000;
        const clock = createClock(() => local);
        expect(clock.now()).toBe(5_000);
        clock.sync(10_000);
        local = 6_000;
        expect(clock.now()).toBe(11_000);
    });
});

describe('secondsLeft', () => {
    it('rounds up, and never goes below zero', () => {
        expect(secondsLeft(15_000, 11_000)).toBe(4);
        expect(secondsLeft(15_000, 11_800)).toBe(4);
        expect(secondsLeft(15_000, 14_999)).toBe(1);
        expect(secondsLeft(15_000, 15_000)).toBe(0);
        expect(secondsLeft(15_000, 20_000)).toBe(0);
    });
});
