import { describe, expect, it, vi } from 'vitest';
import { createSoundBoard, SOUND_GAIN } from '../../src/client/host/soundBoard.js';
import type { HostView } from '../../src/shared/views.js';
import { hostView, player } from './views.js';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
    const items = new Map<string, string>();
    return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
}

const lobby = (names: string[]): HostView =>
    hostView({ phase: 'LOBBY', round: null, players: names.map((name) => player(name)) });

describe('the sound board', () => {
    it('stays quiet about what was already on screen when the page loads, then plays each new moment once', () => {
        const play = vi.fn();
        const board = createSoundBoard({ play, storage: memoryStorage() });
        board.update(lobby(['ana', 'bo']), 0);
        expect(play).not.toHaveBeenCalled();
        board.update(lobby(['ana', 'bo', 'cy']), 0);
        board.update(lobby(['ana', 'bo', 'cy']), 0);
        expect(play).toHaveBeenCalledTimes(1);
        expect(play).toHaveBeenCalledWith('join', SOUND_GAIN.join);
    });

    it('scales every sound by the volume, and remembers volume and mute on this laptop', () => {
        const storage = memoryStorage();
        const play = vi.fn();
        const board = createSoundBoard({ play, storage });
        board.setVolume(0.5);
        board.update(lobby([]), 0);
        board.update(lobby(['ana']), 0);
        expect(play).toHaveBeenCalledWith('join', SOUND_GAIN.join * 0.5);
        board.setMuted(true);
        const again = createSoundBoard({ play, storage });
        expect(again.volume).toBe(0.5);
        expect(again.muted).toBe(true);
    });

    it('when muted, plays nothing and does not save the moments up for later', () => {
        const play = vi.fn();
        const board = createSoundBoard({ play, storage: memoryStorage() });
        board.update(lobby([]), 0);
        board.setMuted(true);
        board.update(lobby(['ana']), 0);
        board.setMuted(false);
        board.update(lobby(['ana']), 0);
        expect(play).not.toHaveBeenCalled();
    });

    it('copes without storage (a private window) and with a bad stored volume', () => {
        const broken = {
            getItem: () => 'loud',
            setItem: () => {
                throw new Error('quota');
            },
        };
        const board = createSoundBoard({ play: vi.fn(), storage: broken });
        expect(board.volume).toBe(1);
        expect(() => board.setMuted(true)).not.toThrow();
        expect(createSoundBoard({ play: vi.fn(), storage: null }).muted).toBe(false);
    });

    it('starts listening afresh after a reconnect, without replaying what is on screen', () => {
        const play = vi.fn();
        const board = createSoundBoard({ play, storage: memoryStorage() });
        board.update(lobby([]), 0);
        board.update(lobby(['ana']), 0);
        board.reset();
        board.update(lobby(['ana']), 0);
        expect(play).toHaveBeenCalledTimes(1);
        board.update(lobby(['ana', 'bo']), 0);
        expect(play).toHaveBeenCalledTimes(2);
    });
});
