import express, { type Express } from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import type { Socket as TcpSocket } from 'node:net';
import { Server } from 'socket.io';
import { DEFAULT_PORT, PORT_FALLBACK_ATTEMPTS, type Timing } from '../shared/constants.js';
import { DEFAULT_SETTINGS } from '../shared/settings.js';
import { defaultCustomDecksDir, openDeckStore, type DeckStore } from './cards/customDecks.js';
import { defaultPackIds } from './cards/deck.js';
import { loadCardLibrary, type CardLibrary } from './cards/library.js';
import { cardSource } from './cards/source.js';
import { isLaptopAddress, ownAddresses } from './net/adminAuth.js';
import { registerHandlers } from './net/handlers.js';
import { hostSystem, readLanSelection, type LanSelection } from './net/lanAddress.js';
import { listenWithFallback } from './net/listen.js';
import { makeQrSvg } from './net/qr.js';
import { Room, type GameServer } from './net/room.js';
import { Sessions } from './net/sessions.js';

export type ClientMount = (app: Express, httpServer: HttpServer) => void | Promise<void>;

export interface ServerOptions {
    port?: number;
    host?: string;
    mountClient: ClientMount;
    lan?: LanSelection;
    /** Defaults to the committed card data; tests may pass a small library. */
    cards?: CardLibrary;
    /** Round timings; tests shorten them. */
    timing?: Timing;
    /** Defaults to the laptop itself (loopback or one of its own addresses). */
    isAdminAddress?: (address: string) => boolean;
    /** Where custom decks are kept; defaults to `custom-decks/` in the repo (Electron passes its app-data folder). */
    customDecksDir?: string;
}

export interface RunningServer {
    port: number;
    lan: LanSelection;
    cards: CardLibrary;
    decks: DeckStore;
    urls: { host: string; join: string };
    close: () => Promise<void>;
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
    const cards = options.cards ?? loadCardLibrary();
    const decks = openDeckStore(options.customDecksDir ?? defaultCustomDecksDir());
    const app = express();
    app.disable('x-powered-by');
    const httpServer = createServer(app);
    const io: GameServer = new Server(httpServer, {
        // A deck import (up to 256 KB of file) with room for escaping and the envelope.
        maxHttpBufferSize: 512 * 1024,
        pingInterval: 10_000,
        pingTimeout: 8_000,
        destroyUpgrade: false,
    });
    const connections = trackConnections(httpServer);
    const room = new Room(io, {
        cards: cardSource(cards, decks),
        settings: { ...DEFAULT_SETTINGS, packIds: defaultPackIds(cards) },
        timing: options.timing,
    });
    registerHandlers(io, {
        room,
        sessions: new Sessions(),
        decks,
        isAdminAddress: options.isAdminAddress ?? ((address) => isLaptopAddress(address, ownAddresses())),
    });
    await options.mountClient(app, httpServer);

    const port = await listenWithFallback(
        httpServer,
        options.port ?? DEFAULT_PORT,
        options.host ?? '0.0.0.0',
        PORT_FALLBACK_ATTEMPTS,
    );
    const lan = options.lan ?? readLanSelection();
    const joinUrl = `http://${lan.address}:${port}`;
    room.setNetwork({
        joinUrl,
        qrSvg: await makeQrSvg(joinUrl),
        warning: lan.warning,
        host: hostSystem(process.platform, lan.wslMode),
    });

    return {
        port,
        lan,
        cards,
        decks,
        urls: { host: `http://localhost:${port}/host`, join: joinUrl },
        close: () => {
            room.dispose();
            return closeServer(io, connections);
        },
    };
}

function trackConnections(httpServer: HttpServer): Set<TcpSocket> {
    const connections = new Set<TcpSocket>();
    httpServer.on('connection', (socket) => {
        connections.add(socket);
        socket.once('close', () => connections.delete(socket));
    });
    return connections;
}

/**
 * Socket.IO's close waits for every connection to end, and a phone that never answers the WebSocket
 * close handshake holds it for up to 30 s. Phones reconnect anyway, so shutdown drops whatever is left.
 */
async function closeServer(io: GameServer, connections: Set<TcpSocket>): Promise<void> {
    const closing = io.close();
    for (const socket of connections) socket.destroy();
    await closing;
}
