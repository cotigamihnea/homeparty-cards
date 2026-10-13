import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameNow } from '../../src/server/net/clock.js';
import { VIP_RECONNECT_GRACE_MS } from '../../src/shared/constants.js';
import { roomWithFakeSockets } from './fakeRoom.js';

describe('Room timers', () => {
    beforeEach(() => {
        // The room keeps time on the monotonic clock (gameNow), so that one is faked too.
        vi.useFakeTimers({ now: 1_000_000, toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('hands the crown over exactly when the VIP has been away for 30 s', () => {
        const { room, vip } = roomWithFakeSockets();
        room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p1', name: 'Ana', now: gameNow() });
        room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p2', name: 'Bogdan', now: gameNow() });
        room.dispatch({ type: 'PLAYER_DISCONNECTED', playerId: 'p1', now: gameNow() });
        vi.advanceTimersByTime(VIP_RECONNECT_GRACE_MS - 1);
        expect(vip()).toBe('Ana');
        vi.advanceTimersByTime(1);
        expect(vip()).toBe('Bogdan');
    });

    it('cancels the handover when the VIP comes back in time', () => {
        const { room, vip } = roomWithFakeSockets();
        room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p1', name: 'Ana', now: gameNow() });
        room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p2', name: 'Bogdan', now: gameNow() });
        room.dispatch({ type: 'PLAYER_DISCONNECTED', playerId: 'p1', now: gameNow() });
        vi.advanceTimersByTime(10_000);
        room.dispatch({ type: 'PLAYER_RECONNECTED', playerId: 'p1', now: gameNow() });
        vi.advanceTimersByTime(60_000);
        expect(vip()).toBe('Ana');
    });

    it('stays stopped when players drop while the server is shutting down', () => {
        const { room, hostViews } = roomWithFakeSockets();
        room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p1', name: 'Ana', now: gameNow() });
        room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p2', name: 'Bogdan', now: gameNow() });
        room.dispose();
        const sent = hostViews.length;
        room.dispatch({ type: 'PLAYER_DISCONNECTED', playerId: 'p1', now: gameNow() });
        expect(vi.getTimerCount()).toBe(0);
        expect(hostViews).toHaveLength(sent);
    });

    it('stops ticking once disposed', () => {
        const { room, hostViews } = roomWithFakeSockets();
        room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p1', name: 'Ana', now: gameNow() });
        room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p2', name: 'Bogdan', now: gameNow() });
        room.dispatch({ type: 'PLAYER_DISCONNECTED', playerId: 'p1', now: gameNow() });
        const sent = hostViews.length;
        room.dispose();
        vi.advanceTimersByTime(60_000);
        expect(hostViews).toHaveLength(sent);
    });
});
