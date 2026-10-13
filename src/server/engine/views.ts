import type {
    BlackCardView,
    CommonView,
    DeckSummary,
    GameOverView,
    HostView,
    JudgingView,
    NetworkView,
    PlayerView,
    PublicPlayer,
    RoundResultView,
    RoundView,
    WhiteCardView,
} from '../../shared/views.js';
import { deckProblem, type DeckCounts } from '../../shared/deckRules.js';
import { isBlankId } from './blanks.js';
import { findPlayer } from './players.js';
import { standings } from './scoring.js';
import { IN_GAME_PHASES, type BlackCardRef, type GameState, type PendingSubmission } from './state.js';
import { eligibleSubmitters, isEligibleSubmitter } from './submitters.js';
import { feverOverView, myWrittenView, writingView } from './writing.js';

/** Card lookups; the views are the only place where ids turn into text. */
export interface CardLookup {
    whiteText(id: string): string;
    blackText(id: string): string;
    /** How many unique cards the given packs hold together, and whether a custom deck is among them. */
    deckSize(packIds: readonly string[]): DeckCounts;
    /** Goes up whenever the laptop's custom decks change (the pack list is then new). */
    catalogVersion(): number;
}

/** The TV: public information only. No hands; answers are anonymous until the result. */
export function toHostView(state: GameState, network: NetworkView, library: CardLookup, now: number): HostView {
    const cards = withWrittenCards(state, library);
    return { ...commonView(state, cards, now), judging: judgingView(state, cards), network };
}

/** Custom Fever's written cards are in the state, not the library: their texts are looked up there first. */
function withWrittenCards(state: GameState, library: CardLookup): CardLookup {
    const written = state.fever?.cards;
    if (!written) return library;
    return {
        ...library,
        whiteText: (id) => written[id]?.text ?? library.whiteText(id),
        blackText: (id) => written[id]?.text ?? library.blackText(id),
    };
}

/** One phone: public information plus its own hand and answer; the answers to judge only for the Czar. */
export function toPlayerView(state: GameState, playerId: string, library: CardLookup, now: number): PlayerView | null {
    const player = findPlayer(state, playerId);
    if (!player) return null;
    const cards = withWrittenCards(state, library);
    const round = state.round;
    const isCzar = IN_GAME_PHASES.includes(state.phase) && round?.czarId === playerId;
    const answer = ownAnswer(state, playerId);
    return {
        ...commonView(state, cards, now),
        judging: isCzar ? judgingView(state, cards) : null,
        myId: playerId,
        hand: handCards(state, player.hand, cards),
        mySubmission: answer ? whiteCards(state, answer.cardIds, cards) : null,
        autoPlayed: answer?.auto === true,
        canSubmit: state.phase === 'SUBMITTING' && !!round && isEligibleSubmitter(state, player, round.czarId),
        myWritten: myWrittenView(state, playerId),
    };
}

/** The phone's own answer: still pending while submitting, then its shuffled submission. */
function ownAnswer(state: GameState, playerId: string): PendingSubmission | undefined {
    const isOwn = (entry: { playerId: string }) => entry.playerId === playerId;
    switch (state.phase) {
        case 'SUBMITTING':
            return state.round?.pending.find(isOwn);
        case 'JUDGING':
        case 'ROUND_RESULT':
            return state.round?.submissions.find(isOwn);
        default:
            return undefined;
    }
}

function commonView(state: GameState, cards: CardLookup, now: number): Omit<CommonView, 'judging'> {
    return {
        game: state.gameNumber,
        phase: state.phase,
        lang: state.settings.language,
        settings: state.settings,
        deck: deckSummary(state, cards),
        catalogVersion: cards.catalogVersion(),
        players: publicPlayers(state),
        serverNow: now,
        phaseEndsAt: state.phaseEndsAt,
        paused: state.paused,
        pausedAt: state.paused ? state.pausedAt : null,
        round: roundView(state, cards),
        suddenDeath: state.suddenDeath,
        rando: state.rando && { score: state.rando.score },
        result: resultView(state, cards),
        gameOver: gameOverView(state, cards),
        writing: writingView(state),
    };
}

function deckSummary(state: GameState, cards: CardLookup): DeckSummary {
    const size = cards.deckSize(state.settings.packIds);
    return {
        white: size.white,
        black: size.black,
        problem: deckProblem(size, state.players.length, state.settings.handSize, state.settings.gameMode),
    };
}

function publicPlayers(state: GameState): PublicPlayer[] {
    const czarId = IN_GAME_PHASES.includes(state.phase) ? state.round?.czarId : undefined;
    const answered = new Set(state.phase === 'SUBMITTING' ? state.round?.pending.map((entry) => entry.playerId) : []);
    return state.players.map((player) => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        score: player.score,
        connected: player.connected,
        isVip: player.id === state.vipId,
        isCzar: player.id === czarId,
        hasSubmitted: answered.has(player.id),
        inRound: player.dealtIn,
    }));
}

function roundView(state: GameState, cards: CardLookup): RoundView | null {
    const round = state.round;
    if (!round || !IN_GAME_PHASES.includes(state.phase)) return null;
    const collecting = state.phase === 'ROUND_START' || state.phase === 'SUBMITTING';
    const answered = collecting ? round.pending.length : round.submissions.length;
    const expected = collecting
        ? new Set([...eligibleSubmitters(state).map((p) => p.id), ...round.pending.map((e) => e.playerId)]).size
        : answered;
    return {
        number: round.number,
        czarId: round.czarId,
        black: blackCard(round.black, cards),
        answeredCount: answered,
        expectedCount: expected,
        finale: round.finale,
        announcements: round.announcements.map((entry) =>
            entry.kind === 'confession'
                ? { kind: entry.kind, playerId: entry.playerId, text: cards.whiteText(entry.cardId), at: entry.at }
                : { ...entry },
        ),
    };
}

function judgingView(state: GameState, cards: CardLookup): JudgingView | null {
    const round = state.round;
    if (state.phase !== 'JUDGING' || !round) return null;
    return {
        submissions: round.submissions.map((entry) => ({
            id: entry.id,
            cards: whiteCards(state, entry.cardIds, cards),
        })),
        revealStartedAt: round.revealStartedAt,
        revealEndsAt: round.revealEndsAt,
        revealed: round.revealed,
        highlightedId: round.highlightedId,
    };
}

function resultView(state: GameState, cards: CardLookup): RoundResultView | null {
    const round = state.round;
    const outcome = round?.outcome;
    if (state.phase !== 'ROUND_RESULT' || !round || !outcome) return null;
    if (outcome.kind === 'void') return { kind: 'void', reason: outcome.reason };
    return {
        kind: 'winner',
        winnerId: outcome.winnerId,
        submissionId: outcome.submissionId,
        submissions: round.submissions.map((entry) => ({
            id: entry.id,
            cards: whiteCards(state, entry.cardIds, cards),
            authorId: entry.playerId,
        })),
    };
}

function gameOverView(state: GameState, cards: CardLookup): GameOverView | null {
    if (state.phase !== 'GAME_OVER') return null;
    return {
        winnerIds: state.winnerIds,
        standings: standings(state),
        bestOf: state.bestOf.map((entry) => ({
            round: entry.round,
            black: blackCard(entry.black, cards),
            cards: whiteCards(state, entry.cardIds, cards, entry.written),
            winnerId: entry.winnerId,
        })),
        fever: feverOverView(state.fever),
    };
}

/** Card texts by id; a blank card shows what its player wrote (nothing while it is in a hand). */
function whiteCards(
    state: GameState,
    ids: readonly string[],
    cards: CardLookup,
    written: Readonly<Record<string, string>> = state.blankTexts,
): WhiteCardView[] {
    return ids.map((id) =>
        isBlankId(id) ? { id, text: written[id] ?? '', blank: true } : { id, text: cards.whiteText(id) },
    );
}

/** A hand on the phone: the dealt cards, then the blank ones to write on. */
function handCards(state: GameState, hand: readonly string[], cards: CardLookup): WhiteCardView[] {
    return whiteCards(state, [...hand.filter((id) => !isBlankId(id)), ...hand.filter(isBlankId)], cards);
}

function blackCard(card: BlackCardRef, cards: CardLookup): BlackCardView {
    return { text: cards.blackText(card.id), pick: card.pick };
}
