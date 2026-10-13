import { randomUUID } from 'node:crypto';
import type { HostHelloAck, JoinAck } from '../../shared/events.js';
import type { Reason } from '../../shared/reasons.js';
import type { DeckStore } from '../cards/customDecks.js';
import { gameNow } from './clock.js';
import { registerCommands } from './commands.js';
import { registerDeckCommands } from './deckCommands.js';
import { HOSTS_ROOM, type GameServer, type GameSocket, type Room } from './room.js';
import type { Sessions } from './sessions.js';
import { onEvent, onPayload } from './socketEvents.js';
import { isJoinPayload, isResumePayload } from './validate.js';

export interface HandlerOptions {
    room: Room;
    sessions: Sessions;
    /** Whether a connection comes from the laptop running the game (host admin rights). */
    isAdminAddress: (address: string) => boolean;
    decks: DeckStore;
}

function refuse(reason: Reason): JoinAck {
    return { ok: false, reason };
}

/** A TV screen never takes a seat, and a phone takes one seat at most. */
function seatBlocker(socket: GameSocket): Reason | null {
    if (socket.data.role === 'host') return 'BAD_REQUEST';
    return socket.data.playerId ? 'ALREADY_JOINED' : null;
}

export function registerHandlers(io: GameServer, { room, sessions, isAdminAddress, decks }: HandlerOptions): void {
    /** Tells an old connection why it is being dropped, then closes it without marking the seat away. */
    function closeConnection(socketId: string | null, event: 'kicked' | 'replaced'): void {
        const socket = socketId ? io.sockets.sockets.get(socketId) : undefined;
        if (!socket) return;
        socket.data.playerId = undefined;
        socket.emit(event);
        socket.disconnect();
    }

    function evict(playerId: string): void {
        closeConnection(sessions.revoke(playerId), 'kicked');
    }

    function seated(playerId: string): JoinAck {
        return { ok: true, playerId, sessionToken: sessions.issue(playerId) };
    }

    /** Puts this connection in an existing seat; the newest connection wins. */
    function takeSeat(socket: GameSocket, playerId: string): JoinAck {
        socket.data.role = 'player';
        socket.data.playerId = playerId;
        closeConnection(sessions.attach(playerId, socket.id), 'replaced');
        if (room.isConnected(playerId)) room.sendPlayerView(socket);
        else room.dispatch({ type: 'PLAYER_RECONNECTED', playerId, now: gameNow() });
        return seated(playerId);
    }

    function newSeat(socket: GameSocket, name: string): JoinAck {
        const playerId = randomUUID();
        socket.data.role = 'player';
        socket.data.playerId = playerId;
        sessions.attach(playerId, socket.id);
        const reason = room.dispatch({ type: 'PLAYER_JOINED', playerId, name, now: gameNow() });
        if (!reason) return seated(playerId);
        sessions.detach(playerId, socket.id);
        socket.data.role = undefined;
        socket.data.playerId = undefined;
        return refuse(reason);
    }

    io.on('connection', (socket) => {
        socket.emit('serverHello', { lang: room.language });

        onEvent(socket, 'hostHello', (): HostHelloAck => {
            if (socket.data.role === 'player') return { admin: false, decksFolder: null };
            socket.data.role = 'host';
            socket.data.admin = isAdminAddress(socket.handshake.address);
            void socket.join(HOSTS_ROOM);
            room.sendHostView(socket);
            return { admin: socket.data.admin, decksFolder: socket.data.admin ? decks.folder : null };
        });

        onPayload(socket, 'join', isJoinPayload, ({ name }): JoinAck => {
            const blocked = seatBlocker(socket);
            if (blocked) return refuse(blocked);
            const reclaimed = room.reclaimableSeat(name);
            return reclaimed ? takeSeat(socket, reclaimed) : newSeat(socket, name);
        });

        onPayload(socket, 'resume', isResumePayload, ({ sessionToken }): JoinAck => {
            const blocked = seatBlocker(socket);
            if (blocked) return refuse(blocked);
            const playerId = sessions.playerFor(sessionToken);
            if (playerId && room.hasPlayer(playerId)) return takeSeat(socket, playerId);
            return refuse(sessions.wasRevoked(sessionToken) ? 'KICKED' : 'UNKNOWN_SESSION');
        });

        registerCommands(socket, room, evict);
        registerDeckCommands(socket, room, decks);

        socket.on('disconnect', () => {
            const playerId = socket.data.playerId;
            if (playerId && sessions.detach(playerId, socket.id)) {
                room.dispatch({ type: 'PLAYER_DISCONNECTED', playerId, now: gameNow() });
            }
        });
    });
}
