import { io, type Socket } from 'socket.io-client';
import type { RunningServer } from '../../src/server/index.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../../src/shared/events.js';
import type { PlayerView } from '../../src/shared/views.js';

type PhoneSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SocketPhone {
    name: string;
    id: string;
    socket: PhoneSocket;
    view(): PlayerView;
}

async function until(check: () => boolean, timeoutMs = 15_000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (!check()) {
        if (Date.now() > end) throw new Error('timed out waiting for the game');
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
}

/** Players without a browser, for tests that only look at the TV: they join, answer and judge over the socket. */
export async function socketPhones(server: RunningServer, names: readonly string[]) {
    const phones: SocketPhone[] = [];
    for (const name of names) {
        const socket: PhoneSocket = io(`http://127.0.0.1:${server.port}`, {
            forceNew: true,
            transports: ['websocket'],
        });
        let latest: PlayerView | null = null;
        socket.on('playerView', (view) => (latest = view));
        const ack = await socket.emitWithAck('join', { name });
        if (!ack.ok) throw new Error(`${name} could not join: ${ack.reason}`);
        await until(() => latest !== null);
        phones.push({ name, id: ack.playerId, socket, view: () => latest! });
    }
    const vip = phones[0]!;

    async function everyoneAnswers(): Promise<void> {
        await until(() => vip.view().phase === 'SUBMITTING');
        for (const phone of phones) {
            await until(() => phone.view().phase !== 'ROUND_START');
            const view = phone.view();
            if (view.phase !== 'SUBMITTING' || !view.canSubmit) continue;
            const cardIds = view.hand.slice(0, view.round!.black.pick).map((card) => card.id);
            await phone.socket.emitWithAck('submitCards', { cardIds });
        }
    }

    function czar(): SocketPhone {
        const czarId = vip.view().round?.czarId;
        const found = phones.find((phone) => phone.id === czarId);
        if (!found) throw new Error('no Czar');
        return found;
    }

    /** The Czar waits for the read-out, looks at the second answer (or the first) and picks it. */
    async function czarPicks(): Promise<void> {
        const judge = czar();
        await until(() => judge.view().judging?.revealed === true, 60_000);
        const submissions = judge.view().judging!.submissions;
        const choice = submissions[Math.min(1, submissions.length - 1)]!.id;
        await judge.socket.emitWithAck('czarHighlight', { submissionId: choice });
        return void (await judge.socket.emitWithAck('czarPick', { submissionId: choice }));
    }

    return {
        phones,
        vip,
        czar,
        everyoneAnswers,
        czarPicks,
        close: () => phones.forEach((phone) => phone.socket.disconnect()),
    };
}
