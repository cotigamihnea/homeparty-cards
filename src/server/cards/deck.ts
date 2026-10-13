import { uniqueByText, type CardLibrary } from './library.js';

export interface Deck {
    white: string[];
    black: string[];
}

/** Cards of the selected packs in library order (base first); duplicate text keeps its first copy. Unknown ids are ignored. */
export function buildDeck(library: CardLibrary, packIds: Iterable<string>): Deck {
    const selected = new Set(packIds);
    const packs = library.packs.filter((pack) => selected.has(pack.id)).map((pack) => library.cardsInPack(pack.id));
    return {
        white: uniqueByText(
            packs.flatMap((cards) => cards?.white ?? []),
            (id) => library.white(id)?.text,
        ),
        black: uniqueByText(
            packs.flatMap((cards) => cards?.black ?? []),
            (id) => library.black(id)?.text,
        ),
    };
}

export function officialPackIds(library: CardLibrary): string[] {
    return library.packs.filter((pack) => pack.official).map((pack) => pack.id);
}

export function basePackIds(library: CardLibrary): string[] {
    return library.packs.filter((pack) => pack.kind === 'base').map((pack) => pack.id);
}

/** New games start with every official pack selected. */
export function defaultPackIds(library: CardLibrary): string[] {
    return officialPackIds(library);
}
