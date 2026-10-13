import { describe, expect, it } from 'vitest';
import { nextRandom, randomId, shuffle } from '../../src/server/engine/rng.js';

function sequence(seed: number, length: number): number[] {
    const values: number[] = [];
    let state = seed;
    for (let i = 0; i < length; i++) {
        const [value, next] = nextRandom(state);
        values.push(value);
        state = next;
    }
    return values;
}

describe('nextRandom', () => {
    it('is deterministic for a seed and stays within [0, 1)', () => {
        expect(sequence(42, 50)).toEqual(sequence(42, 50));
        expect(sequence(42, 50)).not.toEqual(sequence(43, 50));
        expect(sequence(7, 1000).every((value) => value >= 0 && value < 1)).toBe(true);
    });

    it('spreads values roughly evenly', () => {
        const values = sequence(2026, 10_000);
        const lowHalf = values.filter((value) => value < 0.5).length;
        expect(lowHalf).toBeGreaterThan(4_700);
        expect(lowHalf).toBeLessThan(5_300);
    });
});

describe('shuffle', () => {
    const items = Array.from({ length: 20 }, (_, i) => `card-${i}`);

    it('returns a permutation without touching the input', () => {
        const frozen = Object.freeze([...items]);
        const [shuffled] = shuffle(frozen, 1);
        expect([...shuffled].sort()).toEqual([...items].sort());
        expect(frozen).toEqual(items);
    });

    it('is deterministic per seed, and different seeds give different orders', () => {
        expect(shuffle(items, 99)[0]).toEqual(shuffle(items, 99)[0]);
        expect(shuffle(items, 99)[0]).not.toEqual(shuffle(items, 100)[0]);
        expect(shuffle(items, 99)[0]).not.toEqual(items);
    });

    it('advances the random state', () => {
        expect(shuffle(items, 5)[1]).not.toBe(5);
    });
});

describe('randomId', () => {
    it('makes short opaque ids that do not repeat', () => {
        const ids = new Set<string>();
        let state = 1;
        for (let i = 0; i < 2_000; i++) {
            const [id, next] = randomId(state);
            expect(id).toMatch(/^[a-z0-9]{8}$/);
            ids.add(id);
            state = next;
        }
        expect(ids.size).toBe(2_000);
    });
});
