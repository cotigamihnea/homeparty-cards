import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/server/engine/reduce.js';
import { createInitialState } from '../../src/server/engine/state.js';
import { toHostView, toPlayerView, type CardLookup } from '../../src/server/engine/views.js';
import type { NetworkView } from '../../src/shared/views.js';
import { HOST, T0, apply, expire, lobbyWith, playRound, seat, startedGame, submitFirst } from './helpers.js';

const network: NetworkView = { joinUrl: 'http://192.168.1.5:4242', qrSvg: '<svg/>', warning: null, host: 'windows' };
const texts: CardLookup = {
    whiteText: (id) => `white ${id}`,
    blackText: (id) => `black ${id} _.`,
    deckSize: (packIds) => ({
        white: packIds.length * 30,
        black: packIds.length * 10,
        custom: packIds.some((id) => id.startsWith('custom-')),
    }),
    catalogVersion: () => 7,
};
const NOW = T0 + 123;

describe('lobby views', () => {
    const lobby = lobbyWith(['Ana', 'Bogdan']);

    it('shows public seat info, settings and the network to the TV', () => {
        const view = toHostView(lobby, network, texts, NOW);
        expect(view).toMatchObject({ phase: 'LOBBY', lang: 'en', serverNow: NOW, phaseEndsAt: null, paused: false });
        expect(view.players[0]).toEqual({
            id: 'p1',
            name: 'Ana',
            avatar: 0,
            score: 0,
            connected: true,
            isVip: true,
            isCzar: false,
            hasSubmitted: false,
            inRound: false,
        });
        expect([view.round, view.judging, view.result, view.gameOver, view.network]).toEqual([
            null,
            null,
            null,
            null,
            network,
        ]);
        expect(view.settings).toEqual(lobby.settings);
    });

    it('tells a seated phone who it is, and nobody else', () => {
        const view = toPlayerView(lobby, 'p2', texts, NOW);
        expect([view?.myId, view?.hand, view?.mySubmission, view?.canSubmit]).toEqual(['p2', [], null, false]);
        expect(toPlayerView(lobby, 'ghost', texts, NOW)).toBeNull();
        expect(toPlayerView(createInitialState(), 'p1', texts, NOW)).toBeNull();
    });
});

describe('the deck the selected packs make', () => {
    it('is counted for the current selection, with no problem when it is big enough', () => {
        const state = reduce(lobbyWith(['Ana', 'Bogdan', 'Cara']), {
            type: 'UPDATE_SETTINGS',
            by: HOST,
            settings: { packIds: ['a', 'b'] },
        });
        const deck = { white: 60, black: 20, problem: null };
        expect(toHostView(state, network, texts, NOW).deck).toEqual(deck);
        expect(toPlayerView(state, 'p2', texts, NOW)?.deck).toEqual(deck);
    });

    it('says what is missing: 20 white cards per player, and 20 black cards', () => {
        const pick = (packIds: string[], names: string[]) =>
            toHostView(
                reduce(lobbyWith(names), { type: 'UPDATE_SETTINGS', by: HOST, settings: { packIds } }),
                network,
                texts,
                NOW,
            ).deck.problem;
        expect(pick(['a', 'b'], ['Ana', 'Bogdan', 'Cara', 'Dan'])).toBe('NOT_ENOUGH_WHITE_CARDS');
        expect(pick(['a'], ['Ana'])).toBe('NOT_ENOUGH_BLACK_CARDS');
        expect(pick([], ['Ana'])).toBe('NOT_ENOUGH_WHITE_CARDS');
        // One custom deck: 30 white for 3 players needs 39; two packs (60 white, 20 black) are enough.
        expect(pick(['custom-1'], ['Ana', 'Bogdan', 'Cara'])).toBe('NOT_ENOUGH_WHITE_CARDS');
        expect(pick(['custom-1', 'b'], ['Ana', 'Bogdan', 'Cara'])).toBeNull();
    });

    it('carries the pack list version, so open pack pickers know when custom decks changed', () => {
        const lobby = lobbyWith(['Ana']);
        expect(toHostView(lobby, network, texts, NOW).catalogVersion).toBe(7);
        expect(toPlayerView(lobby, 'p1', texts, NOW)?.catalogVersion).toBe(7);
    });
});

describe('round views', () => {
    const submitting = submitFirst(expire(startedGame()), 'p2');

    it('shows the black card, the Czar and who has answered (not what)', () => {
        const view = toHostView(submitting, network, texts, NOW);
        expect(view.round).toEqual({
            number: 1,
            czarId: 'p1',
            black: { text: `black ${submitting.round!.black.id} _.`, pick: 1 },
            answeredCount: 1,
            expectedCount: 3,
            finale: false,
            announcements: [],
        });
        expect(view.players.map((p) => [p.id, p.isCzar, p.hasSubmitted, p.inRound])).toEqual([
            ['p1', true, false, true],
            ['p2', false, true, true],
            ['p3', false, false, true],
            ['p4', false, false, true],
        ]);
        expect(view.phaseEndsAt).toBe(submitting.phaseEndsAt);
    });

    it('gives each phone its own hand with text, its answer and whether it can answer', () => {
        const bogdan = toPlayerView(submitting, 'p2', texts, NOW)!;
        expect(bogdan.hand.map((card) => card.id)).toEqual(seat(submitting, 'p2').hand);
        expect(bogdan.hand[0]?.text).toBe(`white ${seat(submitting, 'p2').hand[0]}`);
        expect(bogdan.mySubmission?.map((card) => card.id)).toEqual(submitting.round!.pending[0]!.cardIds);
        expect(bogdan.canSubmit).toBe(true);
        expect(toPlayerView(submitting, 'p1', texts, NOW)?.canSubmit).toBe(false);
    });
});

describe('judging views', () => {
    let judging = expire(startedGame());
    for (const id of ['p2', 'p3', 'p4']) judging = submitFirst(judging, id);
    const round = judging.round!;

    it('shows the TV the anonymous answers in the shuffled order', () => {
        const view = toHostView(judging, network, texts, NOW);
        expect(view.judging?.submissions.map((s) => s.id)).toEqual(round.submissions.map((s) => s.id));
        expect(view.judging?.submissions[0]).toEqual({
            id: round.submissions[0]!.id,
            cards: round.submissions[0]!.cardIds.map((id) => ({ id, text: `white ${id}` })),
        });
        expect(view.judging?.revealEndsAt).toBe(round.revealEndsAt);
    });

    it('shows the same answers to the Czar only; others see just their own answer', () => {
        expect(toPlayerView(judging, 'p1', texts, NOW)?.judging).toEqual(
            toHostView(judging, network, texts, NOW).judging,
        );
        const cara = toPlayerView(judging, 'p3', texts, NOW)!;
        expect(cara.judging).toBeNull();
        expect(cara.mySubmission?.map((c) => c.id)).toEqual(
            round.submissions.find((s) => s.playerId === 'p3')!.cardIds,
        );
    });
});

describe('result and game over views', () => {
    it('reveals every author with the winner', () => {
        const result = playRound(startedGame(), 'p3');
        const view = toHostView(result, network, texts, NOW);
        expect(view.result).toMatchObject({ kind: 'winner', winnerId: 'p3' });
        if (view.result?.kind !== 'winner') throw new Error('expected a winner');
        expect(view.result.submissions.map((s) => s.authorId).sort()).toEqual(['p2', 'p3', 'p4']);
        expect(view.judging).toBeNull();
    });

    it('explains a void round', () => {
        const voided = expire(expire(startedGame()));
        expect(toHostView(voided, network, texts, NOW).result).toEqual({ kind: 'void', reason: 'TOO_FEW_SUBMISSIONS' });
    });

    it('shows winners, standings and the best-of reel at game over', () => {
        const over = reduce(expire(playRound(startedGame(), 'p2')), { type: 'END_GAME', by: HOST, now: T0 });
        const view = toPlayerView(over, 'p4', texts, NOW)!;
        expect(view.gameOver?.winnerIds).toEqual(['p2']);
        expect(view.gameOver?.standings[0]).toEqual({ playerId: 'p2', score: 1, rank: 1 });
        expect(view.gameOver?.bestOf[0]).toMatchObject({ round: 1, winnerId: 'p2' });
        expect(view.gameOver?.bestOf[0]?.cards[0]?.text).toMatch(/^white w\d+$/);
    });

    it('passes pause and sudden-death state through', () => {
        const paused = apply(
            expire(startedGame()),
            { type: 'PLAYER_DISCONNECTED', playerId: 'p4', now: T0 },
            { type: 'PLAYER_DISCONNECTED', playerId: 'p3', now: T0 },
        );
        expect(toHostView(paused, network, texts, NOW)).toMatchObject({ paused: true, phaseEndsAt: null });
        const sudden = { ...startedGame(), suddenDeath: { round: 2, contenderIds: ['p2', 'p3'] } };
        expect(toHostView(sudden, network, texts, NOW).suddenDeath).toEqual({ round: 2, contenderIds: ['p2', 'p3'] });
    });
});
