import { buildLibrary, type CardLibrary } from '../../src/server/cards/library.js';
import { loadCardData } from '../../src/server/cards/loader.js';

/**
 * A one-pack library of the longest cards in the data, to check that no card overflows on any screen.
 * `pick3` keeps only Pick 3 black cards, so every round is the longest kind of answer.
 */
export function longCardLibrary(blacks: 'any' | 'pick3'): CardLibrary {
    return cardLibrary(blacks, true);
}

/** Every Pick 3 black card with ordinary white cards: the most text a full room can put on the TV in one round. */
export function pick3Library(): CardLibrary {
    return cardLibrary('pick3', false);
}

function cardLibrary(blacks: 'any' | 'pick3', longest: boolean): CardLibrary {
    const raw = loadCardData();
    const byLength = <T>(items: T[], length: (item: T) => number) =>
        longest ? [...items].sort((a, b) => length(b) - length(a)) : items;
    const black = byLength(
        raw.black.filter((card) => (blacks === 'pick3' ? card.pick === 3 : card.pick <= 3)),
        (card) => card.text.length,
    ).slice(0, 25);
    const white = byLength(raw.white, (text) => text.length).slice(0, 400);
    return buildLibrary({
        white,
        black,
        packs: [
            {
                name: 'CAH Base Set',
                official: true,
                white: white.map((_, i) => i),
                black: black.map((_, i) => i),
            },
        ],
    });
}
