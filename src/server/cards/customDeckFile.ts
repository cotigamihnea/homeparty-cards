import {
    blackPick,
    checkCardText,
    CUSTOM_DECK_LIMITS,
    normalizeCardText,
    normalizeDeckName,
    type CustomBlackCard,
    type CustomDeckCards,
} from '../../shared/customCards.js';
import { hasVisibleText, nameLength } from '../../shared/names.js';
import { cardKey } from './library.js';

/** Marks a file as one of this game's decks (GAME_DESIGN §12); also the export format. */
export const DECK_FORMAT = 'homeparty-cards-deck';
/** What decks were marked with before the game was renamed: they still open. */
const FORMATS_READ: readonly unknown[] = [DECK_FORMAT, 'homeparty-cah-deck'];
const VERSION = 1;

export interface ReadDeck {
    name: string;
    cards: CustomDeckCards;
    /** Cards left out: broken, repeated, or over the deck's limits. */
    skipped: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A deck name read from a file: cleaned, and cut to the longest name allowed. */
function readName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const name = normalizeDeckName(value);
    if (!hasVisibleText(name)) return null;
    if (nameLength(name) <= CUSTOM_DECK_LIMITS.name) return name;
    const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name));
    return graphemes
        .slice(0, CUSTOM_DECK_LIMITS.name)
        .map((part) => part.segment)
        .join('')
        .trim();
}

/** Keeps each good, new card up to the limit; everything else counts as skipped. */
function keepCards<Card>(
    entries: readonly unknown[],
    limit: number,
    read: (entry: unknown) => Card | null,
    key: (card: Card) => string,
): { kept: Card[]; skipped: number } {
    const kept: Card[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
        const card = read(entry);
        if (!card || kept.length >= limit || seen.has(key(card))) continue;
        seen.add(key(card));
        kept.push(card);
    }
    return { kept, skipped: entries.length - kept.length };
}

function readWhite(entry: unknown): string | null {
    return typeof entry === 'string' && !checkCardText('white', entry) ? normalizeCardText(entry) : null;
}

/** A black card as `{ text }` (what the game writes) or as plain text (what a person may write by hand). */
function readBlack(entry: unknown): CustomBlackCard | null {
    const raw = typeof entry === 'string' ? entry : isRecord(entry) ? entry.text : undefined;
    if (typeof raw !== 'string' || checkCardText('black', raw)) return null;
    const text = normalizeCardText(raw);
    return { text, pick: blackPick(text) };
}

/** Reads a deck file (or an import): every card is checked with the editor's rules, whatever the file claims. */
export function readDeckFile(json: unknown): ReadDeck | 'NOT_A_DECK' {
    if (!isRecord(json) || !FORMATS_READ.includes(json.format) || json.version !== VERSION) return 'NOT_A_DECK';
    const name = readName(json.name);
    if (!name || !Array.isArray(json.white) || !Array.isArray(json.black)) return 'NOT_A_DECK';
    const white = keepCards(json.white, CUSTOM_DECK_LIMITS.white, readWhite, cardKey);
    const black = keepCards(json.black, CUSTOM_DECK_LIMITS.black, readBlack, (card) => cardKey(card.text));
    return { name, cards: { white: white.kept, black: black.kept }, skipped: white.skipped + black.skipped };
}

export function deckFileJson(deck: { name: string } & CustomDeckCards): string {
    const file = { format: DECK_FORMAT, version: VERSION, name: deck.name, white: deck.white, black: deck.black };
    return `${JSON.stringify(file, null, 2)}\n`;
}
