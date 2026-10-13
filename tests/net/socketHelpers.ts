import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../src/shared/events.js';
import type { HostView, PlayerView } from '../../src/shared/views.js';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type Views = { hostView: HostView; playerView: PlayerView };

interface Waiter<V> {
    predicate: (view: V) => boolean;
    resolve: (view: V) => void;
}

export function connectTo(port: number, opened: TestSocket[]): TestSocket {
    const socket: TestSocket = io(`http://127.0.0.1:${port}`, { forceNew: true, transports: ['websocket'] });
    opened.push(socket);
    return socket;
}

/** Records the latest view of one kind and lets a test wait for one matching a predicate. */
export function trackViews<E extends keyof Views>(socket: TestSocket, event: E) {
    let latest: Views[E] | null = null;
    let waiters: Waiter<Views[E]>[] = [];
    const on = socket.on.bind(socket) as unknown as (name: E, listener: (view: Views[E]) => void) => void;
    on(event, (view) => {
        latest = view;
        const pending = waiters;
        waiters = [];
        for (const waiter of pending) {
            if (waiter.predicate(view)) waiter.resolve(view);
            else waiters.push(waiter);
        }
    });
    return {
        latest(): Views[E] {
            if (!latest) throw new Error(`no ${event} yet`);
            return latest;
        },
        until(predicate: (view: Views[E]) => boolean, timeoutMs = 2000): Promise<Views[E]> {
            if (latest && predicate(latest)) return Promise.resolve(latest);
            return new Promise((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error(`no matching ${event} within ${timeoutMs}ms`)),
                    timeoutMs,
                );
                waiters.push({
                    predicate,
                    resolve: (view) => {
                        clearTimeout(timer);
                        resolve(view);
                    },
                });
            });
        },
    };
}
