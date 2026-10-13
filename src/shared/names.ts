import { NAME_MAX_LENGTH } from './constants.js';
import type { Reason } from './reasons.js';

// Control/format characters, except whitespace controls (collapsed below) and the zero-width joiner (emoji).
const INVISIBLE = /(?![‍\t\n\v\f\r])[\p{Cc}\p{Cf}]/gu;
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export type NameCheck =
    { ok: true; name: string } | { ok: false; reason: Extract<Reason, 'NAME_EMPTY' | 'NAME_TOO_LONG'> };

export function normalizeName(raw: string): string {
    return raw.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();
}

export function nameLength(name: string): number {
    return Array.from(graphemes.segment(name)).length;
}

/** True when there is something to see: a letter, number, punctuation or symbol. */
export function hasVisibleText(text: string): boolean {
    return VISIBLE.test(text);
}

export function validateName(raw: string): NameCheck {
    const name = normalizeName(raw);
    if (!hasVisibleText(name)) return { ok: false, reason: 'NAME_EMPTY' };
    if (nameLength(name) > NAME_MAX_LENGTH) return { ok: false, reason: 'NAME_TOO_LONG' };
    return { ok: true, name };
}

export function sameName(a: string, b: string): boolean {
    return a.toLocaleLowerCase('en') === b.toLocaleLowerCase('en');
}
