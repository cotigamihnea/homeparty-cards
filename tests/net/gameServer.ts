import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, type RunningServer } from '../../src/server/index.js';
import type { CardLibrary } from '../../src/server/cards/library.js';
import type { LanSelection } from '../../src/server/net/lanAddress.js';
import type { Timing } from '../../src/shared/constants.js';
import type { Ack, JoinAck } from '../../src/shared/events.js';
import type { PlayerView } from '../../src/shared/views.js';
import { connectTo, trackViews, type TestSocket } from './socketHelpers.js';

export const LAN: LanSelection = { address: '127.0.0.1', candidates: [], isWsl: false, wslMode: null, warning: null };

export const FAST: Timing = {
    roundIntroMs: 40,
    revealMsPerSubmission: 15,
    resultMs: 120,
    voidResultMs: 80,
    czarGraceMs: 300,
    vipGraceMs: 300,
    resumeMinMs: 40,
    secondMs: 1000,
};

export interface TestPhone {
    socket: TestSocket;
    views: ReturnType<typeof trackViews<'playerView'>>;
    id: string;
    token: string;
    name: string;
}

/** A running server plus helpers to open TV and phone connections that are closed after each test. */
export async function gameServer(
    cards: CardLibrary,
    options: { isAdminAddress?: (address: string) => boolean; customDecksDir?: string } = {},
) {
    const sockets: TestSocket[] = [];
    const decksFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'cah-decks-'));
    const server: RunningServer = await startServer({
        port: 0,
        host: '127.0.0.1',
        mountClient: () => {},
        lan: LAN,
        cards,
        timing: FAST,
        customDecksDir: decksFolder,
        ...options,
    });

    function connect(): TestSocket {
        return connectTo(server.port, sockets);
    }

    async function tv() {
        const socket = connect();
        const views = trackViews(socket, 'hostView');
        const hello = await socket.emitWithAck('hostHello');
        return { socket, views, admin: hello.admin };
    }

    async function join(name: string): Promise<TestPhone> {
        const socket = connect();
        const views = trackViews(socket, 'playerView');
        const ack = await socket.emitWithAck('join', { name });
        if (!ack.ok) throw new Error(`${name} could not join: ${ack.reason}`);
        await views.until((view) => view.myId === ack.playerId);
        return { socket, views, id: ack.playerId, token: ack.sessionToken, name };
    }

    async function resume(token: string): Promise<{ ack: JoinAck; phone: Omit<TestPhone, 'id' | 'token' | 'name'> }> {
        const socket = connect();
        const views = trackViews(socket, 'playerView');
        const ack = await socket.emitWithAck('resume', { sessionToken: token });
        return { ack, phone: { socket, views } };
    }

    async function close(): Promise<void> {
        sockets.forEach((socket) => socket.disconnect());
        await server.close();
        fs.rmSync(decksFolder, { recursive: true, force: true });
    }

    return { server, decksFolder, connect, tv, join, resume, close };
}

export function expectOk(ack: Ack | JoinAck): void {
    if (!ack.ok) throw new Error(`refused: ${ack.reason}`);
}

/** The server tells the Czar's phone when the TV has read every answer out; the first pick after that counts. */
export async function pickWhenRevealed(czar: Pick<TestPhone, 'socket' | 'views'>, submissionId: string): Promise<Ack> {
    await czar.views.until((view) => view.judging?.revealed === true);
    return czar.socket.emitWithAck('czarPick', { submissionId });
}

/** Every phone that may answer this round submits the first cards of its hand; returns what each submitted. */
export async function everyoneAnswers(phones: readonly TestPhone[], round: number): Promise<Map<string, string[]>> {
    const answers = new Map<string, string[]>();
    for (const phone of phones) {
        // The Czar may be last in line, when everyone else has answered and judging has begun.
        const view = await phone.views.until((v) => v.round?.number === round && v.phase !== 'ROUND_START');
        if (view.phase !== 'SUBMITTING' || !view.canSubmit) continue;
        const cardIds = view.hand.slice(0, view.round!.black.pick).map((card) => card.id);
        expectOk(await phone.socket.emitWithAck('submitCards', { cardIds }));
        answers.set(phone.id, cardIds);
    }
    return answers;
}

export function czarOf(phones: readonly TestPhone[], view: PlayerView): TestPhone {
    const czar = phones.find((phone) => phone.id === view.round?.czarId);
    if (!czar) throw new Error('no Czar among these phones');
    return czar;
}
