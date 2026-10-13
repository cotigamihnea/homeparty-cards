export const APP_NAME = 'Homeparty Cards';

export const DEFAULT_PORT = 4242;
export const PORT_FALLBACK_ATTEMPTS = 10;

export const MIN_PLAYERS = 3;
/** Rando Cardrissian, the bot of the house rule: it answers and scores, but never takes a seat. */
export const RANDO_ID = 'rando';
export const MAX_PLAYERS = 12;
export const NAME_MAX_LENGTH = 16;
export const AVATAR_COUNT = 12;

export const LANGUAGES = ['en', 'ro'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

/** The game supports Pick 1–3 (Pick 3 deals 2 extra cards first); bigger picks are left out of decks. */
export const MAX_PICK = 3;
/** GAME_DESIGN §3: at least players × 10 × 2 white cards and 20 black cards. */
export const MIN_WHITE_CARDS_PER_PLAYER = 20;
export const MIN_BLACK_CARDS = 20;
/** GAME_DESIGN §3 with a custom deck selected: a hand plus 3 white cards per player, and 10 black cards. */
export const CUSTOM_DECK_SPARE_WHITE = 3;
export const CUSTOM_DECK_MIN_BLACK = 10;

// Round timing (GAME_DESIGN §4, §7).
export const ROUND_INTRO_MS = 3_000;
export const REVEAL_MS_PER_SUBMISSION = 2_500;
export const RESULT_MS = 6_000;
export const VOID_RESULT_MS = 4_000;
export const CZAR_RECONNECT_GRACE_MS = 20_000;
export const VIP_RECONNECT_GRACE_MS = 30_000;
export const RESUME_MIN_MS = 10_000;

/** Pick 3 cards are "Draw 2, Pick 3". */
export const PICK_3_EXTRA_CARDS = 2;
export const SUDDEN_DEATH_MAX_ROUNDS = 3;

/** Round timings; a game keeps its own copy so tests (and maybe a future "fast mode") can shorten them. */
export interface Timing {
    roundIntroMs: number;
    revealMsPerSubmission: number;
    resultMs: number;
    voidResultMs: number;
    czarGraceMs: number;
    vipGraceMs: number;
    resumeMinMs: number;
    /** How long one second of the answer and judging timers lasts (1000; shorter only in tests). */
    secondMs: number;
}

export const DEFAULT_TIMING: Timing = {
    roundIntroMs: ROUND_INTRO_MS,
    revealMsPerSubmission: REVEAL_MS_PER_SUBMISSION,
    resultMs: RESULT_MS,
    voidResultMs: VOID_RESULT_MS,
    czarGraceMs: CZAR_RECONNECT_GRACE_MS,
    vipGraceMs: VIP_RECONNECT_GRACE_MS,
    resumeMinMs: RESUME_MIN_MS,
    secondMs: 1000,
};
