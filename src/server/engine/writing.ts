import { cardKey } from '../../shared/cardKey.js';
import {
    blackPick,
    checkCardText,
    normalizeCardText,
    type CardColor,
    type CustomDeckCards,
} from '../../shared/customCards.js';
import { feverQuota } from '../../shared/fever.js';
import type { Reason } from '../../shared/reasons.js';
import type { GameOverView, WritingView, WrittenCardView } from '../../shared/views.js';
import type { Action, DealtDeck } from './actions.js';
import { connectedPlayers, findPlayer } from './players.js';
import { randomId, shuffle } from './rng.js';
import { beginRound, newGame, shuffleDeck } from './round.js';
import type { BlackCardRef, FeverCard, FeverState, GameState } from './state.js';

const CARD_ID_PREFIX = 'fever-';

export type WritingAction = Extract<
    Action,
    { type: 'WRITE_CARD' | 'EDIT_WRITTEN_CARD' | 'REMOVE_WRITTEN_CARD' | 'START_NOW' | 'FEVER_SAVED' }
>;

/**
 * Custom Fever (GAME_DESIGN §13): a new game opens with everyone writing their own cards. The chosen packs are
 * shuffled and kept aside to fill whatever is missing when writing ends.
 */
export function startWriting(state: GameState, deck: DealtDeck, seed: number, now: number): GameState {
    const { rng, whiteDraw, blackDraw, haiku } = shuffleDeck(state, deck, seed);
    const minutes = state.settings.writingMinutes;
    return {
        ...newGame(state, seed),
        rng,
        haiku,
        phase: 'WRITING',
        phaseEndsAt: minutes === null ? null : now + minutes * 60_000,
        fever: {
            quota: feverQuota(state.players.length, state.settings.handSize),
            cards: {},
            authors: {},
            fillers: { white: whiteDraw, black: blackDraw },
            savedAs: null,
        },
    };
}

function requireFever(state: GameState): FeverState {
    if (!state.fever) throw new Error('not a Custom Fever game');
    return state.fever;
}

/** The cards this player wrote, oldest first (only while writing is open: authors are forgotten afterwards). */
export function writtenBy(state: GameState, playerId: string): string[] {
    const authors = state.fever?.authors ?? {};
    return Object.keys(authors).filter((cardId) => authors[cardId] === playerId);
}

function ownCards(state: GameState, playerId: string, color: CardColor): string[] {
    return writtenBy(state, playerId).filter((cardId) => state.fever!.cards[cardId]!.color === color);
}

function ownDuplicate(state: GameState, playerId: string, color: CardColor, text: string, except?: string): boolean {
    const key = cardKey(normalizeCardText(text));
    return ownCards(state, playerId, color).some(
        (cardId) => cardId !== except && cardKey(state.fever!.cards[cardId]!.text) === key,
    );
}

function isDone(state: GameState, playerId: string): boolean {
    const quota = requireFever(state).quota;
    return (
        ownCards(state, playerId, 'white').length >= quota.white &&
        ownCards(state, playerId, 'black').length >= quota.black
    );
}

export function checkWriting(state: GameState, action: WritingAction): Reason | null {
    if (action.type === 'FEVER_SAVED') {
        if (state.phase !== 'GAME_OVER' || !state.fever) return 'WRONG_PHASE';
        return state.fever.savedAs === null ? null : 'ALREADY_SAVED';
    }
    if (state.phase !== 'WRITING' || !state.fever?.authors) return 'WRONG_PHASE';
    switch (action.type) {
        case 'START_NOW':
            return null;
        case 'WRITE_CARD': {
            if (!findPlayer(state, action.playerId)) return 'UNKNOWN_PLAYER';
            const problem = checkCardText(action.color, action.text);
            if (problem) return problem;
            if (ownCards(state, action.playerId, action.color).length >= state.fever.quota[action.color]) {
                return 'QUOTA_FULL';
            }
            return ownDuplicate(state, action.playerId, action.color, action.text) ? 'CARD_DUPLICATE' : null;
        }
        case 'EDIT_WRITTEN_CARD': {
            if (state.fever.authors[action.cardId] !== action.playerId) return 'NOT_YOUR_CARD';
            const color = state.fever.cards[action.cardId]!.color;
            const problem = checkCardText(color, action.text);
            if (problem) return problem;
            return ownDuplicate(state, action.playerId, color, action.text, action.cardId) ? 'CARD_DUPLICATE' : null;
        }
        case 'REMOVE_WRITTEN_CARD':
            return state.fever.authors[action.cardId] === action.playerId ? null : 'NOT_YOUR_CARD';
    }
}

function cardFor(color: CardColor, raw: string): FeverCard {
    const text = normalizeCardText(raw);
    return { color, text, pick: color === 'black' ? blackPick(text) : 1 };
}

/** A new card under a random id, so neither the id nor its place in the deck says who wrote it. */
export function writeCard(state: GameState, playerId: string, color: CardColor, text: string, now: number): GameState {
    const fever = requireFever(state);
    let [suffix, rng] = randomId(state.rng);
    while (`${CARD_ID_PREFIX}${suffix}` in fever.cards) [suffix, rng] = randomId(rng);
    const cardId = `${CARD_ID_PREFIX}${suffix}`;
    const next: GameState = {
        ...state,
        rng,
        fever: {
            ...fever,
            cards: { ...fever.cards, [cardId]: cardFor(color, text) },
            authors: { ...fever.authors, [cardId]: playerId },
        },
    };
    return progressWriting(next, now);
}

export function editWrittenCard(state: GameState, cardId: string, text: string): GameState {
    const fever = requireFever(state);
    const card = fever.cards[cardId]!;
    return { ...state, fever: { ...fever, cards: { ...fever.cards, [cardId]: cardFor(card.color, text) } } };
}

export function removeWrittenCard(state: GameState, cardId: string): GameState {
    const fever = requireFever(state);
    const without = <T>(entries: Record<string, T>) =>
        Object.fromEntries(Object.entries(entries).filter(([id]) => id !== cardId));
    return { ...state, fever: { ...fever, cards: without(fever.cards), authors: without(fever.authors ?? {}) } };
}

/** Writing ends as soon as everyone who is here has written their whole quota (never during a pause). */
export function progressWriting(state: GameState, now: number): GameState {
    if (state.phase !== 'WRITING' || state.paused) return state;
    const here = connectedPlayers(state);
    return here.length > 0 && here.every((player) => isDone(state, player.id)) ? finishWriting(state, now) : state;
}

/** How many cards of this colour the seated players are short of their quota. */
function missingCards(state: GameState, color: CardColor): number {
    const quota = requireFever(state).quota[color];
    return state.players.reduce(
        (missing, player) => missing + Math.max(0, quota - ownCards(state, player.id, color).length),
        0,
    );
}

/**
 * Builds the decks from the written cards, filling every seated player's missing ones from the packs, then deals
 * round 1. Who wrote what is forgotten here, for good.
 */
export function finishWriting(state: GameState, now: number): GameState {
    const fever = requireFever(state);
    const fillers = fever.fillers ?? { white: [], black: [] };
    const written = Object.entries(fever.cards);
    const white = written.filter(([, card]) => card.color === 'white').map(([cardId]) => cardId);
    const black: BlackCardRef[] = written
        .filter(([, card]) => card.color === 'black')
        .map(([cardId, card]) => ({ id: cardId, pick: card.pick }));
    const whiteFill = fillers.white.slice(0, missingCards(state, 'white'));
    const blackFill = fillers.black.slice(0, missingCards(state, 'black'));
    const [whiteDraw, afterWhite] = shuffle([...white, ...whiteFill], state.rng);
    const [blackDraw, afterBlack] = shuffle([...black, ...blackFill], afterWhite);
    return beginRound(
        {
            ...state,
            rng: afterBlack,
            whiteDraw,
            whiteDiscard: [],
            blackDraw,
            blackDiscard: [],
            phaseEndsAt: null,
            paused: false,
            pausedRemainingMs: null,
            pausedAt: null,
            fever: forgetAuthors(fever),
        },
        now,
    );
}

/** The game is over before writing ended: the cards stay (to save), who wrote them does not. */
export function closeWriting(fever: FeverState | null): FeverState | null {
    return fever && forgetAuthors(fever);
}

/**
 * Who wrote what goes, and so does the order the cards were written in: the TV showed who finished last, so the
 * last cards written would point at them. The cards are kept in the order of their random ids instead.
 */
function forgetAuthors(fever: FeverState): FeverState {
    const cards = Object.fromEntries(Object.entries(fever.cards).sort(([a], [b]) => (a < b ? -1 : 1)));
    return { ...fever, cards, authors: null, fillers: null };
}

/** What the players wrote (never the pack fillers), each card once, for "Save these cards as a deck". */
export function feverCardsToSave(state: GameState): CustomDeckCards {
    const seen = new Set<string>();
    const deck: CustomDeckCards = { white: [], black: [] };
    for (const card of Object.values(state.fever?.cards ?? {})) {
        const key = `${card.color}:${cardKey(card.text)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (card.color === 'white') deck.white.push(card.text);
        else deck.black.push({ text: card.text, pick: card.pick });
    }
    return deck;
}

/** At the game over: how many cards the players wrote (pack fillers left out), and the deck they were saved as. */
export function feverOverView(fever: FeverState | null): GameOverView['fever'] {
    if (!fever) return null;
    const cards = Object.values(fever.cards);
    const count = (color: CardColor) => cards.filter((card) => card.color === color).length;
    return { white: count('white'), black: count('black'), savedAs: fever.savedAs };
}

export function writingView(state: GameState): WritingView | null {
    if (state.phase !== 'WRITING' || !state.fever) return null;
    return {
        quota: state.fever.quota,
        progress: state.players.map((player) => ({
            playerId: player.id,
            white: ownCards(state, player.id, 'white').length,
            black: ownCards(state, player.id, 'black').length,
            done: isDone(state, player.id),
        })),
    };
}

export function myWrittenView(state: GameState, playerId: string): WrittenCardView[] {
    if (state.phase !== 'WRITING') return [];
    return writtenBy(state, playerId).map((cardId) => ({ id: cardId, ...state.fever!.cards[cardId]! }));
}
