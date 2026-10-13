import type { Language } from './constants.js';
import type { CardColor } from './customCards.js';
import type { DeckProblem } from './deckRules.js';
import type { Settings } from './settings.js';

export type Phase = 'LOBBY' | 'WRITING' | 'ROUND_START' | 'SUBMITTING' | 'JUDGING' | 'ROUND_RESULT' | 'GAME_OVER';

export type VoidReason = 'TOO_FEW_SUBMISSIONS' | 'CZAR_TIMEOUT' | 'CZAR_LEFT';

export type NetworkWarning = 'WSL_NAT' | 'NO_LAN';

/** What the laptop runs, for the connection help: Windows Firewall steps, WSL networking steps, or general ones. */
export type HostSystem = 'windows' | 'wsl-nat' | 'wsl-mirrored' | 'other';

export interface NetworkView {
    joinUrl: string;
    qrSvg: string;
    warning: NetworkWarning | null;
    host: HostSystem;
}

export interface PublicPlayer {
    id: string;
    name: string;
    avatar: number;
    score: number;
    connected: boolean;
    isVip: boolean;
    isCzar: boolean;
    /** Answered in the current submitting phase (never says what). */
    hasSubmitted: boolean;
    /** False for a late joiner until the next round deals them in. */
    inRound: boolean;
}

export interface WhiteCardView {
    id: string;
    text: string;
    /** A blank card (house rule): what its player wrote, or nothing yet while it is in a hand. */
    blank?: true;
}

export interface BlackCardView {
    text: string;
    pick: number;
}

/** An anonymous answer: no author until the result. */
export interface SubmissionView {
    id: string;
    cards: WhiteCardView[];
}

export interface AuthoredSubmissionView extends SubmissionView {
    authorId: string;
}

/** Public table talk from the house rules, oldest first, for the TV (and each phone's own buttons). */
export type AnnouncementView =
    | { kind: 'reboot'; playerId: string; at: number }
    /** The card's text, not its id: it is discarded and may be dealt again later. */
    | { kind: 'confession'; playerId: string; text: string; at: number };

export interface RoundView {
    number: number;
    czarId: string;
    black: BlackCardView;
    answeredCount: number;
    expectedCount: number;
    /** The Happy Ending's haiku round: the game is decided, this one is for glory. */
    finale: boolean;
    announcements: AnnouncementView[];
}

export interface JudgingView {
    /** The same shuffled order on the TV and on the Czar's phone. */
    submissions: SubmissionView[];
    /** The TV reads the answers out one by one, evenly spread from revealStartedAt to revealEndsAt. */
    revealStartedAt: number;
    revealEndsAt: number;
    /** The TV has read every answer out; the Czar can pick now. */
    revealed: boolean;
    highlightedId: string | null;
}

export type RoundResultView =
    | { kind: 'winner'; winnerId: string; submissionId: string; submissions: AuthoredSubmissionView[] }
    | { kind: 'void'; reason: VoidReason };

export interface StandingView {
    playerId: string;
    score: number;
    rank: number;
}

export interface BestOfView {
    round: number;
    black: BlackCardView;
    cards: WhiteCardView[];
    winnerId: string;
}

export interface GameOverView {
    winnerIds: string[];
    standings: StandingView[];
    bestOf: BestOfView[];
    /** Custom Fever: how many cards the players wrote (pack fillers left out), and the deck they were saved as. */
    fever: { white: number; black: number; savedAs: string | null } | null;
}

/** One player's Custom Fever writing, in counts only: what they wrote is never shown to anyone else. */
export interface WritingProgress {
    playerId: string;
    white: number;
    black: number;
    done: boolean;
}

/** Custom Fever's writing phase (GAME_DESIGN §13): everyone's quota and progress. */
export interface WritingView {
    quota: { white: number; black: number };
    progress: WritingProgress[];
}

/** A card this phone's player wrote, while writing is open. */
export interface WrittenCardView {
    id: string;
    color: CardColor;
    text: string;
    pick: number;
}

/** The deck the selected packs make (duplicates removed), and what stops a game starting with it. */
export interface DeckSummary {
    white: number;
    black: number;
    problem: DeckProblem | null;
}

export interface CommonView {
    /** Which game since the server started (0 before the first): screens tell a new game from the last one. */
    game: number;
    phase: Phase;
    lang: Language;
    settings: Settings;
    deck: DeckSummary;
    /** Goes up whenever the laptop's custom decks change, so open pack pickers and deck editors fetch again. */
    catalogVersion: number;
    players: PublicPlayer[];
    /** The server clock when the view was built, so clients can correct their own clock for countdowns. */
    serverNow: number;
    phaseEndsAt: number | null;
    paused: boolean;
    /** When the current pause began, so screens can hold still; null while not paused. */
    pausedAt: number | null;
    round: RoundView | null;
    suddenDeath: { round: number; contenderIds: string[] } | null;
    /** Rando Cardrissian's score in a game with the house rule; it is never one of `players`. */
    rando: { score: number } | null;
    /** The TV always gets it while judging; a phone only if it is the Czar's. */
    judging: JudgingView | null;
    result: RoundResultView | null;
    gameOver: GameOverView | null;
    writing: WritingView | null;
}

export interface HostView extends CommonView {
    network: NetworkView;
}

export interface PlayerView extends CommonView {
    myId: string;
    hand: WhiteCardView[];
    /** Your own answer this round, if you gave one. */
    mySubmission: WhiteCardView[] | null;
    /** The answer timer ran out and Auto-play on timeout played random cards for you. */
    autoPlayed: boolean;
    canSubmit: boolean;
    /** Custom Fever: the cards you wrote, oldest first, while writing is open. */
    myWritten: WrittenCardView[];
}
