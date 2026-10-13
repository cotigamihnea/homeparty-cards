import type { BlankAnswer } from '../../shared/blanks.js';
import { PICK_3_EXTRA_CARDS } from '../../shared/constants.js';
import type { DealtDeck } from './actions.js';
import { dealBlanks, discardWhite, writeBlanks } from './blanks.js';
import { dealTo, drawBlack, returnToHand, topUpHand } from './deck.js';
import { startJudging } from './judging.js';
import { findPlayer, nextSeatAfter, requireRound, updatePlayer } from './players.js';
import { addRandoAnswer } from './rando.js';
import { shuffle } from './rng.js';
import { finishGame } from './scoring.js';
import type { BlackCardRef, GameState, PlayerState, VoidReason } from './state.js';
import { eligibleSubmitters, isContender, isEligibleSubmitter } from './submitters.js';
import { withPhaseTimer } from './timer.js';

/** New game for the seated players: scores reset, decks shuffled with `seed`, round 1 begins. */
export function startGame(state: GameState, deck: DealtDeck, seed: number, now: number): GameState {
    return beginRound({ ...newGame(state, seed), ...shuffleDeck(state, deck, seed) }, now);
}

/** The dealt deck shuffled with `seed`; with the Happy Ending on, its haiku card is kept out for the end. */
export function shuffleDeck(
    state: GameState,
    deck: DealtDeck,
    seed: number,
): Pick<GameState, 'rng' | 'whiteDraw' | 'blackDraw' | 'haiku'> {
    const haiku = state.settings.happyEnding ? (deck.haiku ?? null) : null;
    const [whiteDraw, afterWhite] = shuffle(deck.white, seed >>> 0);
    const [blackDraw, rng] = shuffle(
        deck.black.filter((card) => card.id !== haiku?.id),
        afterWhite,
    );
    return { rng, whiteDraw, blackDraw, haiku };
}

/** A new game for the seated players: scores and hands reset, nothing dealt yet (the caller fills the decks). */
export function newGame(state: GameState, seed: number): GameState {
    return {
        ...state,
        players: state.players.map((player) => ({ ...player, score: 0, hand: [], dealtIn: false })),
        seed,
        gameNumber: state.gameNumber + 1,
        whiteDraw: [],
        whiteDiscard: [],
        blackDraw: [],
        blackDiscard: [],
        round: null,
        lastCzarSeat: null,
        suddenDeath: null,
        haiku: null,
        blankTexts: {},
        rando: state.settings.randoCardrissian ? { score: 0 } : null,
        bestOf: [],
        winnerIds: [],
        paused: false,
        pausedRemainingMs: null,
        pausedAt: null,
        fever: null,
    };
}

/**
 * Deals in new players (their blank cards first), picks the next Czar, refills hands, draws the black card (Draw 2
 * for Pick 3). The Happy Ending's haiku round is given its card instead.
 */
export function beginRound(state: GameState, now: number, finaleCard?: BlackCardRef): GameState {
    let next = state;
    for (const player of state.players.filter((p) => !p.dealtIn)) next = dealBlanks(next, player.id);
    next = { ...next, players: next.players.map((player) => ({ ...player, dealtIn: true })) };
    const czar = chooseCzar(next);
    if (!czar) return finishGame(next);
    for (const player of next.players) next = topUpHand(next, player.id);
    const [black, afterBlack] = finaleCard ? [finaleCard, next] : drawBlack(next);
    if (!black) return finishGame(next);
    next = afterBlack;
    if (black.pick === 3) {
        for (const player of next.players.filter((p) => isEligibleSubmitter(next, p, czar.id))) {
            next = dealTo(next, player.id, PICK_3_EXTRA_CARDS);
        }
    }
    return {
        ...next,
        phase: 'ROUND_START',
        lastCzarSeat: czar.seat,
        round: {
            number: (state.round?.number ?? 0) + 1,
            czarId: czar.id,
            black,
            pending: [],
            submissions: [],
            judgingStartedAt: 0,
            revealStartedAt: 0,
            revealEndsAt: 0,
            revealed: false,
            highlightedId: null,
            outcome: null,
            finale: finaleCard !== undefined,
            announcements: [],
        },
        phaseEndsAt: now + next.timing.roundIntroMs,
    };
}

/** The next connected seat after the last Czar; in sudden death a non-contender if there is one. */
function chooseCzar(state: GameState): PlayerState | undefined {
    const after = (accept: (player: PlayerState) => boolean) =>
        nextSeatAfter(state.players, state.lastCzarSeat, accept);
    const nonContender = state.suddenDeath ? after((p) => p.connected && !isContender(state, p.id)) : undefined;
    return nonContender ?? after((p) => p.connected);
}

export function startSubmitting(state: GameState, now: number): GameState {
    const answerMs = state.settings.submitSeconds * state.timing.secondMs;
    return progressSubmitting(
        { ...replaceAbsentCzar(state), phase: 'SUBMITTING', phaseEndsAt: answerMs > 0 ? now + answerMs : null },
        now,
    );
}

/** GAME_DESIGN §7: a Czar who is away when the round starts is skipped for the next connected seat. */
function replaceAbsentCzar(state: GameState): GameState {
    const round = requireRound(state);
    if (findPlayer(state, round.czarId)?.connected) return state;
    const czar = chooseCzar(state);
    return czar ? { ...state, lastCzarSeat: czar.seat, round: { ...round, czarId: czar.id } } : state;
}

/** A (re)submission: earlier cards go back to the hand, the new ones leave it, and blanks get what was written. */
export function submitCards(
    state: GameState,
    playerId: string,
    cardIds: readonly string[],
    blanks: readonly BlankAnswer[],
    now: number,
): GameState {
    const round = requireRound(state);
    const previous = round.pending.find((entry) => entry.playerId === playerId);
    let next = previous ? returnToHand(state, playerId, previous.cardIds) : state;
    next = updatePlayer(next, playerId, (player) => ({
        ...player,
        hand: player.hand.filter((id) => !cardIds.includes(id)),
    }));
    const pending = [
        ...round.pending.filter((entry) => entry.playerId !== playerId),
        { playerId, cardIds: [...cardIds] },
    ];
    return progressSubmitting({ ...writeBlanks(next, blanks), round: { ...round, pending } }, now);
}

/** Moves on once every eligible connected player has answered (never while paused). */
export function progressSubmitting(state: GameState, now: number): GameState {
    if (state.phase !== 'SUBMITTING' || state.paused || !state.round) return state;
    const answered = new Set(state.round.pending.map((entry) => entry.playerId));
    return eligibleSubmitters(state).every((player) => answered.has(player.id)) ? finishSubmitting(state, now) : state;
}

/** The answers are in (Rando Cardrissian's last): two or more are judged, fewer skip the round. */
export function finishSubmitting(state: GameState, now: number): GameState {
    const answered = addRandoAnswer(state);
    return requireRound(answered).pending.length >= 2
        ? startJudging(answered, now)
        : voidRound(answered, 'TOO_FEW_SUBMISSIONS', now);
}

/** Cards go back to their authors (a kicked author's and Rando's are discarded), the black card to the bottom of the deck; a short "round skipped" result follows. */
export function voidRound(state: GameState, reason: VoidReason, now: number): GameState {
    const round = requireRound(state);
    let next = state;
    for (const entry of [...round.pending, ...round.submissions]) {
        next = findPlayer(next, entry.playerId)
            ? returnToHand(next, entry.playerId, entry.cardIds)
            : discardWhite(next, entry.cardIds); // kicked, or Rando
    }
    return withPhaseTimer(
        {
            ...next,
            phase: 'ROUND_RESULT',
            blackDraw: [...next.blackDraw, round.black],
            round: { ...round, pending: [], submissions: [], outcome: { kind: 'void', reason } },
        },
        state.timing.voidResultMs,
        now,
    );
}
