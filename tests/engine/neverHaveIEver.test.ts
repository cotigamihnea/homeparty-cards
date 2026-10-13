import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import type { GameState } from '../../src/server/engine/state.js';
import { toHostView, toPlayerView } from '../../src/server/engine/views.js';
import type { Settings } from '../../src/shared/settings.js';
import { NETWORK, T0, TEXTS, allWhiteCards, expire, seat, startedGame, submitFirst } from './helpers.js';

const NEVER = { neverHaveIEver: true } satisfies Partial<Settings>;

function answering(settings: Partial<Settings> = NEVER): GameState {
    return expire(startedGame({ settings }));
}

const confess = (playerId: string, cardId: string, now = T0 + 9_000) => ({
    type: 'DISCARD_CARD' as const,
    playerId,
    cardId,
    now,
});

describe('Never Have I Ever', () => {
    it('is refused while the house rule is off', () => {
        const state = answering({});
        expect(checkAction(state, confess('p2', seat(state, 'p2').hand[0]!))).toBe('RULE_OFF');
    });

    it('is for a card in your own hand, while answering, once a round', () => {
        const state = answering();
        const card = seat(state, 'p2').hand[0]!;
        expect(checkAction(startedGame({ settings: NEVER }), confess('p2', card))).toBe('WRONG_PHASE');
        expect(checkAction(state, confess('p1', seat(state, 'p1').hand[0]!))).toBe('CZAR_CANNOT_SUBMIT');
        expect(checkAction(state, confess('p2', seat(state, 'p3').hand[0]!))).toBe('NOT_YOUR_CARDS');
        const sent = submitFirst(state, 'p2');
        expect(checkAction(sent, confess('p2', card))).toBe('NOT_YOUR_CARDS');
        const once = reduce(state, confess('p2', card));
        expect(checkAction(once, confess('p2', seat(once, 'p2').hand[1]!))).toBe('ALREADY_USED');
        expect(checkAction(once, confess('p3', seat(once, 'p3').hand[0]!))).toBeNull();
    });

    it('swaps the card for a new one in the same place and discards it', () => {
        const before = answering();
        const hand = seat(before, 'p2').hand;
        const after = reduce(before, confess('p2', hand[3]!));
        const newHand = seat(after, 'p2').hand;
        expect(newHand).toHaveLength(hand.length);
        expect(newHand.filter((id, i) => id !== hand[i])).toHaveLength(1);
        expect(newHand).not.toContain(hand[3]);
        expect(after.whiteDiscard.at(-1)).toBe(hand[3]);
        expect(new Set(allWhiteCards(after)).size).toBe(allWhiteCards(after).length);
    });

    it('never hands the confessed card straight back, even from an empty deck', () => {
        const before = answering();
        const card = seat(before, 'p2').hand[0]!;
        const empty = { ...before, whiteDraw: [], whiteDiscard: ['spare'] };
        const after = reduce(empty, confess('p2', card));
        expect(seat(after, 'p2').hand).toContain('spare');
        expect(after.whiteDiscard).toEqual([card]);
    });

    it('shows everyone the card and who confessed, by its text', () => {
        const before = answering();
        const card = seat(before, 'p2').hand[0]!;
        const after = reduce(before, confess('p2', card, T0 + 9_500));
        const announcement = { kind: 'confession', playerId: 'p2', text: `text of ${card}`, at: T0 + 9_500 };
        expect(toHostView(after, NETWORK, TEXTS, T0).round?.announcements).toEqual([announcement]);
        expect(toPlayerView(after, 'p3', TEXTS, T0)?.round?.announcements).toEqual([announcement]);
    });
});
