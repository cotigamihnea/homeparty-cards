import { describe, expect, it } from 'vitest';
import { isBlankId } from '../../src/server/engine/blanks.js';
import { reduce } from '../../src/server/engine/reduce.js';
import type { GameState } from '../../src/server/engine/state.js';
import { toHostView, toPlayerView } from '../../src/server/engine/views.js';
import type { Settings } from '../../src/shared/settings.js';
import { NETWORK, T0, TEXTS, expire, makeDeck, seat, startedGame, submitFirst } from './helpers.js';

const AUTO = { autoPlay: true } satisfies Partial<Settings>;

function answering(settings: Partial<Settings> = AUTO, picks?: number[]): GameState {
    return expire(startedGame({ settings, ...(picks ? { deck: makeDeck(400, picks) } : {}) }));
}

function answerOf(state: GameState, playerId: string): string[] | undefined {
    return state.round?.submissions.find((submission) => submission.playerId === playerId)?.cardIds;
}

describe('Auto-play on timeout', () => {
    it('is off by default: players who did not answer in time are skipped', () => {
        const timedOut = expire(submitFirst(submitFirst(answering({}), 'p2'), 'p3'));
        expect(timedOut.phase).toBe('JUDGING');
        expect(answerOf(timedOut, 'p4')).toBeUndefined();
    });

    it('plays random cards from the hand of everyone who has not answered, then judging starts', () => {
        const state = submitFirst(answering(), 'p2');
        const handOf3 = seat(state, 'p3').hand;
        const timedOut = expire(state);
        expect(timedOut.phase).toBe('JUDGING');
        expect(timedOut.round?.submissions).toHaveLength(3);
        const played = answerOf(timedOut, 'p3')!;
        expect(played).toHaveLength(1);
        expect(handOf3).toContain(played[0]);
        expect(seat(timedOut, 'p3').hand).toHaveLength(handOf3.length - 1);
        expect(seat(timedOut, 'p3').hand).not.toContain(played[0]);
    });

    it('plays as many cards as the black card asks for, in a random order', () => {
        const timedOut = expire(
            answering(
                AUTO,
                Array.from({ length: 20 }, () => 3),
            ),
        );
        expect(timedOut.round?.black.pick).toBe(3);
        for (const id of ['p2', 'p3', 'p4']) expect(new Set(answerOf(timedOut, id))).toHaveProperty('size', 3);
    });

    it('never plays a blank card, and skips a hand without enough cards', () => {
        const withBlanks = answering({ ...AUTO, blankCards: 3 });
        const timedOut = expire(withBlanks);
        expect(timedOut.round?.submissions.flatMap((s) => s.cardIds).filter(isBlankId)).toEqual([]);
        const onlyBlanks = {
            ...withBlanks,
            players: withBlanks.players.map((p) => (p.id === 'p4' ? { ...p, hand: p.hand.filter(isBlankId) } : p)),
        };
        expect(answerOf(expire(onlyBlanks), 'p4')).toBeUndefined();
    });

    it('skips a player whose phone is away, as without the rule', () => {
        const away = reduce(answering(), { type: 'PLAYER_DISCONNECTED', playerId: 'p3', now: T0 });
        expect(away.paused).toBe(false);
        const timedOut = expire(away);
        expect(answerOf(timedOut, 'p3')).toBeUndefined();
        expect(answerOf(timedOut, 'p4')).toHaveLength(1);
    });

    it('tells only that player’s phone that a card was played for them', () => {
        const timedOut = expire(submitFirst(answering(), 'p2'));
        expect(toPlayerView(timedOut, 'p3', TEXTS, T0)?.autoPlayed).toBe(true);
        expect(toPlayerView(timedOut, 'p2', TEXTS, T0)?.autoPlayed).toBe(false);
        expect(toPlayerView(timedOut, 'p1', TEXTS, T0)?.autoPlayed).toBe(false);
        expect(JSON.stringify(toHostView(timedOut, NETWORK, TEXTS, T0).judging)).not.toMatch(/auto/i);
        expect(JSON.stringify(toPlayerView(timedOut, 'p1', TEXTS, T0)?.judging)).not.toMatch(/auto/i);
    });
});
