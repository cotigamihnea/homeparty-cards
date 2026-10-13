export type Buzz = 'tap' | 'sent' | 'yourTurn' | 'won' | 'gameWon';

const PATTERNS: Record<Buzz, number | number[]> = {
    tap: 8,
    sent: 20,
    yourTurn: [30, 40, 30],
    won: [60, 40, 120],
    gameWon: [80, 50, 80, 50, 160],
};

type Vibrate = (pattern: number | number[]) => boolean;

/** A short vibration on phones that support it (Android); iPhones have no web vibration, so nothing happens. */
export function buzz(kind: Buzz, device: { vibrate?: Vibrate } | undefined = globalThis.navigator): void {
    try {
        device?.vibrate?.(PATTERNS[kind]);
    } catch {
        // Some browsers refuse before the first tap on the page; a missed buzz is harmless.
    }
}
