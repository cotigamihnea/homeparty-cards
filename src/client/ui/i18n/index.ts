import { BLANK_TEXT_MAX } from '../../../shared/blanks.js';
import {
    DEFAULT_LANGUAGE,
    MAX_PLAYERS,
    MIN_PLAYERS,
    NAME_MAX_LENGTH,
    type Language,
} from '../../../shared/constants.js';
import { CUSTOM_DECK_LIMITS } from '../../../shared/customCards.js';
import type { Reason } from '../../../shared/reasons.js';
import { en, type Dict } from './en.js';
import { ro } from './ro.js';
import { format, lookup, type Entry, type Params } from './translate.js';

type KeyPaths<T> = {
    [K in keyof T & string]: T[K] extends Entry ? K : `${K}.${KeyPaths<T[K]>}`;
}[keyof T & string];

export type MessageKey = KeyPaths<Dict>;

const DICTS: Record<Language, Dict> = { en, ro };
let current: Language = DEFAULT_LANGUAGE;

/** Returns true when the language actually changed, so screens with inputs know to rebuild. */
export function setLanguage(lang: Language): boolean {
    if (lang === current) return false;
    current = lang;
    document.documentElement.lang = lang;
    document.title = t('appName');
    return true;
}

export function formatNumber(value: number): string {
    return new Intl.NumberFormat(current).format(value);
}

/** "13 Oct" (day and short month) in the game's language. */
export function formatShortDate(date: Date): string {
    return new Intl.DateTimeFormat(current === 'en' ? 'en-GB' : current, { day: 'numeric', month: 'short' }).format(
        date,
    );
}

/** "Ana, Bo and Cy" in the game's language. */
export function formatList(items: readonly string[]): string {
    return new Intl.ListFormat(current, { type: 'conjunction' }).format(items);
}

export function t(key: MessageKey, params?: Params): string {
    return format(lookup(DICTS[current], key), current, params);
}

export function translateReason(reason: Reason): string {
    return t(`reasons.${reason}`, {
        maxName: NAME_MAX_LENGTH,
        maxPlayers: MAX_PLAYERS,
        minPlayers: MIN_PLAYERS,
        maxBlank: BLANK_TEXT_MAX,
        maxBlackText: CUSTOM_DECK_LIMITS.blackText,
        maxBlanks: CUSTOM_DECK_LIMITS.blanks,
        maxDeckName: CUSTOM_DECK_LIMITS.name,
        maxDecks: CUSTOM_DECK_LIMITS.decks,
        maxWhiteCards: CUSTOM_DECK_LIMITS.white,
        maxBlackCards: CUSTOM_DECK_LIMITS.black,
    });
}
