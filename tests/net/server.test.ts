import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../../src/server/index.js';
import type { LanSelection } from '../../src/server/net/lanAddress.js';
import { connectTo, trackViews, type TestSocket } from './socketHelpers.js';

const LAN: LanSelection = { address: '127.0.0.1', candidates: [], isWsl: false, wslMode: null, warning: null };

let server: RunningServer;
let decksFolder: string;
let sockets: TestSocket[];

beforeEach(async () => {
    sockets = [];
    decksFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'cah-decks-'));
    server = await startServer({
        port: 0,
        host: '127.0.0.1',
        mountClient: () => {},
        lan: LAN,
        customDecksDir: decksFolder,
    });
});

afterEach(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await server.close();
    fs.rmSync(decksFolder, { recursive: true, force: true });
});

function host() {
    const socket = connectTo(server.port, sockets);
    const views = trackViews(socket, 'hostView');
    socket.emit('hostHello', () => {});
    return { socket, views };
}

function phone() {
    const socket = connectTo(server.port, sockets);
    return { socket, views: trackViews(socket, 'playerView') };
}

function rawEmit(socket: TestSocket, event: string, payload: unknown): void {
    (socket.emit as (event: string, payload: unknown) => void)(event, payload);
}

describe('card library', () => {
    it('is loaded once at startup from the committed data', () => {
        expect(server.cards.packs).toHaveLength(205);
        expect(server.cards.packs[0]?.id).toBe('cah-base-set');
    });
});

describe('host screen', () => {
    it('gets a view with the join URL and an SVG QR code', async () => {
        const view = await host().views.until(() => true);
        expect(view.network.joinUrl).toBe(`http://127.0.0.1:${server.port}`);
        expect(view.network.qrSvg).toMatch(/^<svg/);
        expect(view.players).toEqual([]);
    });
});

describe('joining', () => {
    it('returns a player id, seats the player and sends each screen its own view', async () => {
        const tv = host();
        const ana = phone();
        const ack = await ana.socket.emitWithAck('join', { name: '  Ana ' });
        expect(ack).toMatchObject({ ok: true });
        const playerId = ack.ok ? ack.playerId : '';
        const mine = await ana.views.until((view) => view.myId === playerId);
        expect(mine.players).toEqual([
            {
                id: playerId,
                name: 'Ana',
                avatar: 0,
                score: 0,
                connected: true,
                isVip: true,
                isCzar: false,
                hasSubmitted: false,
                inRound: false,
            },
        ]);
        await tv.views.until((view) => view.players.length === 1 && view.players[0]?.name === 'Ana');
    });

    it('rejects a duplicate name in another case', async () => {
        await phone().socket.emitWithAck('join', { name: 'Ana' });
        expect(await phone().socket.emitWithAck('join', { name: 'ANA' })).toEqual({ ok: false, reason: 'NAME_TAKEN' });
    });

    it('rejects joining twice from one phone', async () => {
        const ana = phone();
        await ana.socket.emitWithAck('join', { name: 'Ana' });
        expect(await ana.socket.emitWithAck('join', { name: 'Ana 2' })).toEqual({
            ok: false,
            reason: 'ALREADY_JOINED',
        });
    });

    it('survives malformed payloads and missing acks', async () => {
        const rogue = phone().socket;
        expect(await rogue.emitWithAck('join', 42 as never)).toEqual({ ok: false, reason: 'BAD_REQUEST' });
        expect(await rogue.emitWithAck('join', { name: 'x'.repeat(5000) })).toEqual({
            ok: false,
            reason: 'BAD_REQUEST',
        });
        rawEmit(rogue, 'join', { name: 'No Ack' });
        rawEmit(rogue, 'transferVip', null);
        expect(await phone().socket.emitWithAck('join', { name: 'Still Up' })).toMatchObject({ ok: true });
    });

    it('a phone that reconnects gets its own seat back by typing the same name', async () => {
        const first = phone();
        const joined = await first.socket.emitWithAck('join', { name: 'Ana' });
        const tv = host();
        await tv.views.until((view) => view.players.length === 1);
        first.socket.disconnect();
        await tv.views.until((view) => view.players[0]?.connected === false);
        expect(await phone().socket.emitWithAck('join', { name: 'ana' })).toEqual(joined);
        await tv.views.until((view) => view.players.length === 1 && view.players[0]?.connected === true);
    });
});

describe('the crown', () => {
    it('only the VIP can pass it on', async () => {
        const tv = host();
        const ana = phone();
        const bogdan = phone();
        await ana.socket.emitWithAck('join', { name: 'Ana' });
        const joined = await bogdan.socket.emitWithAck('join', { name: 'Bogdan' });
        const bogdanId = joined.ok ? joined.playerId : '';
        expect(await bogdan.socket.emitWithAck('transferVip', { playerId: bogdanId })).toEqual({
            ok: false,
            reason: 'NOT_VIP',
        });
        expect(await ana.socket.emitWithAck('transferVip', { playerId: bogdanId })).toEqual({ ok: true });
        await tv.views.until((view) => view.players.find((p) => p.isVip)?.name === 'Bogdan');
    });

    it('keeps the seat and the crown when the VIP’s phone drops (the 30 s handover comes from the engine)', async () => {
        const tv = host();
        const ana = phone();
        await ana.socket.emitWithAck('join', { name: 'Ana' });
        await phone().socket.emitWithAck('join', { name: 'Bogdan' });
        await tv.views.until((view) => view.players.length === 2);
        ana.socket.disconnect();
        const view = await tv.views.until((v) => v.players[0]?.connected === false);
        expect(view.players.map((p) => [p.name, p.isVip])).toEqual([
            ['Ana', true],
            ['Bogdan', false],
        ]);
    });
});

describe('shutting down', () => {
    it('does not wait for a phone that never answers the WebSocket close handshake', async () => {
        const phone = net.connect(server.port, '127.0.0.1');
        await new Promise<void>((resolve) => phone.once('connect', () => resolve()));
        const upgraded = new Promise<void>((resolve) => phone.once('data', () => resolve()));
        phone.write(
            [
                'GET /socket.io/?EIO=4&transport=websocket HTTP/1.1',
                `Host: 127.0.0.1:${server.port}`,
                'Upgrade: websocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
                'Sec-WebSocket-Version: 13',
                '',
                '',
            ].join('\r\n'),
        );
        await upgraded;
        const started = Date.now();
        await server.close();
        expect(Date.now() - started).toBeLessThan(1000);
        phone.destroy();
    }, 5000);
});

describe('port fallback', () => {
    it('joinUrl uses the port it actually got', async () => {
        const blocker = net.createServer();
        const busy = await new Promise<number>((resolve) =>
            blocker.listen(0, '127.0.0.1', () => resolve((blocker.address() as net.AddressInfo).port)),
        );
        const second = await startServer({ port: busy, host: '127.0.0.1', mountClient: () => {}, lan: LAN });
        try {
            expect(second.port).not.toBe(busy);
            expect(second.urls.join).toBe(`http://127.0.0.1:${second.port}`);
            expect(second.urls.host).toBe(`http://localhost:${second.port}/host`);
        } finally {
            await second.close();
            await new Promise((resolve) => blocker.close(resolve));
        }
    });
});
