import { describe, expect, it, vi } from 'vitest';
import { buzz } from '../../src/client/ui/haptics.js';

describe('buzz', () => {
    it('vibrates with a short tap, and longer patterns for big moments', () => {
        const vibrate = vi.fn((_pattern: number | number[]) => true);
        buzz('tap', { vibrate });
        buzz('won', { vibrate });
        expect(vibrate.mock.calls[0]![0]).toBe(8);
        expect(Array.isArray(vibrate.mock.calls[1]![0])).toBe(true);
    });

    it('does nothing where phones cannot vibrate (iPhone Safari)', () => {
        expect(() => buzz('tap', {})).not.toThrow();
        expect(() => buzz('tap', undefined)).not.toThrow();
    });

    it('survives a browser that refuses to vibrate', () => {
        const vibrate = vi.fn((_pattern: number | number[]): boolean => {
            throw new Error('no user gesture yet');
        });
        expect(() => buzz('sent', { vibrate })).not.toThrow();
    });
});
