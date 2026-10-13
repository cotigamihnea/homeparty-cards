import { describe, expect, it } from 'vitest';
import type { DealtDeck } from '../../src/server/engine/actions.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import type { GameState } from '../../src/server/engine/state.js';
import type { Settings } from '../../src/shared/settings.js';
import { HOST, T0, expire, makeDeck, playRound, seat, startedGame, withScores } from './helpers.js';

const HAIKU = { id: 'haiku', pick: 3 };
const HAPPY = { happyEnding: true, pointsToWin: 5 } satisfies Partial<Settings>;

function deckWithHaiku(): DealtDeck {
    const deck = makeDeck();
    return { ...deck, black: [...deck.black, HAIKU], haiku: HAIKU };
}

/** Round 1 is answered and judged with Bogdan (p2) one point from the target; then the result runs out. */
function decided(settings: Partial<Settings> = HAPPY): GameState {
    const start = withScores(startedGame({ settings, deck: deckWithHaiku() }), { p2: 4 });
    return expire(playRound(start, 'p2'));
}

describe('Happy Ending', () => {
    it('is not played while the rule is off: the game ends when it is decided, the haiku stays in the deck', () => {
        const off = decided({ pointsToWin: 5 });
        expect(off.phase).toBe('GAME_OVER');
        expect(startedGame({ deck: deckWithHaiku() }).blackDraw.map((card) => card.id)).toContain('haiku');
    });

    it('keeps the haiku card out of the deck, for the end', () => {
        const start = startedGame({ settings: HAPPY, deck: deckWithHaiku() });
        expect([...start.blackDraw, start.round!.black].map((card) => card.id)).not.toContain('haiku');
        expect(start.haiku).toEqual(HAIKU);
    });

    it('plays one more round with “Make a haiku.” once someone reaches the target, with Draw 2', () => {
        const encore = decided();
        expect(encore.phase).toBe('ROUND_START');
        expect(encore.round).toMatchObject({ number: 2, black: HAIKU, finale: true });
        expect(encore.winnerIds).toEqual([]);
        expect(seat(encore, 'p1').hand).toHaveLength(12);
    });

    it('is for glory only: the haiku winner scores nothing, then the game ends with the same winner', () => {
        const judged = playRound(expire(decided()), 'p3');
        expect(judged.phase).toBe('ROUND_RESULT');
        expect(judged.round?.outcome).toMatchObject({ kind: 'winner', winnerId: 'p3' });
        expect(seat(judged, 'p3').score).toBe(0);
        expect(judged.bestOf.at(-1)).toMatchObject({ round: 2, black: HAIKU, winnerId: 'p3' });
        const over = expire(judged);
        expect(over.phase).toBe('GAME_OVER');
        expect(over.winnerIds).toEqual(['p2']);
    });

    it('ends the game even when the haiku round is skipped', () => {
        const skipped = expire(expire(decided()));
        expect(skipped.round?.outcome).toEqual({ kind: 'void', reason: 'TOO_FEW_SUBMISSIONS' });
        expect(expire(skipped).phase).toBe('GAME_OVER');
    });

    it('follows the round limit, after any sudden death', () => {
        const settings = { happyEnding: true, pointsToWin: null, roundLimit: 10 };
        const tenth = (scores: Record<string, number>) => {
            const start = startedGame({ settings, deck: deckWithHaiku() });
            return withScores({ ...start, round: { ...start.round!, number: 10 } }, scores);
        };
        const leader = expire(playRound(tenth({ p2: 3 }), 'p2'));
        expect(leader.round).toMatchObject({ number: 11, finale: true });

        const tie = expire(playRound(tenth({ p2: 3, p3: 4 }), 'p2'));
        expect(tie.round?.finale).toBe(false);
        expect(tie.suddenDeath?.contenderIds).toEqual(['p2', 'p3']);
        const afterSuddenDeath = expire(playRound(tie, 'p3'));
        expect(afterSuddenDeath.round).toMatchObject({ number: 12, finale: true, black: HAIKU });
        expect(afterSuddenDeath.suddenDeath).toBeNull();
    });

    it('keeps the winner settled: no rebooting in the haiku round, and End game ends it at once', () => {
        const encore = expire(decided({ ...HAPPY, rebootTheUniverse: true }));
        expect(encore.phase).toBe('SUBMITTING');
        expect(checkAction(encore, { type: 'REBOOT_HAND', playerId: 'p3', now: T0 })).toBe('WRONG_PHASE');
        const ended = reduce(encore, { type: 'END_GAME', by: HOST, now: T0 });
        expect(ended.phase).toBe('GAME_OVER');
        expect(ended.winnerIds).toEqual(['p2']);
    });
});
