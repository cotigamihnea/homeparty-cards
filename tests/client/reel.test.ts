// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { gameOverScreen } from '../../src/client/host/resultScreens.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import { resetOnce } from '../../src/client/ui/motion.js';
import type { HostView } from '../../src/shared/views.js';
import { hostView, player } from './views.js';

setLanguage('en');

const over: HostView = hostView({
    phase: 'GAME_OVER',
    round: null,
    players: [player('ana', { name: 'Ana', score: 2 }), player('bo', { name: 'Bo', score: 1 })],
    gameOver: {
        winnerIds: ['ana'],
        standings: [
            { playerId: 'ana', score: 2, rank: 1 },
            { playerId: 'bo', score: 1, rank: 2 },
        ],
        bestOf: [
            {
                round: 1,
                black: { text: 'Why am I sticky? _', pick: 1 },
                cards: [{ id: 'w1', text: 'Jam.' }],
                winnerId: 'ana',
            },
            {
                round: 3,
                black: { text: '_ and _.', pick: 2 },
                cards: [
                    { id: 'w2', text: 'Bees' },
                    { id: 'w3', text: 'Honey' },
                ],
                winnerId: 'bo',
            },
        ],
        fever: null,
    },
});

describe('the best-of reel', () => {
    it('starts with the podium and the final scores', () => {
        const screen = gameOverScreen(over, { kind: 'podium', cycle: 0 });
        expect(screen.querySelector('.tv-podium')).not.toBeNull();
        expect(screen.querySelector('.tv-reel')).toBeNull();
    });

    it('then shows each winning combo: the prompt, the winning cards, who won and when', () => {
        resetOnce();
        const slide = gameOverScreen(over, { kind: 'reel', index: 1, cycle: 0 });
        expect(slide.querySelector('.tv-title')?.textContent).toBe('Best of the game');
        expect(slide.querySelector('.card-black')?.textContent).toContain('and');
        expect([...slide.querySelectorAll('.card-white .card-text')].map((n) => n.textContent)).toEqual([
            'Bees',
            'Honey',
        ]);
        expect(slide.querySelector('.tv-reel-winner')?.textContent).toContain('Bo');
        expect(slide.textContent).toContain('Round 3');
        expect(slide.textContent).toContain('2 of 2');
        expect(slide.classList.contains('is-entering')).toBe(true);
        expect(gameOverScreen(over, { kind: 'reel', index: 1, cycle: 0 }).classList.contains('is-entering')).toBe(
            false,
        );
        expect(gameOverScreen(over, { kind: 'reel', index: 1, cycle: 1 }).classList.contains('is-entering')).toBe(true);
    });
});
