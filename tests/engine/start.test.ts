import { describe, expect, it } from 'vitest';
import { ROUND_INTRO_MS } from '../../src/shared/constants.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import { toHostView } from '../../src/server/engine/views.js';
import {
    HOST,
    NETWORK,
    T0,
    TEXTS,
    allWhiteCards,
    apply,
    as,
    lobbyWith,
    makeDeck,
    seat,
    startedGame,
} from './helpers.js';

const start = (deck = makeDeck(), by = HOST) => ({ type: 'START_GAME' as const, by, deck, seed: 7, now: T0 });

describe('starting a game', () => {
    it('needs the VIP or the host, the lobby, 3 connected players and enough cards', () => {
        const three = lobbyWith(['Ana', 'Bogdan', 'Cara']);
        expect(checkAction(three, start(makeDeck(), as('p2')))).toBe('NOT_VIP');
        expect(checkAction(lobbyWith(['Ana', 'Bogdan']), start())).toBe('NOT_ENOUGH_PLAYERS');
        const oneAway = apply(three, { type: 'PLAYER_DISCONNECTED', playerId: 'p3', now: T0 });
        expect(checkAction(oneAway, start())).toBe('NOT_ENOUGH_PLAYERS');
        expect(checkAction(three, start(makeDeck(59)))).toBe('NOT_ENOUGH_WHITE_CARDS');
        expect(
            checkAction(
                three,
                start(
                    makeDeck(
                        60,
                        Array.from({ length: 19 }, () => 1),
                    ),
                ),
            ),
        ).toBe('NOT_ENOUGH_BLACK_CARDS');
        expect(
            checkAction(
                three,
                start(
                    makeDeck(
                        60,
                        Array.from({ length: 20 }, () => 1),
                    ),
                ),
            ),
        ).toBeNull();
        expect(checkAction(startedGame(), start())).toBe('WRONG_PHASE');
    });

    it('with a custom deck selected, a hand plus 3 white cards per player and 10 black cards are enough', () => {
        const three = lobbyWith(['Ana', 'Bogdan', 'Cara']);
        const tenBlack = Array.from({ length: 10 }, () => 1);
        expect(checkAction(three, start({ ...makeDeck(39, tenBlack), custom: true }))).toBeNull();
        expect(checkAction(three, start({ ...makeDeck(38, tenBlack), custom: true }))).toBe('NOT_ENOUGH_WHITE_CARDS');
        expect(checkAction(three, start(makeDeck(39, tenBlack)))).toBe('NOT_ENOUGH_WHITE_CARDS');
    });

    it('deals every seat a full hand, starts round 1 with the first seat as Czar and shows the intro', () => {
        const state = startedGame();
        expect(state.phase).toBe('ROUND_START');
        expect(state.round).toMatchObject({ number: 1, czarId: 'p1' });
        expect(state.phaseEndsAt).toBe(T0 + ROUND_INTRO_MS);
        expect(state.players.every((p) => p.hand.length === 10 && p.dealtIn && p.score === 0)).toBe(true);
        expect(state.whiteDraw).toHaveLength(400 - 40);
        expect(state.blackDraw).toHaveLength(39);
        expect(state.seed).toBe(7);
    });

    it('never deals the same card twice and loses no card', () => {
        const cards = allWhiteCards(startedGame());
        expect(new Set(cards).size).toBe(cards.length);
        expect(cards).toHaveLength(400);
    });

    it('is deterministic for a seed and different for another seed', () => {
        expect(seat(startedGame({ seed: 1 }), 'p2').hand).toEqual(seat(startedGame({ seed: 1 }), 'p2').hand);
        expect(seat(startedGame({ seed: 1 }), 'p2').hand).not.toEqual(seat(startedGame({ seed: 2 }), 'p2').hand);
    });

    it('uses the hand size setting', () => {
        expect(seat(startedGame({ settings: { handSize: 7 } }), 'p1').hand).toHaveLength(7);
    });

    it('deals a disconnected seat in too, but never makes them Czar', () => {
        const lobby = apply(lobbyWith(['Ana', 'Bogdan', 'Cara', 'Dan']), {
            type: 'PLAYER_DISCONNECTED',
            playerId: 'p1',
            now: T0,
        });
        const state = reduce(lobby, start());
        expect(seat(state, 'p1').hand).toHaveLength(10);
        expect(state.round?.czarId).toBe('p2');
    });

    it('numbers the games, so the screens can tell a new game from the last one', () => {
        const first = startedGame();
        expect(first.gameNumber).toBe(1);
        expect(toHostView(first, NETWORK, TEXTS, T0).game).toBe(1);
        const over = reduce(first, { type: 'END_GAME', by: HOST, now: T0 });
        const again = reduce(over, { type: 'PLAY_AGAIN', by: HOST, deck: makeDeck(), seed: 3, now: T0 });
        expect(again.gameNumber).toBe(2);
        const lobby = reduce(reduce(again, { type: 'END_GAME', by: HOST, now: T0 }), {
            type: 'BACK_TO_LOBBY',
            by: HOST,
        });
        expect(toHostView(lobby, NETWORK, TEXTS, T0).game).toBe(2);
    });
});
