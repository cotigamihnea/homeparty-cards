import { DEFAULT_TIMING, type Timing } from '../../shared/constants.js';
import type { CardColor } from '../../shared/customCards.js';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings.js';
import type { Phase, VoidReason } from '../../shared/views.js';

export interface PlayerState {
    id: string;
    name: string;
    avatar: number;
    /** Join order; never reused, so the Czar rotation survives kicks and late joins. */
    seat: number;
    connected: boolean;
    disconnectedAt: number | null;
    score: number;
    hand: string[];
    /** False for someone who joined mid-game until the next round start deals them in. */
    dealtIn: boolean;
}

export interface BlackCardRef {
    id: string;
    pick: number;
}

export interface PendingSubmission {
    playerId: string;
    cardIds: string[];
    /** Played for the player by Auto-play on timeout. */
    auto?: boolean;
}

export interface Submission {
    /** Opaque and random: nothing links it to the author before the result. */
    id: string;
    playerId: string;
    cardIds: string[];
    auto?: boolean;
}

export type { VoidReason };

/** Public table talk during a round: what house rules let players do, shown on the TV. */
export type Announcement =
    | { kind: 'reboot'; playerId: string; at: number }
    | { kind: 'confession'; playerId: string; cardId: string; at: number };

export type RoundOutcome =
    { kind: 'winner'; winnerId: string; submissionId: string } | { kind: 'void'; reason: VoidReason };

export interface RoundState {
    number: number;
    czarId: string;
    black: BlackCardRef;
    /** While SUBMITTING. */
    pending: PendingSubmission[];
    /** From JUDGING on: shuffled, with opaque ids. */
    submissions: Submission[];
    /** 0 until judging starts. */
    judgingStartedAt: number;
    /** The one-by-one reveal; both move later by the length of a pause during it. */
    revealStartedAt: number;
    revealEndsAt: number;
    /** Set by the TICK at revealEndsAt; screens unlock the Czar's pick on it, not on their own clocks. */
    revealed: boolean;
    highlightedId: string | null;
    outcome: RoundOutcome | null;
    /** The Happy Ending: the haiku round after the game is decided, for glory only. */
    finale: boolean;
    /** Oldest first; cleared every round. */
    announcements: Announcement[];
}

export interface BestOfEntry {
    round: number;
    black: BlackCardRef;
    cardIds: string[];
    /** What was written on the winning blank cards; the cards themselves leave play after the round. */
    written: Record<string, string>;
    winnerId: string;
}

export interface SuddenDeath {
    round: number;
    contenderIds: string[];
}

export interface FeverCard {
    color: CardColor;
    text: string;
    pick: number;
}

/** Custom Fever (GAME_DESIGN §13): the cards the players wrote. */
export interface FeverState {
    quota: { white: number; black: number };
    /** Card id → card, for the whole game (the views read their texts here; the save takes them). */
    cards: Record<string, FeverCard>;
    /** Card id → who wrote it, only while writing is open; forgotten when it ends. */
    authors: Record<string, string> | null;
    /** The chosen packs, shuffled, to fill missing cards from; only while writing is open. */
    fillers: { white: string[]; black: BlackCardRef[] } | null;
    /** The custom deck the cards were saved as, at the game over. */
    savedAs: string | null;
}

export interface GameState {
    phase: Phase;
    settings: Settings;
    timing: Timing;
    /** Always in seat order. */
    players: PlayerState[];
    vipId: string | null;
    nextSeat: number;
    /** 1 for the first game since the server started, +1 for every new game (Play again included). */
    gameNumber: number;
    lastCzarSeat: number | null;
    seed: number;
    rng: number;
    whiteDraw: string[];
    whiteDiscard: string[];
    blackDraw: BlackCardRef[];
    blackDiscard: BlackCardRef[];
    round: RoundState | null;
    phaseEndsAt: number | null;
    paused: boolean;
    /** Time left on the phase timer when the game was paused (null if no timer was running). */
    pausedRemainingMs: number | null;
    /** When the current pause began (null while not paused). */
    pausedAt: number | null;
    suddenDeath: SuddenDeath | null;
    /** The Happy Ending's haiku card, kept out of the deck for the end (null when the rule is off). */
    haiku: BlackCardRef | null;
    /** What is written on the blank cards in answers this round, by card id. */
    blankTexts: Record<string, string>;
    /** Rando Cardrissian's score, when the house rule brought it into this game. */
    rando: { score: number } | null;
    bestOf: BestOfEntry[];
    winnerIds: string[];
    /** Custom Fever's written cards; null in a classic game. */
    fever: FeverState | null;
}

/** The phases of a running game (as opposed to the lobby and the game-over screen). */
export const IN_GAME_PHASES: readonly Phase[] = ['WRITING', 'ROUND_START', 'SUBMITTING', 'JUDGING', 'ROUND_RESULT'];

export function createInitialState(settings: Settings = DEFAULT_SETTINGS, timing: Timing = DEFAULT_TIMING): GameState {
    return {
        phase: 'LOBBY',
        settings,
        timing,
        players: [],
        vipId: null,
        nextSeat: 0,
        gameNumber: 0,
        lastCzarSeat: null,
        seed: 0,
        rng: 0,
        whiteDraw: [],
        whiteDiscard: [],
        blackDraw: [],
        blackDiscard: [],
        round: null,
        phaseEndsAt: null,
        paused: false,
        pausedRemainingMs: null,
        pausedAt: null,
        suddenDeath: null,
        haiku: null,
        blankTexts: {},
        rando: null,
        bestOf: [],
        winnerIds: [],
        fever: null,
    };
}
