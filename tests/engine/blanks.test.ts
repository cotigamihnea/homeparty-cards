import { describe, expect, it } from 'vitest';
import { isBlankId } from '../../src/server/engine/blanks.js';
import { topUpHand } from '../../src/server/engine/deck.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import type { GameState } from '../../src/server/engine/state.js';
import { toHostView, toPlayerView } from '../../src/server/engine/views.js';
import type { BlankAnswer } from '../../src/shared/blanks.js';
import type { Settings } from '../../src/shared/settings.js';
import {
    HOST,
    NETWORK,
    T0,
    TEXTS,
    allWhiteCards,
    expire,
    playRound,
    seat,
    startedGame,
    submitFirst,
    withScores,
} from './helpers.js';

const BLANKS = { blankCards: 2 } satisfies Partial<Settings>;

function answering(settings: Partial<Settings> = BLANKS, seed = 7): GameState {
    return expire(startedGame({ settings, seed }));
}

function blanksOf(state: GameState, playerId: string): string[] {
    return seat(state, playerId).hand.filter(isBlankId);
}

const submit = (playerId: string, cardIds: string[], blanks?: BlankAnswer[]) => ({
    type: 'SUBMIT_CARDS' as const,
    playerId,
    cardIds,
    ...(blanks ? { blanks } : {}),
    now: T0 + 5_000,
});

/** Bogdan (p2) answers with his first blank card, written on. */
function writtenAnswer(state: GameState, text = 'My own words'): GameState {
    const blank = blanksOf(state, 'p2')[0]!;
    return reduce(state, submit('p2', [blank], [{ cardId: blank, text }]));
}

describe('blank cards', () => {
    it('are not dealt while the house rule is off', () => {
        expect(
            answering({})
                .players.flatMap((p) => p.hand)
                .filter(isBlankId),
        ).toEqual([]);
    });

    it('come in each first hand, as part of the hand size, with random ids', () => {
        const state = answering();
        for (const player of state.players) {
            expect(player.hand.filter(isBlankId)).toHaveLength(2);
            expect(player.hand.filter((id) => !isBlankId(id)).length + 2).toBeGreaterThanOrEqual(10);
        }
        const ids = state.players.flatMap((p) => p.hand.filter(isBlankId));
        expect(new Set(ids).size).toBe(8);
        for (const id of ids) expect(id).toMatch(/^blank-[0-9a-z]{8}$/);
        const otherGame = answering(BLANKS, 99).players.flatMap((p) => p.hand.filter(isBlankId));
        expect(otherGame.filter((id) => ids.includes(id))).toEqual([]);
    });

    it("keep their words in the game's best-of after winning, though the card itself is gone", () => {
        const judging = ['p3', 'p4'].reduce((next, id) => submitFirst(next, id), writtenAnswer(answering()));
        const round = judging.round!;
        const bos = round.submissions.find((s) => s.playerId === 'p2')!;
        const won = reduce(judging, {
            type: 'CZAR_PICK',
            playerId: 'p1',
            submissionId: bos.id,
            now: round.revealEndsAt,
        });
        const over = reduce(expire(won), { type: 'END_GAME', by: HOST, now: T0 });
        expect(over.phase).toBe('GAME_OVER');
        expect(over.blankTexts).toEqual({});
        expect(toHostView(over, NETWORK, TEXTS, T0).gameOver?.bestOf[0]?.cards).toEqual([
            { id: bos.cardIds[0], text: 'My own words', blank: true },
        ]);
    });

    it('are dealt once: a played blank is not replaced by another, and a late joiner gets theirs', () => {
        const judging = ['p3', 'p4'].reduce((next, id) => submitFirst(next, id), writtenAnswer(answering()));
        const round = judging.round!;
        const next = expire(
            reduce(judging, {
                type: 'CZAR_PICK',
                playerId: 'p1',
                submissionId: round.submissions[0]!.id,
                now: round.revealEndsAt,
            }),
        );
        expect(next.phase).toBe('ROUND_START');
        expect(blanksOf(next, 'p2')).toHaveLength(1);
        expect(seat(next, 'p2').hand).toHaveLength(10);

        const late = reduce(answering(), { type: 'PLAYER_JOINED', playerId: 'p9', name: 'Late', now: T0 });
        expect(blanksOf(late, 'p9')).toEqual([]);
        expect(blanksOf(expire(playRound(late)), 'p9')).toHaveLength(2);
    });

    it('need something written on them, only on blanks, once each', () => {
        const state = answering();
        const [blank, other] = blanksOf(state, 'p2') as [string, string];
        const normal = seat(state, 'p2').hand.find((id) => !isBlankId(id))!;
        expect(checkAction(state, submit('p2', [blank]))).toBe('BLANK_EMPTY');
        expect(checkAction(state, submit('p2', [blank], [{ cardId: blank, text: '   ' }]))).toBe('BLANK_EMPTY');
        expect(checkAction(state, submit('p2', [blank], [{ cardId: blank, text: 'x'.repeat(81) }]))).toBe(
            'BLANK_TOO_LONG',
        );
        expect(checkAction(state, submit('p2', [normal], [{ cardId: normal, text: 'Hi' }]))).toBe('BAD_REQUEST');
        expect(checkAction(state, submit('p2', [blank], [{ cardId: other, text: 'Hi' }]))).toBe('BAD_REQUEST');
        expect(
            checkAction(
                state,
                submit(
                    'p2',
                    [blank],
                    [
                        { cardId: blank, text: 'Hi' },
                        { cardId: blank, text: 'Ho' },
                    ],
                ),
            ),
        ).toBe('BAD_REQUEST');
        expect(checkAction(state, submit('p2', [blank], [{ cardId: blank, text: 'Hi' }]))).toBeNull();
    });

    it('come last in the hand on the phone, unwritten', () => {
        const hand = toPlayerView(answering(), 'p2', TEXTS, T0)!.hand;
        expect(hand.slice(-2)).toEqual([
            expect.objectContaining({ text: '', blank: true }),
            expect.objectContaining({ text: '', blank: true }),
        ]);
        expect(hand.slice(0, -2).every((card) => !card.blank)).toBe(true);
    });

    it('show what was written: on your phone, then anonymously to the Czar and the TV', () => {
        const sent = writtenAnswer(answering(), '  My   own words ');
        expect(toPlayerView(sent, 'p2', TEXTS, T0)?.mySubmission).toEqual([
            { id: blanksOf(answering(), 'p2')[0], text: 'My own words', blank: true },
        ]);
        const judging = ['p3', 'p4'].reduce((next, id) => submitFirst(next, id), sent);
        const written = { text: 'My own words', blank: true };
        expect(toHostView(judging, NETWORK, TEXTS, T0).judging?.submissions.map((s) => s.cards[0])).toContainEqual(
            expect.objectContaining(written),
        );
        expect(toPlayerView(judging, 'p1', TEXTS, T0)?.judging?.submissions.map((s) => s.cards[0])).toContainEqual(
            expect.objectContaining(written),
        );
    });

    it('come back unwritten when the answer changes or the round is skipped', () => {
        const sent = writtenAnswer(answering());
        const blank = sent.round!.pending[0]!.cardIds[0]!;
        const normal = seat(sent, 'p2').hand.find((id) => !isBlankId(id))!;
        const changed = reduce(sent, submit('p2', [normal]));
        expect(changed.round!.pending[0]!.cardIds).not.toContain(blank);
        expect(seat(changed, 'p2').hand).toContain(blank);
        expect(changed.blankTexts).toEqual({});
        expect(toPlayerView(changed, 'p2', TEXTS, T0)?.hand).toContainEqual({ id: blank, text: '', blank: true });

        const skipped = expire(sent);
        expect(skipped.round?.outcome).toMatchObject({ kind: 'void' });
        expect(seat(skipped, 'p2').hand).toContain(blank);
        expect(skipped.blankTexts).toEqual({});
    });

    it('never reach the discard pile: played, kicked, or trimmed', () => {
        const played = expire(playRound(writtenAnswer(answering())));
        expect(played.phase).toBe('ROUND_START');
        expect(played.whiteDiscard.filter(isBlankId)).toEqual([]);
        expect(played.blankTexts).toEqual({});

        const kicked = reduce(writtenAnswer(answering()), { type: 'KICK_PLAYER', by: HOST, playerId: 'p2', now: T0 });
        expect(kicked.whiteDiscard.filter(isBlankId)).toEqual([]);
        expect(allWhiteCards(kicked).filter(isBlankId)).toHaveLength(6);

        const state = answering();
        const hand = seat(state, 'p2').hand;
        const crowded = {
            ...state,
            players: state.players.map((p) =>
                p.id === 'p2'
                    ? { ...p, hand: [...hand.filter((id) => !isBlankId(id)), 'w398', ...hand.filter(isBlankId)] }
                    : p,
            ),
        };
        const trimmed = topUpHand(crowded, 'p2');
        expect(seat(trimmed, 'p2').hand).toHaveLength(10);
        expect(blanksOf(trimmed, 'p2')).toHaveLength(2);
        expect(trimmed.whiteDiscard.filter(isBlankId)).toEqual([]);
    });

    it('stay in the hand through a reboot, and cannot be confessed', () => {
        const settings = { ...BLANKS, rebootTheUniverse: true, neverHaveIEver: true };
        const state = answering(settings);
        const rich = withScores(state, { p2: 1 });
        const rebooted = reduce(rich, { type: 'REBOOT_HAND', playerId: 'p2', now: T0 });
        expect(blanksOf(rebooted, 'p2')).toEqual(blanksOf(rich, 'p2'));
        expect(seat(rebooted, 'p2').hand).toHaveLength(seat(rich, 'p2').hand.length);
        expect(rebooted.whiteDiscard.filter(isBlankId)).toEqual([]);
        const blank = blanksOf(state, 'p2')[0]!;
        expect(checkAction(state, { type: 'DISCARD_CARD', playerId: 'p2', cardId: blank, now: T0 })).toBe(
            'BAD_REQUEST',
        );
    });
});
