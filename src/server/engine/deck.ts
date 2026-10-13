import { eraseBlanks, isBlankId } from './blanks.js';
import { requirePlayer, updatePlayer } from './players.js';
import { shuffle } from './rng.js';
import type { BlackCardRef, GameState } from './state.js';

/** Draws from the top; an empty draw pile is refilled by shuffling the discard pile. May return fewer cards. */
export function drawWhite(state: GameState, count: number): [cards: string[], state: GameState] {
    let { whiteDraw, whiteDiscard, rng } = state;
    const drawn: string[] = [];
    while (drawn.length < count) {
        if (whiteDraw.length === 0) {
            if (whiteDiscard.length === 0) break;
            [whiteDraw, rng] = shuffle(whiteDiscard, rng);
            whiteDiscard = [];
        }
        const take = Math.min(count - drawn.length, whiteDraw.length);
        drawn.push(...whiteDraw.slice(0, take));
        whiteDraw = whiteDraw.slice(take);
    }
    return [drawn, { ...state, whiteDraw, whiteDiscard, rng }];
}

export function drawBlack(state: GameState): [card: BlackCardRef | null, state: GameState] {
    let { blackDraw, blackDiscard, rng } = state;
    if (blackDraw.length === 0) {
        [blackDraw, rng] = shuffle(blackDiscard, rng);
        blackDiscard = [];
    }
    const [card, ...rest] = blackDraw;
    return [card ?? null, { ...state, blackDraw: rest, blackDiscard, rng }];
}

export function dealTo(state: GameState, playerId: string, count: number): GameState {
    const [cards, next] = drawWhite(state, count);
    return updatePlayer(next, playerId, (player) => ({ ...player, hand: [...player.hand, ...cards] }));
}

/**
 * Fills a hand to the hand size, or trims it back: the newest cards go first (e.g. unused Draw-2 extras), but never a
 * blank card, which is dealt only once a game.
 */
export function topUpHand(state: GameState, playerId: string): GameState {
    const player = requirePlayer(state, playerId);
    const size = state.settings.handSize;
    if (player.hand.length > size) {
        const extra = player.hand.filter((id) => !isBlankId(id)).slice(size - player.hand.length);
        const trimmed = updatePlayer(state, playerId, (p) => ({
            ...p,
            hand: p.hand.filter((id) => !extra.includes(id)),
        }));
        return { ...trimmed, whiteDiscard: [...trimmed.whiteDiscard, ...extra] };
    }
    return dealTo(state, playerId, size - player.hand.length);
}

/** An answer comes back to its author's hand; blank cards come back unwritten. */
export function returnToHand(state: GameState, playerId: string, cardIds: readonly string[]): GameState {
    const returned = updatePlayer(state, playerId, (player) => ({ ...player, hand: [...player.hand, ...cardIds] }));
    return eraseBlanks(returned, cardIds);
}
