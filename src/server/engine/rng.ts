/** mulberry32: a small seeded PRNG. The state is a uint32 kept in GameState so the engine stays pure. */
export function nextRandom(state: number): [value: number, next: number] {
    const next = (state + 0x6d2b79f5) >>> 0;
    let t = next;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Fisher–Yates shuffle; returns a new array and the advanced random state. */
export function shuffle<T>(items: readonly T[], state: number): [shuffled: T[], next: number] {
    const result = [...items];
    let current = state;
    for (let i = result.length - 1; i > 0; i--) {
        const [value, next] = nextRandom(current);
        current = next;
        const j = Math.floor(value * (i + 1));
        [result[i], result[j]] = [result[j] as T, result[i] as T];
    }
    return [result, current];
}

/** An 8-character opaque id (base 36) from two random draws. */
export function randomId(state: number): [id: string, next: number] {
    const [first, afterFirst] = nextRandom(state);
    const [second, afterSecond] = nextRandom(afterFirst);
    const part = (value: number) =>
        Math.floor(value * 36 ** 4)
            .toString(36)
            .padStart(4, '0');
    return [part(first) + part(second), afterSecond];
}
