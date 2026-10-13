import {
    CUSTOM_DECK_MIN_BLACK,
    CUSTOM_DECK_SPARE_WHITE,
    MIN_BLACK_CARDS,
    MIN_WHITE_CARDS_PER_PLAYER,
} from './constants.js';
import { feverQuota } from './fever.js';
import type { GameMode } from './settings.js';

export type DeckProblem = 'NOT_ENOUGH_WHITE_CARDS' | 'NOT_ENOUGH_BLACK_CARDS';

export interface DeckCounts {
    white: number;
    black: number;
    /** Some selected pack is one of the laptop's own decks. */
    custom?: boolean;
}

/**
 * GAME_DESIGN §3: at least players × 10 × 2 white cards and 20 black cards (after de-duplication). With a custom deck
 * in the selection, a hand plus 3 white cards per player and 10 black cards are enough (played cards come back).
 */
export function deckProblem(
    counts: DeckCounts,
    playerCount: number,
    handSize: number,
    mode: GameMode = 'classic',
): DeckProblem | null {
    const { minWhite, minBlack } = deckMinimum(counts, playerCount, handSize, mode);
    if (counts.white < minWhite) return 'NOT_ENOUGH_WHITE_CARDS';
    if (counts.black < minBlack) return 'NOT_ENOUGH_BLACK_CARDS';
    return null;
}

/** Custom Fever: the packs fill every quota if nobody writes (§13). Otherwise §3, smaller with a custom deck. */
function deckMinimum(
    counts: DeckCounts,
    players: number,
    handSize: number,
    mode: GameMode,
): { minWhite: number; minBlack: number } {
    if (mode === 'customFever') {
        const quota = feverQuota(players, handSize);
        return { minWhite: players * quota.white, minBlack: players * quota.black };
    }
    return counts.custom
        ? { minWhite: players * (handSize + CUSTOM_DECK_SPARE_WHITE), minBlack: CUSTOM_DECK_MIN_BLACK }
        : { minWhite: players * MIN_WHITE_CARDS_PER_PLAYER, minBlack: MIN_BLACK_CARDS };
}
