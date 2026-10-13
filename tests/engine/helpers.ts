import type { Action, Actor } from '../../src/server/engine/actions.js';
import { isBlankId } from '../../src/server/engine/blanks.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { createInitialState, type GameState, type PlayerState } from '../../src/server/engine/state.js';
import type { CardLookup } from '../../src/server/engine/views.js';
import type { NetworkView } from '../../src/shared/views.js';

export const T0 = 1_000_000;
export const HOST: Actor = { kind: 'host' };
export const as = (playerId: string): Actor => ({ kind: 'player', playerId });

/** Card texts for the views: a white card reads "text of <id>", a black card its id. */
export const TEXTS: CardLookup = {
    whiteText: (id) => `text of ${id}`,
    blackText: (id) => id,
    deckSize: () => ({ white: 400, black: 40 }),
    catalogVersion: () => 0,
};
export const NETWORK: NetworkView = {
    joinUrl: 'http://10.0.0.2:4242',
    qrSvg: '<svg/>',
    warning: null,
    host: 'windows',
};

export function apply(state: GameState, ...actions: Action[]): GameState {
    return actions.reduce(reduce, state);
}

/** p1, p2, … join in order at T0. */
export function lobbyWith(names: readonly string[], base: GameState = createInitialState()): GameState {
    return names.reduce(
        (state, name, i) => reduce(state, { type: 'PLAYER_JOINED', playerId: `p${i + 1}`, name, now: T0 }),
        base,
    );
}

export function seat(state: GameState, playerId: string): PlayerState {
    const found = state.players.find((player) => player.id === playerId);
    if (!found) throw new Error(`no seat ${playerId}`);
    return found;
}

/** The same state with these players' scores set (the others keep theirs). */
export function withScores(state: GameState, scores: Record<string, number>): GameState {
    return { ...state, players: state.players.map((p) => ({ ...p, score: scores[p.id] ?? p.score })) };
}

export function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}

import type { DealtDeck } from '../../src/server/engine/actions.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings.js';
import { DEFAULT_TIMING, type Timing } from '../../src/shared/constants.js';

/** w0…w(n-1) white cards and one black card per entry of `picks`. */
export function makeDeck(whiteCount = 400, picks: readonly number[] = Array.from({ length: 40 }, () => 1)): DealtDeck {
    return {
        white: Array.from({ length: whiteCount }, (_, i) => `w${i}`),
        black: picks.map((pick, i) => ({ id: `b${i}`, pick })),
    };
}

export interface GameOptions {
    names?: readonly string[];
    settings?: Partial<Settings>;
    deck?: DealtDeck;
    seed?: number;
    timing?: Timing;
}

/** A game that has just started (ROUND_START of round 1) at T0. */
export function startedGame(options: GameOptions = {}): GameState {
    let state = lobbyWith(
        options.names ?? ['Ana', 'Bogdan', 'Cara', 'Dan'],
        createInitialState(DEFAULT_SETTINGS, options.timing ?? DEFAULT_TIMING),
    );
    if (options.settings) state = reduce(state, { type: 'UPDATE_SETTINGS', by: HOST, settings: options.settings });
    return reduce(state, {
        type: 'START_GAME',
        by: HOST,
        deck: options.deck ?? makeDeck(),
        seed: options.seed ?? 7,
        now: T0,
    });
}

/** Ticks exactly at the current phase deadline. */
export function expire(state: GameState): GameState {
    if (state.phaseEndsAt === null) throw new Error(`no timer in ${state.phase}`);
    return reduce(state, { type: 'TICK', now: state.phaseEndsAt });
}

/** The given player submits the first `pick` cards of their hand (blank cards, which need writing, left out). */
export function submitFirst(state: GameState, playerId: string, now = T0): GameState {
    const pick = state.round?.black.pick ?? 1;
    const cards = seat(state, playerId).hand.filter((id) => !isBlankId(id));
    return reduce(state, { type: 'SUBMIT_CARDS', playerId, cardIds: cards.slice(0, pick), now });
}

export function allWhiteCards(state: GameState): string[] {
    return [
        ...state.whiteDraw,
        ...state.whiteDiscard,
        ...state.players.flatMap((player) => player.hand),
        ...(state.round?.pending.flatMap((entry) => entry.cardIds) ?? []),
        ...(state.round?.submissions.flatMap((entry) => entry.cardIds) ?? []),
    ];
}

import { eligibleSubmitters } from '../../src/server/engine/submitters.js';

/** From ROUND_START or SUBMITTING: everyone eligible answers, then the Czar picks `winnerId` (default: first). */
export function playRound(state: GameState, winnerId?: string): GameState {
    let next = state.phase === 'ROUND_START' ? expire(state) : state;
    for (const player of eligibleSubmitters(next)) next = submitFirst(next, player.id);
    const round = next.round;
    if (next.phase !== 'JUDGING' || !round) return next;
    const target = winnerId ? round.submissions.find((s) => s.playerId === winnerId) : round.submissions[0];
    if (!target) throw new Error(`${winnerId ?? 'nobody'} did not answer`);
    return reduce(next, {
        type: 'CZAR_PICK',
        playerId: round.czarId,
        submissionId: target.id,
        now: round.revealEndsAt ?? 0,
    });
}

/** Plays rounds where `winnerId` wins whenever they answer, until the phase is GAME_OVER or `rounds` are done. */
export function playRounds(state: GameState, rounds: number, winnerId?: string): GameState {
    let next = state;
    for (let i = 0; i < rounds && next.phase !== 'GAME_OVER'; i++) {
        const canWin = winnerId && eligibleSubmitters(expire(next)).some((p) => p.id === winnerId);
        next = expire(playRound(next, canWin ? winnerId : undefined));
    }
    return next;
}
