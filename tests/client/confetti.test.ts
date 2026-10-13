// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { confetti, confettiPieces } from '../../src/client/ui/confetti.js';

const COLORS = ['#fff', '#ffd23f'];

describe('confetti', () => {
    it('makes the same burst for the same seed, and a different one for another seed', () => {
        expect(confettiPieces(7, 40, COLORS)).toEqual(confettiPieces(7, 40, COLORS));
        expect(confettiPieces(7, 40, COLORS)).not.toEqual(confettiPieces(8, 40, COLORS));
    });

    it('keeps every piece on screen and in the palette', () => {
        const pieces = confettiPieces(3, 60, COLORS);
        expect(pieces).toHaveLength(60);
        for (const piece of pieces) {
            expect(piece.x).toBeGreaterThanOrEqual(0);
            expect(piece.x).toBeLessThanOrEqual(100);
            expect(piece.delay).toBeGreaterThanOrEqual(0);
            expect(COLORS).toContain(piece.color);
        }
    });

    it('is decoration only: hidden from screen readers', () => {
        const burst = confetti(5);
        expect(burst.getAttribute('aria-hidden')).toBe('true');
        expect(burst.children.length).toBeGreaterThan(20);
    });
});
