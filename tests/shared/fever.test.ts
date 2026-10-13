import { describe, expect, it } from 'vitest';
import { feverQuota } from '../../src/shared/fever.js';

describe('Custom Fever quotas', () => {
    it('asks for a hand plus 3 white cards each, and about 12 black cards in all (at least 2 each)', () => {
        expect(feverQuota(3, 10)).toEqual({ white: 13, black: 4 });
        expect(feverQuota(4, 10)).toEqual({ white: 13, black: 3 });
        expect(feverQuota(5, 10)).toEqual({ white: 13, black: 3 });
        expect(feverQuota(6, 7)).toEqual({ white: 10, black: 2 });
        expect(feverQuota(12, 12)).toEqual({ white: 15, black: 2 });
    });
});
