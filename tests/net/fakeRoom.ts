import type { CardSource } from '../../src/server/cards/source.js';
import { HOSTS_ROOM, Room, type GameServer } from '../../src/server/net/room.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';
import type { HostView } from '../../src/shared/views.js';

/** A Room on a fake Socket.io server that records every view sent to the TV screens. */
export function roomWithFakeSockets() {
    const hostViews: HostView[] = [];
    const io = {
        to: (target: string) => ({
            emit: (event: string, view: HostView) => {
                if (target === HOSTS_ROOM && event === 'hostView') hostViews.push(view);
            },
        }),
        sockets: { sockets: new Map() },
    } as unknown as GameServer;
    const cards: CardSource = {
        whiteText: (id) => id,
        blackText: (id) => id,
        hasPack: () => true,
        catalog: () => [],
        deckSize: () => ({ white: 1000, black: 100 }),
        catalogVersion: () => 0,
        dealDeck: () => ({ white: [], black: [] }),
    };
    const room = new Room(io, { cards, settings: DEFAULT_SETTINGS });
    room.setNetwork({ joinUrl: 'http://10.0.0.2:4242', qrSvg: '<svg/>', warning: null, host: 'windows' });
    const vip = () => hostViews.at(-1)?.players.find((player) => player.isVip)?.name;
    return { room, hostViews, vip };
}
