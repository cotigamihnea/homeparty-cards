import { LANGUAGES, type Language } from './constants.js';

/** Classic plays the chosen packs; Custom Fever has everyone write the deck first (GAME_DESIGN §13). */
export type GameMode = 'classic' | 'customFever';

export interface Settings {
    /** null = unlimited points; the game then ends by round limit (or by the VIP). */
    pointsToWin: number | null;
    /** Used only when pointsToWin is null; null = no limit. */
    roundLimit: number | null;
    handSize: number;
    /** 0 = no timer. */
    submitSeconds: number;
    judgeSeconds: number;
    packIds: string[];
    language: Language;
    // House rules (GAME_DESIGN §8), all off by default.
    /** Once a round, a player may spend 1 point to swap their whole hand. */
    rebootTheUniverse: boolean;
    /** A bot plays a random answer every round, and can win. */
    randoCardrissian: boolean;
    /** When the game is decided, one last "Make a haiku." round, just for glory. */
    happyEnding: boolean;
    /** Once a round, a player may discard a card they don't understand; the TV shows it. */
    neverHaveIEver: boolean;
    /** Blank cards in each player's first hand (0–3). */
    blankCards: number;
    /** When the answer timer runs out, random cards are played for anyone who hasn't answered. */
    autoPlay: boolean;
    gameMode: GameMode;
    /** Custom Fever's writing time in minutes; null = no limit (writing ends when everyone is done). */
    writingMinutes: number | null;
}

export const POINTS_TO_WIN_OPTIONS: readonly (number | null)[] = [5, 7, 10, null];
export const ROUND_LIMIT_OPTIONS: readonly (number | null)[] = [10, 15, 20, null];
export const TIMER_OPTIONS: readonly number[] = [0, 45, 60, 90];
export const BLANK_CARD_OPTIONS: readonly number[] = [0, 1, 2, 3];
export const GAME_MODES: readonly GameMode[] = ['classic', 'customFever'];
export const WRITING_MINUTES_OPTIONS: readonly (number | null)[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null];
export const HAND_SIZE_MIN = 7;
export const HAND_SIZE_MAX = 12;
const MAX_PACK_IDS = 300;
const MAX_PACK_ID_LENGTH = 100;

export const DEFAULT_SETTINGS: Settings = {
    pointsToWin: 7,
    roundLimit: 15,
    handSize: 10,
    submitSeconds: 60,
    judgeSeconds: 60,
    packIds: [],
    language: 'en',
    rebootTheUniverse: false,
    randoCardrissian: false,
    happyEnding: false,
    neverHaveIEver: false,
    blankCards: 0,
    autoPlay: false,
    gameMode: 'classic',
    writingMinutes: 5,
};

/** The house-rule switches, in the order of GAME_DESIGN §8 (blank cards, a number, come between the last two). */
export type HouseRuleSwitch = 'rebootTheUniverse' | 'randoCardrissian' | 'happyEnding' | 'neverHaveIEver' | 'autoPlay';

function isBoolean(value: unknown): boolean {
    return typeof value === 'boolean';
}

const FIELD_CHECKS: Record<keyof Settings, (value: unknown) => boolean> = {
    pointsToWin: (value) => POINTS_TO_WIN_OPTIONS.includes(value as number | null),
    roundLimit: (value) => ROUND_LIMIT_OPTIONS.includes(value as number | null),
    handSize: (value) =>
        Number.isInteger(value) && (value as number) >= HAND_SIZE_MIN && (value as number) <= HAND_SIZE_MAX,
    submitSeconds: (value) => TIMER_OPTIONS.includes(value as number),
    judgeSeconds: (value) => TIMER_OPTIONS.includes(value as number),
    packIds: (value) =>
        Array.isArray(value) &&
        value.length <= MAX_PACK_IDS &&
        value.every((id) => typeof id === 'string' && id.length <= MAX_PACK_ID_LENGTH),
    language: (value) => LANGUAGES.includes(value as Language),
    rebootTheUniverse: isBoolean,
    randoCardrissian: isBoolean,
    happyEnding: isBoolean,
    neverHaveIEver: isBoolean,
    blankCards: (value) => BLANK_CARD_OPTIONS.includes(value as number),
    autoPlay: isBoolean,
    gameMode: (value) => GAME_MODES.includes(value as GameMode),
    writingMinutes: (value) => WRITING_MINUTES_OPTIONS.includes(value as number | null),
};

/** Validates a settings change from a phone or the host; unknown or inherited keys are rejected. */
export function isValidSettingsPatch(patch: unknown): patch is Partial<Settings> {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return false;
    return Object.entries(patch).every(
        ([key, value]) => Object.hasOwn(FIELD_CHECKS, key) && FIELD_CHECKS[key as keyof Settings](value),
    );
}
