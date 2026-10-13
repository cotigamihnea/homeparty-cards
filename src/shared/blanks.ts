import { hasVisibleText, nameLength, normalizeName } from './names.js';
import type { Reason } from './reasons.js';

/** GAME_DESIGN §8: a blank card holds up to 80 characters of the player's own answer. */
export const BLANK_TEXT_MAX = 80;

/** A blank card played in an answer, with what the player wrote on it. */
export interface BlankAnswer {
    cardId: string;
    text: string;
}

/** A written blank as it is kept and shown: one line, cleaned up like a name (no invisible characters). */
export function normalizeBlankText(raw: string): string {
    return normalizeName(raw);
}

export function checkBlankText(raw: string): Extract<Reason, 'BLANK_EMPTY' | 'BLANK_TOO_LONG'> | null {
    const text = normalizeBlankText(raw);
    if (!hasVisibleText(text)) return 'BLANK_EMPTY';
    return nameLength(text) > BLANK_TEXT_MAX ? 'BLANK_TOO_LONG' : null;
}
