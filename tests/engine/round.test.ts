import { describe, expect, it } from 'vitest';
import { PICK_3_EXTRA_CARDS, VOID_RESULT_MS } from '../../src/shared/constants.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import { T0, allWhiteCards, apply, expire, makeDeck, seat, startedGame, submitFirst } from './helpers.js';

const submit = (playerId: string, cardIds: string[]) => ({ type: 'SUBMIT_CARDS' as const, playerId, cardIds, now: T0 });

describe('round intro → submitting', () => {
    it('waits for the intro, then opens submissions with the submit timer', () => {
        const state = startedGame();
        expect(reduce(state, { type: 'TICK', now: T0 + 1 }).phase).toBe('ROUND_START');
        const submitting = expire(state);
        expect(submitting.phase).toBe('SUBMITTING');
        expect(submitting.phaseEndsAt).toBe((state.phaseEndsAt ?? 0) + 60_000);
    });

    it('has no submit deadline when the timer is off', () => {
        expect(expire(startedGame({ settings: { submitSeconds: 0 } })).phaseEndsAt).toBeNull();
    });
});

describe('submitting', () => {
    const submitting = expire(startedGame());

    it('refuses the wrong phase, the Czar, unknown seats, wrong counts and cards you do not hold', () => {
        const ana = seat(submitting, 'p1').hand;
        const bogdan = seat(submitting, 'p2').hand;
        expect(checkAction(startedGame(), submit('p2', seat(startedGame(), 'p2').hand.slice(0, 1)))).toBe(
            'WRONG_PHASE',
        );
        expect(checkAction(submitting, submit('p1', ana.slice(0, 1)))).toBe('CZAR_CANNOT_SUBMIT');
        expect(checkAction(submitting, submit('ghost', bogdan.slice(0, 1)))).toBe('UNKNOWN_PLAYER');
        expect(checkAction(submitting, submit('p2', bogdan.slice(0, 2)))).toBe('WRONG_CARD_COUNT');
        expect(checkAction(submitting, submit('p2', []))).toBe('WRONG_CARD_COUNT');
        expect(checkAction(submitting, submit('p2', ana.slice(0, 1)))).toBe('NOT_YOUR_CARDS');
        expect(checkAction(submitting, submit('p2', ['nope']))).toBe('NOT_YOUR_CARDS');
    });

    it('takes the cards out of the hand, and lets the player change their answer', () => {
        const [first, second] = seat(submitting, 'p2').hand;
        const once = reduce(submitting, submit('p2', [first ?? '']));
        expect(seat(once, 'p2').hand).not.toContain(first);
        expect(once.round?.pending).toEqual([{ playerId: 'p2', cardIds: [first] }]);
        const changed = reduce(once, submit('p2', [second ?? '']));
        expect(seat(changed, 'p2').hand).toContain(first);
        expect(seat(changed, 'p2').hand).not.toContain(second);
        expect(changed.round?.pending).toEqual([{ playerId: 'p2', cardIds: [second] }]);
    });

    it('lets a player resubmit a card from their own earlier answer', () => {
        const [first] = seat(submitting, 'p2').hand;
        const once = reduce(submitting, submit('p2', [first ?? '']));
        expect(checkAction(once, submit('p2', [first ?? '']))).toBeNull();
    });

    it('moves to judging as soon as every connected player has answered', () => {
        const state = apply(submitting, { type: 'PLAYER_DISCONNECTED', playerId: 'p4', now: T0 });
        const judging = submitFirst(submitFirst(state, 'p2'), 'p3');
        expect(judging.phase).toBe('JUDGING');
        expect(judging.round?.submissions).toHaveLength(2);
    });

    it('goes to judging when the timer runs out with at least 2 answers', () => {
        const state = expire(submitFirst(submitFirst(submitting, 'p2'), 'p3'));
        expect(state.phase).toBe('JUDGING');
    });

    it('voids the round with fewer than 2 answers: cards go back, the black card goes to the bottom', () => {
        const [card] = seat(submitting, 'p2').hand;
        const black = submitting.round?.black;
        const voided = expire(reduce(submitting, submit('p2', [card ?? ''])));
        expect(voided.phase).toBe('ROUND_RESULT');
        expect(voided.round?.outcome).toEqual({ kind: 'void', reason: 'TOO_FEW_SUBMISSIONS' });
        expect(seat(voided, 'p2').hand).toContain(card);
        expect(voided.blackDraw.at(-1)).toEqual(black);
        expect(voided.phaseEndsAt).toBe((submitting.phaseEndsAt ?? 0) + VOID_RESULT_MS);
        expect(new Set(allWhiteCards(voided)).size).toBe(400);
    });

    it('refuses a player who joined mid-round until they are dealt in', () => {
        const late = reduce(submitting, { type: 'PLAYER_JOINED', playerId: 'p5', name: 'Eve', now: T0 });
        expect(seat(late, 'p5').hand).toEqual([]);
        expect(checkAction(late, submit('p5', []))).toBe('NOT_IN_ROUND');
    });
});

describe('next rounds', () => {
    const finishRound = (state: ReturnType<typeof startedGame>) => expire(expire(expire(state)));

    it('rotates the Czar in join order and tops hands back up', () => {
        const round2 = finishRound(startedGame());
        expect(round2.round).toMatchObject({ number: 2, czarId: 'p2' });
        expect(round2.players.every((p) => p.hand.length === 10)).toBe(true);
        expect(finishRound(round2).round?.czarId).toBe('p3');
    });

    it('skips a disconnected player when choosing the Czar', () => {
        const state = apply(startedGame(), { type: 'PLAYER_DISCONNECTED', playerId: 'p2', now: T0 });
        expect(finishRound(state).round?.czarId).toBe('p3');
    });

    it('deals a mid-game joiner in at the next round and adds them to the end of the rotation', () => {
        let state = reduce(expire(startedGame()), { type: 'PLAYER_JOINED', playerId: 'p5', name: 'Eve', now: T0 });
        state = expire(expire(state));
        expect([seat(state, 'p5').dealtIn, seat(state, 'p5').hand.length, seat(state, 'p5').score]).toEqual([
            true,
            10,
            0,
        ]);
        for (let i = 0; i < 3; i++) state = finishRound(state);
        expect(state.round?.czarId).toBe('p5');
    });
});

describe('Pick 3 ("Draw 2, Pick 3")', () => {
    const pick3 = startedGame({
        deck: makeDeck(
            400,
            Array.from({ length: 30 }, () => 3),
        ),
    });

    it('gives connected non-Czar players 2 extra cards before they choose', () => {
        expect(seat(pick3, 'p1').hand).toHaveLength(10);
        expect(seat(pick3, 'p2').hand).toHaveLength(10 + PICK_3_EXTRA_CARDS);
    });

    it('trims unused extras back to the hand size at the next round start', () => {
        const round2 = expire(expire(expire(pick3)));
        expect(round2.players.filter((p) => p.id !== round2.round?.czarId).every((p) => p.hand.length === 12)).toBe(
            true,
        );
        expect(seat(round2, 'p1').hand).toHaveLength(12);
        expect(seat(round2, 'p2').hand).toHaveLength(10);
        expect(new Set(allWhiteCards(round2)).size).toBe(400);
    });
});

describe('running low on cards', () => {
    it('reshuffles the white discard pile when the draw pile is empty', () => {
        // Pick 3 rounds where nobody answers: 3 players draw 2 extra cards each round and the extras
        // are trimmed into the discard pile, so 10 rounds need 60 draws from a 40-card draw pile.
        let state = startedGame({
            deck: makeDeck(
                80,
                Array.from({ length: 30 }, () => 3),
            ),
        });
        for (let round = 0; round < 10; round++) state = expire(expire(expire(state)));
        expect(state.round?.number).toBe(11);
        expect(state.players.filter((p) => p.id !== state.round?.czarId).every((p) => p.hand.length === 12)).toBe(true);
        expect(allWhiteCards(state)).toHaveLength(80);
        expect(new Set(allWhiteCards(state)).size).toBe(80);
    });

    it('ends the game when no black card is left for the next round', () => {
        const result = expire(expire(startedGame()));
        expect(result.phase).toBe('ROUND_RESULT');
        const noBlackCards = { ...result, blackDraw: [], blackDiscard: [] };
        const over = expire(noBlackCards);
        expect(over.phase).toBe('GAME_OVER');
        expect(over.phaseEndsAt).toBeNull();
    });
});
