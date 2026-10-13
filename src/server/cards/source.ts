import type { DeckCounts } from '../../shared/deckRules.js';
import type { PackSummary } from '../../shared/packs.js';
import type { DealtDeck } from '../engine/actions.js';
import type { BlackCardRef } from '../engine/state.js';
import type { CardLookup } from '../engine/views.js';
import type { DeckStore } from './customDecks.js';
import { withCustomDecks } from './customLibrary.js';
import { buildDeck } from './deck.js';
import { cardKey, type CardLibrary } from './library.js';

const HAIKU = cardKey('Make a haiku.');

/** The library's "Make a haiku." (Pick 3), kept for the Happy Ending whatever packs are chosen. */
function findHaiku(library: CardLibrary): BlackCardRef | null {
    for (const pack of library.packs) {
        for (const id of library.cardsInPack(pack.id)?.black ?? []) {
            const card = library.black(id);
            if (card?.pick === 3 && cardKey(card.text) === HAIKU) return { id, pick: card.pick };
        }
    }
    return null;
}

/** What the game needs from the card library: texts and deck sizes for the views, decks to deal, the pack list. */
export interface CardSource extends CardLookup {
    dealDeck(packIds: readonly string[]): DealtDeck;
    hasPack(packId: string): boolean;
    catalog(): PackSummary[];
}

/** The library as it stands for one version of the custom decks. */
interface Snapshot {
    version: number;
    library: CardLibrary;
    customIds: ReadonlySet<string>;
    packIds: ReadonlySet<string>;
    catalog: PackSummary[];
}

/** The game's cards: the committed packs plus the laptop's own decks, rebuilt whenever a custom deck changes. */
export function cardSource(base: CardLibrary, decks?: DeckStore): CardSource {
    const haiku = findHaiku(base);
    let snapshot: Snapshot | null = null;
    // Every view carries the deck size, so the last selection's count is kept (selections change rarely).
    let lastSelection: { key: string; size: DeckCounts } | null = null;

    function current(): Snapshot {
        const version = decks?.version ?? 0;
        if (snapshot?.version === version) return snapshot;
        const library = decks ? withCustomDecks(base, decks.list()) : base;
        snapshot = {
            version,
            library,
            customIds: new Set(library.packs.filter((pack) => pack.kind === 'custom').map((pack) => pack.id)),
            packIds: new Set(library.packs.map((pack) => pack.id)),
            catalog: library.packs.map(({ id, name, kind, whiteCount, blackCount }) => ({
                id,
                name,
                kind,
                white: whiteCount,
                black: blackCount,
            })),
        };
        return snapshot;
    }

    const isCustom = (now: Snapshot, selected: readonly string[]) => selected.some((id) => now.customIds.has(id));

    return {
        whiteText: (id) => current().library.white(id)?.text ?? '',
        blackText: (id) => current().library.black(id)?.text ?? '',
        hasPack: (packId) => current().packIds.has(packId),
        catalog: () => current().catalog,
        catalogVersion: () => current().version,
        deckSize(selected) {
            const now = current();
            const key = `${now.version}\n${selected.join('\n')}`;
            if (lastSelection?.key !== key) {
                const deck = buildDeck(now.library, selected);
                const custom = isCustom(now, selected);
                lastSelection = { key, size: { white: deck.white.length, black: deck.black.length, custom } };
            }
            return lastSelection.size;
        },
        dealDeck(selected) {
            const now = current();
            const deck = buildDeck(now.library, selected);
            return {
                white: deck.white,
                black: deck.black.flatMap((id) => {
                    const card = now.library.black(id);
                    return card ? [{ id, pick: card.pick }] : [];
                }),
                haiku,
                custom: isCustom(now, selected),
            };
        },
    };
}
