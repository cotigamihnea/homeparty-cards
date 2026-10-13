import type { BlankAnswer } from './blanks.js';
import type { Language } from './constants.js';
import type { CardColor, CustomDeck } from './customCards.js';
import type { PackSummary } from './packs.js';
import type { Reason } from './reasons.js';
import type { Settings } from './settings.js';
import type { HostView, PlayerView } from './views.js';

export type Ack = { ok: true } | { ok: false; reason: Reason };
/** An ack that carries something back when the command worked. */
export type Answer<T = object> = ({ ok: true } & T) | { ok: false; reason: Reason };
export type JoinAck = { ok: true; playerId: string; sessionToken: string } | { ok: false; reason: Reason };
export interface HostHelloAck {
    /** True only for the laptop running the game; a TV page opened elsewhere just watches. */
    admin: boolean;
    /** Where the laptop keeps its custom decks (shown on the laptop only); null for a TV that just watches. */
    decksFolder: string | null;
}

export interface JoinPayload {
    name: string;
}

export interface ResumePayload {
    sessionToken: string;
}

export interface PlayerIdPayload {
    playerId: string;
}

export interface SubmitCardsPayload {
    /** In answer order: the first fills the first blank. */
    cardIds: string[];
    /** What is written on the blank cards among them (house rule). */
    blanks?: BlankAnswer[];
}

export interface CardPayload {
    cardId: string;
}

export interface SubmissionPayload {
    submissionId: string;
}

export interface AvatarPayload {
    /** 0 … AVATAR_COUNT - 1. */
    avatar: number;
}

export interface SettingsPayload {
    patch: Partial<Settings>;
}

export interface DeckIdPayload {
    deckId: string;
}

export interface DeckNamePayload {
    name: string;
}

export interface RenameDeckPayload {
    deckId: string;
    name: string;
}

/** A card in a custom deck, named by its text (a deck never holds the same card twice). */
export interface DeckCardPayload {
    deckId: string;
    color: CardColor;
    text: string;
}

export interface EditDeckCardPayload extends DeckCardPayload {
    oldText: string;
}

export interface ImportDeckPayload {
    /** The deck file's text, as exported (at most IMPORT_MAX_BYTES). */
    json: string;
}

export interface ImportedDeck {
    deckId: string;
    name: string;
    imported: number;
    skipped: number;
}

export interface WriteCardPayload {
    color: CardColor;
    text: string;
}

export interface EditWrittenCardPayload {
    cardId: string;
    text: string;
}

export interface ServerHello {
    lang: Language;
}

type Command<P> = (payload: P, ack: (res: Ack) => void) => void;
type Query<P, T> = (payload: P, ack: (res: Answer<T>) => void) => void;
type BareCommand = (ack: (res: Ack) => void) => void;

/** The commands without a payload, all for the VIP's phone or the host laptop. */
export type AdminEvent = 'startGame' | 'endGame' | 'playAgain' | 'backToLobby' | 'advance' | 'startNow';

export interface ClientToServerEvents {
    hostHello: (ack: (res: HostHelloAck) => void) => void;
    join: (payload: JoinPayload, ack: (res: JoinAck) => void) => void;
    resume: (payload: ResumePayload, ack: (res: JoinAck) => void) => void;
    /** Every pack with its card counts, for the pack picker; any screen may ask. */
    listPacks: (ack: (packs: PackSummary[]) => void) => void;
    setAvatar: Command<AvatarPayload>;
    submitCards: Command<SubmitCardsPayload>;
    /** Rebooting the Universe: a point for a new hand. */
    rebootHand: BareCommand;
    /** Never Have I Ever: discard a card you don't understand (the TV shows it). */
    discardCard: Command<CardPayload>;
    czarHighlight: Command<SubmissionPayload>;
    czarPick: Command<SubmissionPayload>;
    updateSettings: Command<SettingsPayload>;
    kick: Command<PlayerIdPayload>;
    transferVip: Command<PlayerIdPayload>;
    startGame: BareCommand;
    endGame: BareCommand;
    playAgain: BareCommand;
    backToLobby: BareCommand;
    advance: BareCommand;
    // Custom decks (GAME_DESIGN §12): the VIP's phone or the laptop, in the lobby.
    getDeck: Query<DeckIdPayload, { deck: CustomDeck }>;
    createDeck: Query<DeckNamePayload, { deckId: string }>;
    renameDeck: Command<RenameDeckPayload>;
    addDeckCard: Command<DeckCardPayload>;
    editDeckCard: Command<EditDeckCardPayload>;
    removeDeckCard: Command<DeckCardPayload>;
    deleteDeck: Command<DeckIdPayload>;
    exportDeck: Query<DeckIdPayload, { fileName: string; json: string }>;
    importDeck: Query<ImportDeckPayload, ImportedDeck>;
    // Custom Fever (GAME_DESIGN §13).
    writeCard: Command<WriteCardPayload>;
    editWrittenCard: Command<EditWrittenCardPayload>;
    removeWrittenCard: Command<CardPayload>;
    /** The VIP or the laptop ends the writing early; missing cards come from the packs. */
    startNow: BareCommand;
    /** At the game over: the players' cards become a custom deck (once). */
    saveFeverDeck: Query<DeckNamePayload, { name: string }>;
}

export interface ServerToClientEvents {
    serverHello: (hello: ServerHello) => void;
    hostView: (view: HostView) => void;
    playerView: (view: PlayerView) => void;
    /** You were removed from the game; the connection closes next. */
    kicked: () => void;
    /** Your seat was opened on another device or tab; this connection closes next. */
    replaced: () => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
    role?: 'host' | 'player';
    /** Host screens only: the laptop itself. */
    admin?: boolean;
    playerId?: string;
}
