import type { CustomDeck } from '../../shared/customCards.js';
import type { BlackCard, CardLibrary, PackCards, PackInfo, WhiteCard } from './library.js';

/** `<deckId>:w3` → the deck and the white card's index (`b` for black). */
const CUSTOM_CARD_ID = /^(custom-[0-9a-f]{8}):([wb])(\d+)$/;

/** The order custom decks are listed in: by name ignoring case, then by id. */
export function byDeckName(a: CustomDeck, b: CustomDeck): number {
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
}

/** The card library with the laptop's own decks in front, as packs of kind `custom` (GAME_DESIGN §12). */
export function withCustomDecks(base: CardLibrary, decks: readonly CustomDeck[]): CardLibrary {
    const byId = new Map(decks.map((deck) => [deck.id, deck]));
    const packs: PackInfo[] = decks.toSorted(byDeckName).map((deck) => ({
        id: deck.id,
        name: deck.name,
        kind: 'custom',
        official: false,
        whiteCount: deck.white.length,
        blackCount: deck.black.length,
    }));

    function customCard(id: string, color: 'w' | 'b'): { deck: CustomDeck; index: number } | undefined {
        const match = CUSTOM_CARD_ID.exec(id);
        const deck = match?.[2] === color ? byId.get(match[1]!) : undefined;
        return deck && { deck, index: Number(match![3]) };
    }

    return {
        packs: [...packs, ...base.packs],
        white(id): WhiteCard | undefined {
            const found = customCard(id, 'w');
            if (!found) return base.white(id);
            const text = found.deck.white[found.index];
            return text === undefined ? undefined : { id, text };
        },
        black(id): BlackCard | undefined {
            const found = customCard(id, 'b');
            if (!found) return base.black(id);
            const card = found.deck.black[found.index];
            return card && { id, ...card };
        },
        cardsInPack(packId): PackCards | undefined {
            const deck = byId.get(packId);
            if (!deck) return base.cardsInPack(packId);
            return {
                white: deck.white.map((_, i) => `${deck.id}:w${i}`),
                black: deck.black.map((_, i) => `${deck.id}:b${i}`),
            };
        },
    };
}
