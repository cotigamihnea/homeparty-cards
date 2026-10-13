import { describe, expect, it } from 'vitest';
import { nextDeadline } from '../../src/server/engine/deadline.js';
import { reduce } from '../../src/server/engine/reduce.js';
import type { GameState } from '../../src/server/engine/state.js';
import { toHostView, toPlayerView } from '../../src/server/engine/views.js';
import { NETWORK, T0, expire, startedGame, submitFirst } from './helpers.js';

const CARDS = {
    whiteText: (id: string) => id,
    blackText: () => '_.',
    deckSize: () => ({ white: 500, black: 50 }),
    catalogVersion: () => 0,
};

function judging(): GameState {
    let state = expire(startedGame());
    for (const id of ['p2', 'p3', 'p4']) state = submitFirst(state, id);
    return state;
}

const tick = (now: number) => ({ type: 'TICK' as const, now });

describe('the end of the reveal is decided by the server', () => {
    it('is the next deadline while the answers are being read out, then the judging timer is', () => {
        const state = judging();
        expect(nextDeadline(state)).toBe(state.round!.revealEndsAt);
        const revealed = reduce(state, tick(state.round!.revealEndsAt));
        expect(nextDeadline(revealed)).toBe(revealed.phaseEndsAt);
    });

    it('a tick at the end of the reveal marks the answers as revealed; an early tick changes nothing', () => {
        const state = judging();
        expect(state.round!.revealed).toBe(false);
        expect(reduce(state, tick(state.round!.revealEndsAt - 1))).toBe(state);
        expect(reduce(state, tick(state.round!.revealEndsAt)).round!.revealed).toBe(true);
    });

    it('the TV and the Czar’s phone are told, so neither needs its own clock to know', () => {
        const state = judging();
        const czarId = state.round!.czarId;
        const now = state.round!.revealEndsAt;
        expect(toHostView(state, NETWORK, CARDS, now).judging?.revealed).toBe(false);
        expect(toPlayerView(state, czarId, CARDS, now)?.judging?.revealed).toBe(false);
        const revealed = reduce(state, tick(now));
        expect(toHostView(revealed, NETWORK, CARDS, now).judging?.revealed).toBe(true);
        expect(toPlayerView(revealed, czarId, CARDS, now)?.judging?.revealed).toBe(true);
    });

    it('once the answers are revealed the Czar can pick, even if the wall clock has stepped back since', () => {
        const state = reduce(judging(), tick(judging().round!.revealEndsAt));
        const round = state.round!;
        const picked = reduce(state, {
            type: 'CZAR_PICK',
            playerId: round.czarId,
            submissionId: round.submissions[0]!.id,
            now: round.revealEndsAt - 5,
        });
        expect(picked.phase).toBe('ROUND_RESULT');
    });

    it('waits while the game is paused', () => {
        let state = judging();
        state = reduce(state, { type: 'PLAYER_DISCONNECTED', playerId: 'p3', now: T0 });
        state = reduce(state, { type: 'PLAYER_DISCONNECTED', playerId: 'p4', now: T0 });
        expect(state.paused).toBe(true);
        expect(reduce(state, tick(state.round!.revealEndsAt)).round!.revealed).toBe(false);
    });
});

describe('a pause during the reveal', () => {
    const away = (playerId: string, now: number) => ({ type: 'PLAYER_DISCONNECTED' as const, playerId, now });
    const back = (playerId: string, now: number) => ({ type: 'PLAYER_RECONNECTED' as const, playerId, now });

    it('the views say when the reveal started', () => {
        const state = judging();
        const view = toHostView(state, NETWORK, CARDS, T0);
        expect(view.judging?.revealStartedAt).toBe(state.round!.judgingStartedAt);
        expect(view.judging?.revealEndsAt).toBe(state.round!.revealEndsAt);
    });

    it('resumes the reveal where it stopped instead of skipping the rest', () => {
        const start = judging();
        const { revealStartedAt, revealEndsAt } = start.round!;
        const pausedAt = revealStartedAt + 2500;
        const paused = reduce(reduce(start, away('p3', pausedAt)), away('p4', pausedAt));
        expect(paused.paused).toBe(true);
        const resumed = reduce(paused, back('p3', pausedAt + 10_000));
        expect(resumed.paused).toBe(false);
        expect(resumed.round!.revealStartedAt).toBe(revealStartedAt + 10_000);
        expect(resumed.round!.revealEndsAt).toBe(revealEndsAt + 10_000);
        expect(resumed.round!.revealed).toBe(false);
        expect(nextDeadline(resumed)).toBe(revealEndsAt + 10_000);
    });

    it('the views say since when the game is paused, so the TV can hold the reveal still', () => {
        const start = judging();
        const pausedAt = start.round!.revealStartedAt + 1000;
        const paused = reduce(reduce(start, away('p3', pausedAt)), away('p4', pausedAt));
        expect(toHostView(paused, NETWORK, CARDS, pausedAt + 5).pausedAt).toBe(pausedAt);
        expect(toPlayerView(paused, 'p2', CARDS, pausedAt + 5)?.pausedAt).toBe(pausedAt);
        const resumed = reduce(paused, back('p3', pausedAt + 3000));
        expect(toHostView(resumed, NETWORK, CARDS, pausedAt + 3000).pausedAt).toBeNull();
    });

    it('a pause after the reveal leaves the reveal times alone', () => {
        const revealed = reduce(judging(), tick(judging().round!.revealEndsAt));
        const at = revealed.round!.revealEndsAt + 100;
        const paused = reduce(reduce(revealed, away('p3', at)), away('p4', at));
        const resumed = reduce(paused, back('p3', at + 10_000));
        expect(resumed.round!.revealEndsAt).toBe(revealed.round!.revealEndsAt);
        expect(resumed.round!.revealStartedAt).toBe(revealed.round!.revealStartedAt);
    });
});
