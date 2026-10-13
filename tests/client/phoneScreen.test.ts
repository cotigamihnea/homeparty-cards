import { describe, expect, it } from 'vitest';
import {
    buzzMoment,
    canReboot,
    phoneScreen,
    pruneSelection,
    selectionWith,
    toggleCard,
} from '../../src/client/phone/play.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';
import { player, playerView as view } from './views.js';

describe('toggleCard', () => {
    it('keeps the tap order, which is the answer order', () => {
        expect(toggleCard(['a'], 'b', 2)).toEqual(['a', 'b']);
        expect(toggleCard(['a', 'b'], 'a', 2)).toEqual(['b']);
    });

    it('swaps the card for a Pick 1, and ignores extra taps once a Pick 2 or 3 is full', () => {
        expect(toggleCard(['a'], 'b', 1)).toEqual(['b']);
        expect(toggleCard(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
    });
});

describe('selectionWith', () => {
    it('adds a card to the answer, keeping one already in it where it is', () => {
        expect(selectionWith(['a'], 'b', 2)).toEqual(['a', 'b']);
        expect(selectionWith(['a', 'b'], 'a', 2)).toEqual(['a', 'b']);
        expect(selectionWith(['a'], 'b', 1)).toEqual(['b']);
    });

    it('swaps it in for the last card when the answer is already full, so a written blank always gets played', () => {
        expect(selectionWith(['a', 'b'], 'c', 2)).toEqual(['a', 'c']);
        expect(selectionWith(['a', 'b', 'c'], 'd', 3)).toEqual(['a', 'b', 'd']);
    });
});

describe('pruneSelection', () => {
    it('keeps only the chosen cards this phone still has, in order', () => {
        const current = view({ hand: [{ id: 'w2', text: 'b' }], mySubmission: [{ id: 'w1', text: 'a' }] });
        expect(pruneSelection(['w1', 'gone', 'w2'], current)).toEqual(['w1', 'w2']);
        expect(pruneSelection(['gone'], current)).toEqual([]);
    });
});

describe('phoneScreen', () => {
    it('follows the phase', () => {
        expect(phoneScreen(view({ phase: 'LOBBY', round: null }), false)).toBe('lobby');
        expect(phoneScreen(view({ phase: 'ROUND_START' }), false)).toBe('intro');
        expect(phoneScreen(view({ phase: 'ROUND_RESULT' }), false)).toBe('result');
        expect(phoneScreen(view({ phase: 'GAME_OVER', round: null }), false)).toBe('gameOver');
    });

    it('while answers come in: the Czar waits, a late joiner waits, others answer or see their answer', () => {
        const asCzar = view({ myId: 'czar', canSubmit: false });
        expect(phoneScreen(asCzar, false)).toBe('czarWaiting');
        const late = view({ players: [player('me', { inRound: false }), player('czar')], canSubmit: false });
        expect(phoneScreen(late, false)).toBe('dealtInNext');
        expect(phoneScreen(view({ canSubmit: false }), false)).toBe('sitOut');
        expect(phoneScreen(view({}), false)).toBe('answer');
        const answered = view({ mySubmission: [{ id: 'w1', text: 'x' }] });
        expect(phoneScreen(answered, false)).toBe('answerSent');
        expect(phoneScreen(answered, true)).toBe('answer');
    });

    it('while judging: the Czar judges, everyone else watches', () => {
        expect(phoneScreen(view({ phase: 'JUDGING', myId: 'czar' }), false)).toBe('czarJudging');
        expect(phoneScreen(view({ phase: 'JUDGING' }), false)).toBe('watchJudging');
    });
});

describe('buzzMoment', () => {
    const judging = {
        submissions: [],
        revealStartedAt: 0,
        revealEndsAt: 0,
        revealed: true,
        highlightedId: null,
    };

    it('buzzes the Czar once the answers can be judged', () => {
        expect(buzzMoment(view({ phase: 'JUDGING', myId: 'czar', judging }))).toEqual({
            key: 'judge-1',
            kind: 'yourTurn',
        });
        expect(
            buzzMoment(view({ phase: 'JUDGING', myId: 'czar', judging: { ...judging, revealed: false } })),
        ).toBeNull();
    });

    it('buzzes the round winner, and the game winner', () => {
        const result = { kind: 'winner' as const, winnerId: 'me', submissionId: 's', submissions: [] };
        expect(buzzMoment(view({ phase: 'ROUND_RESULT', result }))).toEqual({ key: 'won-1', kind: 'won' });
        expect(buzzMoment(view({ phase: 'ROUND_RESULT', result: { ...result, winnerId: 'czar' } }))).toBeNull();
        const gameOver = { winnerIds: ['me'], standings: [], bestOf: [], fever: null };
        expect(buzzMoment(view({ phase: 'GAME_OVER', round: null, gameOver }))).toEqual({
            key: 'game-won',
            kind: 'gameWon',
        });
    });

    it('stays still otherwise', () => {
        expect(buzzMoment(view({}))).toBeNull();
    });
});

describe('canReboot', () => {
    const settings = { ...DEFAULT_SETTINGS, rebootTheUniverse: true };
    const players = [player('me', { score: 1 }), player('czar', { isCzar: true })];
    const answering = view({ settings, players });

    it('is on for a player answering this round with a point to spend', () => {
        expect(canReboot(answering)).toBe(true);
    });

    it('is off in sudden death, where the tie is decided by the cards alone', () => {
        expect(canReboot({ ...answering, suddenDeath: { round: 1, contenderIds: ['me', 'czar'] } })).toBe(false);
    });

    it('is off in the Happy Ending, where the winner is already settled', () => {
        expect(canReboot({ ...answering, round: { ...answering.round!, finale: true } })).toBe(false);
    });

    it('is off when the rule is, without a point, when not answering, or once used this round', () => {
        expect(canReboot(view({ players }))).toBe(false);
        expect(canReboot(view({ settings, players: [player('me'), player('czar')] }))).toBe(false);
        expect(canReboot(view({ settings, players, canSubmit: false }))).toBe(false);
        const used = view({
            settings,
            players,
            round: { ...answering.round!, announcements: [{ kind: 'reboot', playerId: 'me', at: 1 }] },
        });
        expect(canReboot(used)).toBe(false);
        const someoneElse = view({
            settings,
            players,
            round: { ...answering.round!, announcements: [{ kind: 'reboot', playerId: 'czar', at: 1 }] },
        });
        expect(canReboot(someoneElse)).toBe(true);
    });
});
