import { describe, expect, it } from 'vitest';
import {
    HELP_AFTER_MS,
    PODIUM_MS,
    REEL_SLIDE_MS,
    gameOverStage,
    gridColumns,
    helpDue,
    nextGameOverChange,
    podium,
    stillThinking,
} from '../../src/client/host/stage.js';
import type { PublicPlayer } from '../../src/shared/views.js';
import { hostView, player } from './views.js';

const round = (answered: number, expected: number) => ({
    number: 2,
    czarId: 'czar',
    black: { text: '_.', pick: 1 },
    answeredCount: answered,
    expectedCount: expected,
    finale: false,
    announcements: [],
});

function submitting(players: PublicPlayer[], answered: number) {
    return hostView({ players, round: round(answered, players.length - 1) });
}

const names = (list: readonly PublicPlayer[] | null) => list?.map((p) => p.name) ?? null;

describe('stillThinking', () => {
    const czar = player('czar', { isCzar: true });

    it('names the last one or two players once someone has answered', () => {
        const players = [czar, player('Ana', { hasSubmitted: true }), player('Bo'), player('Cy')];
        expect(names(stillThinking(submitting(players, 1)))).toEqual(['Bo', 'Cy']);
        const last = [czar, player('Ana', { hasSubmitted: true }), player('Bo', { hasSubmitted: true }), player('Cy')];
        expect(names(stillThinking(submitting(last, 2)))).toEqual(['Cy']);
    });

    it('stays quiet while three or more are thinking, or before anyone has answered', () => {
        const many = [czar, player('Ana', { hasSubmitted: true }), player('Bo'), player('Cy'), player('Di')];
        expect(stillThinking(submitting(many, 1))).toBeNull();
        expect(stillThinking(submitting([czar, player('Ana'), player('Bo')], 0))).toBeNull();
    });

    it('leaves out players who are away, joined late, or sit out sudden death', () => {
        const players = [
            czar,
            player('Ana', { hasSubmitted: true }),
            player('Bo'),
            player('Away', { connected: false }),
            player('Late', { inRound: false }),
            player('Out'),
        ];
        const view = { ...submitting(players, 1), suddenDeath: { round: 1, contenderIds: ['Ana', 'Bo', 'Away'] } };
        expect(names(stillThinking(view))).toEqual(['Bo']);
    });

    it('only nudges while answers are coming in', () => {
        const players = [czar, player('Ana', { hasSubmitted: true }), player('Bo')];
        expect(stillThinking({ ...submitting(players, 1), phase: 'JUDGING' })).toBeNull();
    });
});

describe('podium', () => {
    it('puts the top three ranks on steps; tied players share a step', () => {
        const standings = [
            { playerId: 'a', score: 5, rank: 1 },
            { playerId: 'b', score: 3, rank: 2 },
            { playerId: 'c', score: 3, rank: 2 },
            { playerId: 'd', score: 2, rank: 3 },
            { playerId: 'e', score: 0, rank: 4 },
        ];
        expect(podium(standings)).toEqual([
            { rank: 1, score: 5, playerIds: ['a'] },
            { rank: 2, score: 3, playerIds: ['b', 'c'] },
            { rank: 3, score: 2, playerIds: ['d'] },
        ]);
    });

    it('works with fewer than three ranks', () => {
        const standings = [
            { playerId: 'a', score: 2, rank: 1 },
            { playerId: 'b', score: 2, rank: 1 },
        ];
        expect(podium(standings)).toEqual([{ rank: 1, score: 2, playerIds: ['a', 'b'] }]);
    });
});

describe('gridColumns', () => {
    it('lays the answers out in at most two rows that fit the TV', () => {
        expect([1, 2, 3].map(gridColumns)).toEqual([1, 2, 3]);
        expect(gridColumns(4)).toBe(4);
        expect([5, 6].map(gridColumns)).toEqual([3, 3]);
        expect([7, 8].map(gridColumns)).toEqual([4, 4]);
        expect([9, 10, 11, 12].map(gridColumns)).toEqual([6, 6, 6, 6]);
    });
});

describe('helpDue', () => {
    const lobby = { phase: 'LOBBY' as const, everJoined: false, shown: false, openedAt: 0 };

    it('offers the connection help once, after a minute of an empty lobby', () => {
        expect(HELP_AFTER_MS).toBe(60_000);
        expect(helpDue(lobby, 59_999, HELP_AFTER_MS)).toBe(false);
        expect(helpDue(lobby, 60_000, HELP_AFTER_MS)).toBe(true);
        expect(helpDue({ ...lobby, shown: true }, 90_000, HELP_AFTER_MS)).toBe(false);
    });

    it('never once a phone has joined, or away from the lobby', () => {
        expect(helpDue({ ...lobby, everJoined: true }, 90_000, HELP_AFTER_MS)).toBe(false);
        expect(helpDue({ ...lobby, phase: 'GAME_OVER' }, 90_000, HELP_AFTER_MS)).toBe(false);
        expect(helpDue({ ...lobby, openedAt: null }, 90_000, HELP_AFTER_MS)).toBe(false);
    });
});

describe('gameOverStage', () => {
    it('shows the podium, then each winning combo in turn, then the podium again', () => {
        expect([PODIUM_MS, REEL_SLIDE_MS]).toEqual([10_000, 6_000]);
        expect(gameOverStage(0, 3)).toEqual({ kind: 'podium', cycle: 0 });
        expect(gameOverStage(9_999, 3)).toEqual({ kind: 'podium', cycle: 0 });
        expect(gameOverStage(10_000, 3)).toEqual({ kind: 'reel', index: 0, cycle: 0 });
        expect(gameOverStage(16_000, 3)).toEqual({ kind: 'reel', index: 1, cycle: 0 });
        expect(gameOverStage(27_999, 3)).toEqual({ kind: 'reel', index: 2, cycle: 0 });
        expect(gameOverStage(28_000, 3)).toEqual({ kind: 'podium', cycle: 1 });
        expect(gameOverStage(38_000, 3)).toEqual({ kind: 'reel', index: 0, cycle: 1 });
    });

    it('stays on the podium when no round was won', () => {
        expect(gameOverStage(50_000, 0)).toEqual({ kind: 'podium', cycle: 0 });
        expect(nextGameOverChange(50_000, 0)).toBeNull();
    });

    it('says when the next slide is due', () => {
        expect(nextGameOverChange(0, 2)).toBe(10_000);
        expect(nextGameOverChange(12_500, 2)).toBe(3_500);
        expect(nextGameOverChange(21_000, 2)).toBe(1_000);
    });
});
