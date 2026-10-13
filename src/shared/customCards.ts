import { BLANK_TEXT_MAX } from './blanks.js';
import { countBlanks } from './cardText.js';
import { MAX_PICK } from './constants.js';
import { hasVisibleText, nameLength, normalizeName } from './names.js';
import type { Reason } from './reasons.js';

export type CardColor = 'white' | 'black';

/** GAME_DESIGN §12: how much a laptop keeps, and how long names and cards may be. */
export const CUSTOM_DECK_LIMITS = {
    decks: 100,
    white: 500,
    black: 200,
    name: 40,
    whiteText: BLANK_TEXT_MAX,
    blackText: 200,
    blanks: MAX_PICK,
} as const;

/** The largest deck file an import accepts. */
export const IMPORT_MAX_BYTES = 256 * 1024;

/** What "Add blank" puts into a black card. */
export const ADD_BLANK = '_____';

export interface CustomBlackCard {
    text: string;
    pick: number;
}

export interface CustomDeckCards {
    white: string[];
    black: CustomBlackCard[];
}

export interface CustomDeck extends CustomDeckCards {
    id: string;
    name: string;
}

export type CardTextProblem = Extract<Reason, 'CARD_EMPTY' | 'CARD_TOO_LONG' | 'CARD_TOO_MANY_BLANKS'>;

/** A card as it is kept: one line, cleaned up like a name (no invisible characters). */
export function normalizeCardText(raw: string): string {
    return normalizeName(raw);
}

export function checkCardText(color: CardColor, raw: string): CardTextProblem | null {
    const text = normalizeCardText(raw);
    if (!hasVisibleText(text)) return 'CARD_EMPTY';
    const max = color === 'white' ? CUSTOM_DECK_LIMITS.whiteText : CUSTOM_DECK_LIMITS.blackText;
    if (nameLength(text) > max) return 'CARD_TOO_LONG';
    return color === 'black' && countBlanks(text) > CUSTOM_DECK_LIMITS.blanks ? 'CARD_TOO_MANY_BLANKS' : null;
}

/** A black card's Pick is its number of blanks; a card without a blank is answered underneath (Pick 1). */
export function blackPick(text: string): number {
    return Math.max(1, countBlanks(text));
}

export function normalizeDeckName(raw: string): string {
    return normalizeName(raw);
}

export function checkDeckName(raw: string): Extract<Reason, 'DECK_NAME_EMPTY' | 'DECK_NAME_TOO_LONG'> | null {
    const name = normalizeDeckName(raw);
    if (!hasVisibleText(name)) return 'DECK_NAME_EMPTY';
    return nameLength(name) > CUSTOM_DECK_LIMITS.name ? 'DECK_NAME_TOO_LONG' : null;
}

// Characters Windows refuses in a file name, and control characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_IN_FILE_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;

/** The name an exported deck is saved under. */
export function deckFileName(name: string): string {
    const safe = name.replace(UNSAFE_IN_FILE_NAME, '-').trim();
    return `${safe || 'deck'}.cah-deck.json`;
}
