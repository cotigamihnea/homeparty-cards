/** The system time when the server started, less the time on the monotonic clock then. */
const ORIGIN = Date.now() - performance.now();

/**
 * The game's clock: milliseconds since 1970 like Date.now(), but counted on the monotonic clock, so it never jumps
 * when the system clock is set (WSL2 steps it by seconds; Windows syncs it now and then). Phase timers stay true,
 * and phones follow it through each view's `serverNow`.
 */
export function gameNow(): number {
    return Math.round(ORIGIN + performance.now());
}
