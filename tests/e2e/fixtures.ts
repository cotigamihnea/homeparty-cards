import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CardLibrary } from '../../src/server/cards/library.js';
import { startServer, type RunningServer } from '../../src/server/index.js';
import type { LanSelection } from '../../src/server/net/lanAddress.js';
import { serveBuiltClient } from '../../src/server/static.js';
import type { Timing } from '../../src/shared/constants.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../../src/shared/events.js';
import type { Settings } from '../../src/shared/settings.js';

export const TV_VIEWPORT = { width: 1920, height: 1080 };
export const PHONE_VIEWPORTS = [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
] as const;
export type PhoneViewport = (typeof PHONE_VIEWPORTS)[number];

type LaptopSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const CLEAN_LAN: LanSelection = { address: '127.0.0.1', candidates: [], isWsl: false, wslMode: null, warning: null };

/** Short enough to play many rounds in a test, long enough for a reloading phone to come back in time. */
export const E2E_TIMING: Timing = {
    roundIntroMs: 400,
    revealMsPerSubmission: 150,
    resultMs: 3000,
    voidResultMs: 1500,
    czarGraceMs: 4000,
    vipGraceMs: 4000,
    resumeMinMs: 1000,
    secondMs: 1000,
};

interface Fixtures {
    lan: LanSelection;
    timing: Timing | undefined;
    /** A smaller card library (e.g. only the longest cards); the committed data by default. */
    cards: CardLibrary | undefined;
    /** Changes settings with the laptop's host rights (the settings screens arrive in Phase 5). */
    hostSettings: (patch: Partial<Settings>) => Promise<void>;
    server: RunningServer;
    openHost: () => Promise<Page>;
    openPhone: (viewport?: { width: number; height: number }) => Promise<Page>;
}

export const test = base.extend<Fixtures>({
    lan: [CLEAN_LAN, { option: true }],
    timing: [undefined, { option: true }],
    cards: [undefined, { option: true }],
    server: async ({ lan, timing, cards }, use) => {
        // Every test keeps its custom decks in a folder of its own, never in the repo's.
        const customDecksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cah-decks-'));
        const server = await startServer({
            port: 0,
            host: '127.0.0.1',
            mountClient: serveBuiltClient(path.resolve('dist/client')),
            lan,
            timing,
            cards,
            customDecksDir,
        });
        await use(server);
        await server.close();
        fs.rmSync(customDecksDir, { recursive: true, force: true });
    },
    hostSettings: async ({ server }, use) => {
        const sockets: LaptopSocket[] = [];
        await use(async (patch) => {
            const laptop: LaptopSocket = io(`http://127.0.0.1:${server.port}`, {
                forceNew: true,
                transports: ['websocket'],
            });
            sockets.push(laptop);
            expect((await laptop.emitWithAck('hostHello')).admin).toBe(true);
            expect(await laptop.emitWithAck('updateSettings', { patch })).toEqual({ ok: true });
        });
        sockets.forEach((socket) => socket.disconnect());
    },
    openHost: async ({ browser, server }, use) => {
        const contexts: BrowserContext[] = [];
        await use(async () => {
            const context = await browser.newContext({ viewport: TV_VIEWPORT });
            contexts.push(context);
            const page = await context.newPage();
            await page.goto(`http://127.0.0.1:${server.port}/host`);
            return page;
        });
        await Promise.all(contexts.map((context) => context.close()));
    },
    openPhone: async ({ browser, server }, use) => {
        const contexts: BrowserContext[] = [];
        await use(async (viewport = PHONE_VIEWPORTS[0]) => {
            const context = await browser.newContext({
                viewport,
                isMobile: true,
                hasTouch: true,
                deviceScaleFactor: 2,
            });
            contexts.push(context);
            const page = await context.newPage();
            await page.goto(`http://127.0.0.1:${server.port}/`);
            return page;
        });
        await Promise.all(contexts.map((context) => context.close()));
    },
});

export async function joinAs(phone: Page, name: string): Promise<void> {
    await phone.getByLabel('Your name').fill(name);
    await phone.getByRole('button', { name: 'Join game' }).click();
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
}

export { expect };
