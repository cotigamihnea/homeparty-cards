import { randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { Language, Timing } from '../../shared/constants.js';
import type {
    Answer,
    ClientToServerEvents,
    InterServerEvents,
    ServerToClientEvents,
    SocketData,
} from '../../shared/events.js';
import type { Reason } from '../../shared/reasons.js';
import { isValidSettingsPatch, type Settings } from '../../shared/settings.js';
import type { PackSummary } from '../../shared/packs.js';
import type { NetworkView } from '../../shared/views.js';
import type { DeckStore } from '../cards/customDecks.js';
import type { CardSource } from '../cards/source.js';
import type { Action, Actor } from '../engine/actions.js';
import { nextDeadline } from '../engine/deadline.js';
import { findReclaimableSeat } from '../engine/lobby.js';
import { reduce } from '../engine/reduce.js';
import { findPlayer } from '../engine/players.js';
import { checkAction, isAdmin } from '../engine/rules.js';
import { createInitialState, type GameState } from '../engine/state.js';
import { toHostView, toPlayerView } from '../engine/views.js';
import { feverCardsToSave } from '../engine/writing.js';
import { gameNow } from './clock.js';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export const HOSTS_ROOM = 'hosts';

export interface RoomOptions {
    cards: CardSource;
    settings: Settings;
    timing?: Timing;
}

/** Owns the game state; every change goes through the engine and out as per-socket views. */
export class Room {
    private state: GameState;
    private network: NetworkView | null = null;
    private readonly io: GameServer;
    private readonly cards: CardSource;
    private tickTimer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;

    constructor(io: GameServer, options: RoomOptions) {
        this.io = io;
        this.cards = options.cards;
        this.state = createInitialState(options.settings, options.timing);
    }

    get language(): Language {
        return this.state.settings.language;
    }

    /** A disconnected seat a returning phone may take back by typing the same name. */
    reclaimableSeat(name: string): string | null {
        return findReclaimableSeat(this.state, name);
    }

    hasPlayer(playerId: string): boolean {
        return findPlayer(this.state, playerId) !== undefined;
    }

    isConnected(playerId: string): boolean {
        return findPlayer(this.state, playerId)?.connected === true;
    }

    dispatch(action: Action): Reason | null {
        // Shutting down closes every socket; their disconnects must not restart the timer or broadcast.
        if (this.disposed) return 'WRONG_PHASE';
        const reason = checkAction(this.state, action);
        if (reason) return reason;
        try {
            const next = reduce(this.state, action);
            if (next !== this.state) {
                const languageChanged = next.settings.language !== this.state.settings.language;
                this.state = next;
                // Phones still on the join screen have no view yet, but should switch language too.
                if (languageChanged) this.io.emit('serverHello', { lang: next.settings.language });
                this.broadcast();
            }
        } catch (error) {
            // An engine invariant broke. Keep the party going on the last good state rather than crash the server.
            console.error(`[room] ${action.type} failed:`, error);
            return 'BAD_REQUEST';
        } finally {
            this.scheduleTick();
        }
        return null;
    }

    packs(): PackSummary[] {
        return this.cards.catalog();
    }

    /** Settings values are checked by the engine; which packs exist is known only here. */
    updateSettings(by: Actor, patch: unknown): Reason | null {
        if (!isAdmin(this.state, by)) return 'NOT_VIP';
        if (!isValidSettingsPatch(patch)) return 'INVALID_SETTINGS';
        if (patch.packIds && !patch.packIds.every((id) => this.cards.hasPack(id))) return 'INVALID_SETTINGS';
        return this.dispatch({ type: 'UPDATE_SETTINGS', by, settings: patch });
    }

    /**
     * Custom Fever's game over: the players' cards become a custom deck. The engine is asked first, so a refused save
     * writes no file; a failed write leaves the cards unsaved, to try again.
     */
    saveFever(by: Actor, name: string, decks: DeckStore): Answer<{ name: string }> {
        const reason = this.disposed ? 'WRONG_PHASE' : checkAction(this.state, { type: 'FEVER_SAVED', by, name });
        if (reason) return { ok: false, reason };
        const saved = decks.saveDeck(name, feverCardsToSave(this.state));
        if (!saved.ok) return saved;
        this.dispatch({ type: 'FEVER_SAVED', by, name: saved.name });
        return { ok: true, name: saved.name };
    }

    /** Custom decks change only in the lobby, and only at the VIP's or the laptop's hand (GAME_DESIGN §12). */
    deckAccess(by: Actor): Reason | null {
        if (!isAdmin(this.state, by)) return 'NOT_VIP';
        return this.state.phase === 'LOBBY' && !this.disposed ? null : 'WRONG_PHASE';
    }

    /** A custom deck changed: drop a deleted deck from the selection, and show every screen the new pack list. */
    decksChanged(): void {
        const selected = this.state.settings.packIds;
        const kept = selected.filter((id) => this.cards.hasPack(id));
        if (kept.length < selected.length) {
            this.dispatch({ type: 'UPDATE_SETTINGS', by: { kind: 'host' }, settings: { packIds: kept } });
        } else {
            this.broadcast();
        }
    }

    /** Starts a game (or the next one) with a deck built from the chosen packs and a fresh random seed. */
    deal(type: 'START_GAME' | 'PLAY_AGAIN', by: Actor): Reason | null {
        if (!isAdmin(this.state, by)) return 'NOT_VIP';
        const deck = this.cards.dealDeck(this.state.settings.packIds);
        return this.dispatch({ type, by, deck, seed: randomInt(0x1_0000_0000), now: gameNow() });
    }

    /** Stops the timer for good; the room ignores everything after this. */
    dispose(): void {
        this.disposed = true;
        this.clearTick();
    }

    private clearTick(): void {
        if (this.tickTimer) clearTimeout(this.tickTimer);
        this.tickTimer = null;
    }

    /** One timer for the engine's next deadline (phase timers, Czar and VIP grace); the engine decides what is due. */
    private scheduleTick(): void {
        this.clearTick();
        const at = nextDeadline(this.state);
        if (at === null) return;
        this.tickTimer = setTimeout(
            () => {
                this.tickTimer = null;
                this.dispatch({ type: 'TICK', now: gameNow() });
            },
            Math.max(0, at - gameNow()),
        );
    }

    setNetwork(network: NetworkView): void {
        this.network = network;
        this.broadcast();
    }

    sendPlayerView(socket: GameSocket, now = gameNow()): void {
        const playerId = socket.data.playerId;
        const view = playerId ? toPlayerView(this.state, playerId, this.cards, now) : null;
        if (view) socket.emit('playerView', view);
    }

    sendHostView(socket: GameSocket): void {
        if (this.network) socket.emit('hostView', toHostView(this.state, this.network, this.cards, gameNow()));
    }

    broadcast(): void {
        const now = gameNow();
        if (this.network) {
            this.io.to(HOSTS_ROOM).emit('hostView', toHostView(this.state, this.network, this.cards, now));
        }
        for (const socket of this.io.sockets.sockets.values()) this.sendPlayerView(socket, now);
    }
}
