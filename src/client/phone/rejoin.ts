import type { Reason } from '../../shared/reasons.js';

export type JoinFailure = Reason | 'TIMEOUT';
export type JoinOutcome = { ok: true } | { ok: false; reason: JoinFailure };

export interface RejoinDeps<T> {
    attempt: (target: T, done: (outcome: JoinOutcome) => void) => void;
    /** Schedules a retry and returns a function that cancels it. */
    schedule: (retry: () => void, delayMs: number) => () => void;
    onGiveUp: (target: T, reason: JoinFailure) => void;
    retryMs: number;
    maxAttempts: number;
}

export interface Rejoiner<T> {
    start(target: T): void;
    stop(): void;
}

// The server may still hold the old seat (it notices a dead phone only after its ping timeout), or the ack got lost.
const RETRYABLE: ReadonlySet<JoinFailure> = new Set(['NAME_TAKEN', 'TIMEOUT']);

/** Gets the seat back after a reconnect, retrying what may pass later; a new start() supersedes any chain still running. */
export function createRejoiner<T>(deps: RejoinDeps<T>): Rejoiner<T> {
    let generation = 0;
    let cancelRetry: (() => void) | null = null;

    function stop(): void {
        generation++;
        cancelRetry?.();
        cancelRetry = null;
    }

    function run(target: T, attemptNumber: number, chain: number): void {
        deps.attempt(target, (outcome) => {
            if (chain !== generation) return;
            if (outcome.ok || outcome.reason === 'ALREADY_JOINED') return;
            if (RETRYABLE.has(outcome.reason) && attemptNumber < deps.maxAttempts) {
                cancelRetry = deps.schedule(() => {
                    cancelRetry = null;
                    run(target, attemptNumber + 1, chain);
                }, deps.retryMs);
                return;
            }
            deps.onGiveUp(target, outcome.reason);
        });
    }

    return {
        start(target) {
            stop();
            run(target, 1, generation);
        },
        stop,
    };
}
