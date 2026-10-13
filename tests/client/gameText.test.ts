// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { avatarBadge } from '../../src/client/ui/avatars.js';
import { findPlayer, playerName, scoreboardPlayers, winnersTitle } from '../../src/client/ui/gameText.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import { RANDO_ID } from '../../src/shared/constants.js';
import { player, playerView } from './views.js';

setLanguage('en');

describe('playerName', () => {
    it('is the player’s name', () => {
        expect(playerName(playerView({ players: [player('p1', { name: 'Ana' })] }), 'p1')).toBe('Ana');
    });

    it('says the player left when they are no longer in the game', () => {
        expect(playerName(playerView(), 'gone')).toBe('someone who left');
    });
});

describe('Rando Cardrissian', () => {
    const withRando = playerView({ players: [player('p1', { name: 'Ana' })], rando: { score: 2 } });

    it('is named and scored like a player while it plays, but is never one of the players', () => {
        expect(findPlayer(withRando, RANDO_ID)).toMatchObject({ name: 'Rando Cardrissian', score: 2 });
        expect(findPlayer(playerView(), RANDO_ID)).toBeUndefined();
        expect(scoreboardPlayers(withRando).map((p) => p.name)).toEqual(['Ana', 'Rando Cardrissian']);
        expect(scoreboardPlayers(playerView()).map((p) => p.id)).toEqual(['me', 'czar']);
    });

    it('has a die for a badge, not an initial or a player colour', () => {
        const badge = avatarBadge(findPlayer(withRando, RANDO_ID)!);
        expect(badge.classList.contains('is-rando')).toBe(true);
        expect(badge.querySelector('svg')).not.toBeNull();
        expect(badge.textContent).toBe('');
    });

    it('winning the game sends everyone home in shame', () => {
        expect(winnersTitle(withRando, [RANDO_ID])).toBe('Rando Cardrissian wins. Everyone goes home in shame.');
        expect(winnersTitle(withRando, ['p1', RANDO_ID])).toBe('Ana & Rando Cardrissian win!');
    });
});
