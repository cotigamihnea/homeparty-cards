export interface Clock {
    /** Call with a view's serverNow when it arrives. */
    sync(serverNow: number): void;
    /** The server's time, by this device's clock plus the last known difference. */
    now(): number;
}

/** Phones' clocks are often off by seconds; countdowns use the server's clock instead. */
export function createClock(localNow: () => number = Date.now): Clock {
    let offset = 0;
    return {
        sync(serverNow) {
            offset = serverNow - localNow();
        },
        now: () => localNow() + offset,
    };
}

export function secondsLeft(endsAt: number, now: number): number {
    return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
