import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameNow } from '../../src/server/net/clock.js';

afterEach(() => {
    vi.restoreAllMocks();
});

describe("the game's clock", () => {
    it('reads like the system clock, in whole milliseconds', () => {
        expect(Number.isInteger(gameNow())).toBe(true);
        expect(Math.abs(gameNow() - Date.now())).toBeLessThan(1000);
    });

    it('keeps counting forward when the system clock is set back (WSL2 steps it by seconds)', () => {
        const before = gameNow();
        vi.spyOn(Date, 'now').mockReturnValue(before - 5_000);
        expect(gameNow()).toBeGreaterThanOrEqual(before);
    });

    it('is the only clock the server reads for the game: no wall-clock reads in the network layer', () => {
        const folder = path.resolve('src/server/net');
        const readers = fs
            .readdirSync(folder)
            .filter((file) => file !== 'clock.ts' && file.endsWith('.ts'))
            .filter((file) => fs.readFileSync(path.join(folder, file), 'utf8').includes('Date.now('));
        expect(readers).toEqual([]);
    });
});
