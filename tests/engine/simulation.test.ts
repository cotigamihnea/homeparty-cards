import { describe, expect, it } from 'vitest';
import { isBlankId } from '../../src/server/engine/blanks.js';
import { nextDeadline } from '../../src/server/engine/deadline.js';
import { IN_GAME_PHASES, type GameState } from '../../src/server/engine/state.js';
import { PICK_3_EXTRA_CARDS } from '../../src/shared/constants.js';
import { allWhiteCards } from './helpers.js';
import { ALL_HOUSE_RULES, playRandomGame } from './randomGame.js';

function checkInvariants(state: GameState): void {
    const cards = allWhiteCards(state);
    const deckCards = cards.filter((id) => !isBlankId(id));
    expect(deckCards).toHaveLength(400);
    expect(new Set(deckCards).size).toBe(400);
    const blanks = cards.filter(isBlankId);
    expect(new Set(blanks).size, 'a blank card twice').toBe(blanks.length);
    expect([...state.whiteDraw, ...state.whiteDiscard].filter(isBlankId), 'a blank in the deck').toEqual([]);
    const inAnswers = new Set(
        [...(state.round?.pending ?? []), ...(state.round?.submissions ?? [])].flatMap((entry) => entry.cardIds),
    );
    for (const id of Object.keys(state.blankTexts)) expect(inAnswers.has(id), `stale text on ${id}`).toBe(true);
    for (const player of state.players) {
        expect(player.hand.length).toBeLessThanOrEqual(state.settings.handSize + PICK_3_EXTRA_CARDS);
        expect(player.score).toBeGreaterThanOrEqual(0);
    }
    const scored = state.players.reduce((sum, p) => sum + p.score, 0) + (state.rando?.score ?? 0);
    expect(scored).toBeLessThanOrEqual(state.bestOf.length);
    if (IN_GAME_PHASES.includes(state.phase) && !state.paused) {
        expect(nextDeadline(state), `stuck in ${state.phase}`).not.toBeNull();
    }
}

describe('random games', () => {
    it.each(Array.from({ length: 40 }, (_, i) => 100 + i))(
        'seed %i: cards are conserved and nothing gets stuck',
        (seed) => {
            playRandomGame({ seed, steps: 400, chaos: 0.1 }, (state) => checkInvariants(state));
        },
    );

    it.each(Array.from({ length: 30 }, (_, i) => 200 + i))(
        'seed %i with every house rule on: cards are conserved and nothing gets stuck',
        (seed) => {
            playRandomGame({ seed, steps: 400, chaos: 0.1, settings: ALL_HOUSE_RULES }, checkInvariants);
        },
    );

    it.each([9, 10, 11])('seed %i: a calm game with every house rule ends after its Happy Ending', (seed) => {
        let finale = false;
        const end = playRandomGame(
            { seed, steps: 5_000, chaos: 0, settings: { ...ALL_HOUSE_RULES, pointsToWin: 5 } },
            (state) => {
                checkInvariants(state);
                finale ||= state.round?.finale === true;
            },
        );
        expect(end.phase).toBe('GAME_OVER');
        expect(finale).toBe(true);
    });

    it.each([1, 2, 3, 4, 5])('seed %i: a calm game to 5 points always finishes', (seed) => {
        const end = playRandomGame({ seed, steps: 5_000, chaos: 0, settings: { pointsToWin: 5 } }, checkInvariants);
        expect(end.phase).toBe('GAME_OVER');
        expect(end.winnerIds).toHaveLength(1);
    });

    it.each([6, 7, 8])('seed %i: a calm game with a 10-round limit finishes (sudden death included)', (seed) => {
        const end = playRandomGame(
            { seed, steps: 5_000, chaos: 0, settings: { pointsToWin: null, roundLimit: 10 } },
            checkInvariants,
        );
        expect(end.phase).toBe('GAME_OVER');
        expect(end.winnerIds.length).toBeGreaterThanOrEqual(1);
    });
});
