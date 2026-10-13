import { describe, expect, it } from 'vitest';
import { lobbyPanel } from '../../src/client/phone/play.js';
import { player, playerView } from './views.js';

const lobby = (isVip: boolean) =>
    playerView({ phase: 'LOBBY', round: null, players: [player('me', { isVip }), player('other')] });

describe('lobbyPanel', () => {
    it('keeps the VIP’s open panel in the lobby', () => {
        expect(lobbyPanel(lobby(true), 'settings')).toBe('settings');
        expect(lobbyPanel(lobby(true), 'packs')).toBe('packs');
        expect(lobbyPanel(lobby(true), null)).toBeNull();
    });

    it('closes it when the crown went to someone else', () => {
        expect(lobbyPanel(lobby(false), 'settings')).toBeNull();
    });

    it('closes it once the game has started', () => {
        const started = playerView({ players: [player('me', { isVip: true }), player('czar', { isCzar: true })] });
        expect(lobbyPanel(started, 'players')).toBeNull();
    });
});
