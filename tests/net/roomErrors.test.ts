import { afterEach, describe, expect, it, vi } from 'vitest';
import { roomWithFakeSockets } from './fakeRoom.js';

vi.mock('../../src/server/engine/reduce.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../src/server/engine/reduce.js')>();
    return {
        reduce: (...args: Parameters<typeof original.reduce>) => {
            if (args[1].type === 'TRANSFER_VIP') throw new Error('engine invariant broke');
            return original.reduce(...args);
        },
    };
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Room when the engine throws', () => {
    it('refuses that action, keeps the last good state and keeps serving the game', () => {
        const { room, hostViews, vip } = roomWithFakeSockets();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p1', name: 'Ana', now: 1 });
        room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p2', name: 'Bogdan', now: 1 });

        expect(room.dispatch({ type: 'TRANSFER_VIP', by: { kind: 'host' }, playerId: 'p2' })).toBe('BAD_REQUEST');
        expect(errors).toHaveBeenCalledOnce();
        expect(vip()).toBe('Ana');
        expect(room.dispatch({ type: 'PLAYER_JOINED', playerId: 'p3', name: 'Cara', now: 2 })).toBeNull();
        expect(hostViews.at(-1)?.players).toHaveLength(3);
        room.dispose();
    });
});
