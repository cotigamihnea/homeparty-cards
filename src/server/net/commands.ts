import type { Ack } from '../../shared/events.js';
import type { Reason } from '../../shared/reasons.js';
import type { Actor } from '../engine/actions.js';
import { gameNow } from './clock.js';
import type { GameSocket, Room } from './room.js';
import { onEvent, onPayload } from './socketEvents.js';
import {
    isAvatarPayload,
    isCardPayload,
    isEditWrittenCardPayload,
    isPlayerIdPayload,
    isSettingsPayload,
    isSubmissionPayload,
    isSubmitCardsPayload,
    isWriteCardPayload,
} from './validate.js';

function toAck(reason: Reason | null): Ack {
    return reason ? { ok: false, reason } : { ok: true };
}

/** A phone acts as itself (the engine checks it is the VIP); a TV screen acts as the host only on the laptop. */
export function actorOf(socket: GameSocket): Actor | Reason {
    if (socket.data.role === 'host') return socket.data.admin ? { kind: 'host' } : 'NOT_VIP';
    const playerId = socket.data.playerId;
    return playerId ? { kind: 'player', playerId } : 'NOT_JOINED';
}

/** The game's commands: every one is validated here (shape) and by the engine (rules) before anything changes. */
export function registerCommands(socket: GameSocket, room: Room, evict: (playerId: string) => void): void {
    function asAdmin(run: (by: Actor) => Reason | null): Ack {
        const by = actorOf(socket);
        return toAck(typeof by === 'string' ? by : run(by));
    }

    function asPlayer(run: (playerId: string) => Reason | null): Ack {
        const playerId = socket.data.role === 'player' ? socket.data.playerId : undefined;
        return toAck(playerId ? run(playerId) : 'NOT_JOINED');
    }

    function kick(by: Actor, playerId: string): Reason | null {
        const reason = room.dispatch({ type: 'KICK_PLAYER', by, playerId, now: gameNow() });
        if (!reason) evict(playerId);
        return reason;
    }

    onEvent(socket, 'listPacks', () => room.packs());
    onPayload(socket, 'setAvatar', isAvatarPayload, ({ avatar }) =>
        asPlayer((playerId) => room.dispatch({ type: 'SET_AVATAR', playerId, avatar })),
    );
    onPayload(socket, 'submitCards', isSubmitCardsPayload, ({ cardIds, blanks }) =>
        asPlayer((playerId) => room.dispatch({ type: 'SUBMIT_CARDS', playerId, cardIds, blanks, now: gameNow() })),
    );
    onEvent(socket, 'rebootHand', () =>
        asPlayer((playerId) => room.dispatch({ type: 'REBOOT_HAND', playerId, now: gameNow() })),
    );
    onPayload(socket, 'discardCard', isCardPayload, ({ cardId }) =>
        asPlayer((playerId) => room.dispatch({ type: 'DISCARD_CARD', playerId, cardId, now: gameNow() })),
    );
    onPayload(socket, 'czarHighlight', isSubmissionPayload, ({ submissionId }) =>
        asPlayer((playerId) => room.dispatch({ type: 'CZAR_HIGHLIGHT', playerId, submissionId })),
    );
    onPayload(socket, 'czarPick', isSubmissionPayload, ({ submissionId }) =>
        asPlayer((playerId) => room.dispatch({ type: 'CZAR_PICK', playerId, submissionId, now: gameNow() })),
    );
    onPayload(socket, 'updateSettings', isSettingsPayload, ({ patch }) =>
        asAdmin((by) => room.updateSettings(by, patch)),
    );
    onPayload(socket, 'kick', isPlayerIdPayload, ({ playerId }) => asAdmin((by) => kick(by, playerId)));
    onPayload(socket, 'transferVip', isPlayerIdPayload, ({ playerId }) =>
        asAdmin((by) => room.dispatch({ type: 'TRANSFER_VIP', by, playerId })),
    );
    onEvent(socket, 'startGame', () => asAdmin((by) => room.deal('START_GAME', by)));
    onEvent(socket, 'playAgain', () => asAdmin((by) => room.deal('PLAY_AGAIN', by)));
    onEvent(socket, 'endGame', () => asAdmin((by) => room.dispatch({ type: 'END_GAME', by, now: gameNow() })));
    onEvent(socket, 'backToLobby', () => asAdmin((by) => room.dispatch({ type: 'BACK_TO_LOBBY', by })));
    onEvent(socket, 'advance', () => asAdmin((by) => room.dispatch({ type: 'ADVANCE', by, now: gameNow() })));
    onPayload(socket, 'writeCard', isWriteCardPayload, ({ color, text }) =>
        asPlayer((playerId) => room.dispatch({ type: 'WRITE_CARD', playerId, color, text, now: gameNow() })),
    );
    onPayload(socket, 'editWrittenCard', isEditWrittenCardPayload, ({ cardId, text }) =>
        asPlayer((playerId) => room.dispatch({ type: 'EDIT_WRITTEN_CARD', playerId, cardId, text })),
    );
    onPayload(socket, 'removeWrittenCard', isCardPayload, ({ cardId }) =>
        asPlayer((playerId) => room.dispatch({ type: 'REMOVE_WRITTEN_CARD', playerId, cardId })),
    );
    onEvent(socket, 'startNow', () => asAdmin((by) => room.dispatch({ type: 'START_NOW', by, now: gameNow() })));
}
