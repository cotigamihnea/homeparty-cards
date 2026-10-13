import type { ClientToServerEvents } from '../../shared/events.js';
import type { GameSocket } from './room.js';

type LooseSocket = { on(event: string, listener: (...args: unknown[]) => void): void };

const BAD_REQUEST = { ok: false, reason: 'BAD_REQUEST' } as const;

/**
 * Registers a handler that copes with whatever a client sends: the payload is the first argument unless that is
 * the ack, and the ack is the last argument when it is a function. A client that sends no ack just gets no reply.
 */
export function onEvent<R>(
    socket: GameSocket,
    event: keyof ClientToServerEvents,
    handle: (payload: unknown) => R,
): void {
    (socket as unknown as LooseSocket).on(event, (...args) => {
        const last = args.at(-1);
        const ack = typeof last === 'function' ? (last as (response: R) => void) : null;
        const response = handle(typeof args[0] === 'function' ? undefined : args[0]);
        ack?.(response);
    });
}

/** Like onEvent, but a payload of the wrong shape is refused with BAD_REQUEST before anything else is looked at. */
export function onPayload<P, R>(
    socket: GameSocket,
    event: keyof ClientToServerEvents,
    isPayload: (value: unknown) => value is P,
    handle: (payload: P) => R,
): void {
    onEvent(socket, event, (payload) => (isPayload(payload) ? handle(payload) : BAD_REQUEST));
}
