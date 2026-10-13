import { io, type Socket } from 'socket.io-client';
import type { Ack, AdminEvent, ClientToServerEvents, ServerToClientEvents } from '../../shared/events.js';
import { t, translateReason, type MessageKey } from './i18n/index.js';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type TimedSocket = ReturnType<GameSocket['timeout']>;
type AckCallback = (error: Error | null, response: Ack) => void;

export const ACK_TIMEOUT_MS = 5000;

export function connectToGame(): GameSocket {
    return io();
}

/** What a screen should say about the server's answer: null when it went through. */
export function ackNotice(error: Error | null, response: Ack | undefined, unreachable: string): string | null {
    if (error || !response) return unreachable;
    return response.ok ? null : translateReason(response.reason);
}

export interface CommandState {
    pending: boolean;
    notice: string | null;
}

export interface Commands {
    /** Sends one command; the screen shows it as pending and then any refusal as a notice. */
    send(emit: (socket: TimedSocket, done: AckCallback) => void, onOk?: () => void): void;
    admin(event: AdminEvent): void;
}

export function createCommands(
    socket: GameSocket,
    state: CommandState,
    render: () => void,
    unreachable: MessageKey,
): Commands {
    function send(emit: (socket: TimedSocket, done: AckCallback) => void, onOk?: () => void): void {
        state.pending = true;
        state.notice = null;
        render();
        emit(socket.timeout(ACK_TIMEOUT_MS), (error, response) => {
            state.pending = false;
            state.notice = ackNotice(error, response, t(unreachable));
            if (!state.notice) onOk?.();
            render();
        });
    }

    return { send, admin: (event) => send((timed, done) => timed.emit(event, done)) };
}
