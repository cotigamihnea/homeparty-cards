import type { BlankAnswer } from '../../shared/blanks.js';
import { AVATAR_COUNT, MAX_PICK } from '../../shared/constants.js';
import { IMPORT_MAX_BYTES } from '../../shared/customCards.js';
import type {
    AvatarPayload,
    CardPayload,
    DeckCardPayload,
    DeckIdPayload,
    DeckNamePayload,
    EditDeckCardPayload,
    EditWrittenCardPayload,
    ImportDeckPayload,
    JoinPayload,
    PlayerIdPayload,
    RenameDeckPayload,
    ResumePayload,
    SubmissionPayload,
    SubmitCardsPayload,
    WriteCardPayload,
} from '../../shared/events.js';

const MAX_RAW_NAME = 200;
/** A blank card's text before clean-up; the engine allows 80 characters after it. */
const MAX_RAW_TEXT = 400;
const MAX_ID = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID;
}

export function isJoinPayload(value: unknown): value is JoinPayload {
    return isRecord(value) && typeof value.name === 'string' && value.name.length <= MAX_RAW_NAME;
}

export function isResumePayload(value: unknown): value is ResumePayload {
    return isRecord(value) && isId(value.sessionToken);
}

export function isPlayerIdPayload(value: unknown): value is PlayerIdPayload {
    return isRecord(value) && isId(value.playerId);
}

function isAvatarIndex(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < AVATAR_COUNT;
}

export function isAvatarPayload(value: unknown): value is AvatarPayload {
    return isRecord(value) && isAvatarIndex(value.avatar);
}

function isBlankAnswer(value: unknown): value is BlankAnswer {
    return isRecord(value) && isId(value.cardId) && typeof value.text === 'string' && value.text.length <= MAX_RAW_TEXT;
}

/** What is written on the blank cards of an answer: optional, and never more entries than an answer has cards. */
function isOptionalBlankAnswers(value: unknown): value is BlankAnswer[] | undefined {
    return value === undefined || (Array.isArray(value) && value.length <= MAX_PICK && value.every(isBlankAnswer));
}

export function isSubmitCardsPayload(value: unknown): value is SubmitCardsPayload {
    return (
        isRecord(value) &&
        Array.isArray(value.cardIds) &&
        value.cardIds.length <= MAX_PICK &&
        value.cardIds.every(isId) &&
        isOptionalBlankAnswers(value.blanks)
    );
}

export function isCardPayload(value: unknown): value is CardPayload {
    return isRecord(value) && isId(value.cardId);
}

export function isSubmissionPayload(value: unknown): value is SubmissionPayload {
    return isRecord(value) && isId(value.submissionId);
}

/** Only the envelope; the settings themselves are checked by the room (values and known packs). */
export function isSettingsPayload(value: unknown): value is { patch: unknown } {
    return isRecord(value) && 'patch' in value;
}

const MAX_RAW_CARD = 1_000;
const COLORS: readonly unknown[] = ['white', 'black'];

function isRawText(value: unknown, max: number): value is string {
    return typeof value === 'string' && value.length <= max;
}

export function isDeckIdPayload(value: unknown): value is DeckIdPayload {
    return isRecord(value) && isId(value.deckId);
}

export function isDeckNamePayload(value: unknown): value is DeckNamePayload {
    return isRecord(value) && isRawText(value.name, MAX_RAW_NAME);
}

export function isRenameDeckPayload(value: unknown): value is RenameDeckPayload {
    return isDeckIdPayload(value) && isDeckNamePayload(value);
}

export function isDeckCardPayload(value: unknown): value is DeckCardPayload {
    return isRecord(value) && isId(value.deckId) && COLORS.includes(value.color) && isRawText(value.text, MAX_RAW_CARD);
}

export function isEditDeckCardPayload(value: unknown): value is EditDeckCardPayload {
    return isDeckCardPayload(value) && isRecord(value) && isRawText(value.oldText, MAX_RAW_CARD);
}

/** The file's text, measured in bytes as it came over the wire. */
export function isImportDeckPayload(value: unknown): value is ImportDeckPayload {
    return (
        isRecord(value) && typeof value.json === 'string' && Buffer.byteLength(value.json, 'utf8') <= IMPORT_MAX_BYTES
    );
}

export function isWriteCardPayload(value: unknown): value is WriteCardPayload {
    return isRecord(value) && COLORS.includes(value.color) && isRawText(value.text, MAX_RAW_CARD);
}

export function isEditWrittenCardPayload(value: unknown): value is EditWrittenCardPayload {
    return isRecord(value) && isId(value.cardId) && isRawText(value.text, MAX_RAW_CARD);
}
