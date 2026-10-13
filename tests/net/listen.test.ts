import { createServer, type Server } from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { listenWithFallback } from '../../src/server/net/listen.js';

const servers: (Server | net.Server)[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

function occupyPort(): Promise<number> {
    const blocker = net.createServer();
    servers.push(blocker);
    return new Promise((resolve) =>
        blocker.listen(0, '127.0.0.1', () => resolve((blocker.address() as net.AddressInfo).port)),
    );
}

function newHttpServer(): Server {
    const server = createServer();
    servers.push(server);
    return server;
}

describe('listenWithFallback', () => {
    it('listens on the requested port when it is free (0 = any)', async () => {
        expect(await listenWithFallback(newHttpServer(), 0, '127.0.0.1', 3)).toBeGreaterThan(0);
    });

    it('moves to a later port when the requested one is busy', async () => {
        const busy = await occupyPort();
        const port = await listenWithFallback(newHttpServer(), busy, '127.0.0.1', 5);
        expect(port).toBeGreaterThan(busy);
        expect(port).toBeLessThanOrEqual(busy + 5);
    });

    it('gives up with EADDRINUSE when no attempts are left', async () => {
        const busy = await occupyPort();
        await expect(listenWithFallback(newHttpServer(), busy, '127.0.0.1', 0)).rejects.toMatchObject({
            code: 'EADDRINUSE',
        });
    });
});
