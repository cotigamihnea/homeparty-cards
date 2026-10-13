import { MAX_PICK } from '../../shared/constants.js';
import { cardKey } from '../../shared/cardKey.js';
import type { PackKind } from '../../shared/packs.js';
import { loadCardData, type RawCardData, type RawPack } from './loader.js';

export interface PackInfo {
    id: string;
    name: string;
    kind: PackKind;
    official: boolean;
    /** Unique playable cards in this pack. */
    whiteCount: number;
    blackCount: number;
}

export interface WhiteCard {
    id: string;
    text: string;
}

export interface BlackCard {
    id: string;
    text: string;
    pick: number;
}

export interface PackCards {
    white: readonly string[];
    black: readonly string[];
}

export interface CardLibrary {
    /** Sorted: base, main expansions (in release order), themed packs, fan packs. */
    packs: readonly PackInfo[];
    white(id: string): WhiteCard | undefined;
    black(id: string): BlackCard | undefined;
    cardsInPack(packId: string): PackCards | undefined;
}

const BASE_PACK = 'CAH Base Set';
const EXPANSIONS = [
    'CAH: First Expansion',
    'CAH: Second Expansion',
    'CAH: Third Expansion',
    'CAH: Fourth Expansion',
    'CAH: Fifth Expansion',
    'CAH: Sixth Expansion',
    'CAH: Red Box Expansion',
    'CAH: Green Box Expansion',
    'CAH: Blue Box Expansion',
    'Absurd Box Expansion',
    'CAH: Box Expansion',
];
const KIND_ORDER: readonly PackKind[] = ['custom', 'base', 'expansion', 'themed', 'fan'];

export { cardKey };

export function loadCardLibrary(file?: string): CardLibrary {
    return buildLibrary(loadCardData(file));
}

export function buildLibrary(data: RawCardData): CardLibrary {
    const whiteCards = mapById(data.white.map((text, i): WhiteCard => ({ id: `w${i}`, text })));
    const blackCards = mapById(
        data.black.flatMap((card, i): BlackCard[] =>
            card.pick <= MAX_PICK ? [{ id: `b${i}`, text: card.text, pick: card.pick }] : [],
        ),
    );
    const takenIds = new Set<string>();
    const packs = data.packs.map((pack) => {
        const cards: PackCards = {
            white: uniqueByText(
                pack.white.map((i) => `w${i}`),
                (id) => whiteCards.get(id)?.text,
            ),
            black: uniqueByText(
                pack.black.map((i) => `b${i}`),
                (id) => blackCards.get(id)?.text,
            ),
        };
        const info: PackInfo = {
            id: uniqueSlug(pack.name, takenIds),
            name: pack.name,
            kind: packKind(pack),
            official: pack.official,
            whiteCount: cards.white.length,
            blackCount: cards.black.length,
        };
        return { info, cards };
    });
    packs.sort((a, b) => comparePacks(a.info, b.info));
    const cardsById = new Map(packs.map(({ info, cards }) => [info.id, cards]));
    return {
        packs: packs.map(({ info }) => info),
        white: (id) => whiteCards.get(id),
        black: (id) => blackCards.get(id),
        cardsInPack: (packId) => cardsById.get(packId),
    };
}

function mapById<Card extends { id: string }>(cards: readonly Card[]): Map<string, Card> {
    return new Map(cards.map((card): [string, Card] => [card.id, card]));
}

function packKind(pack: RawPack): PackKind {
    if (!pack.official) return 'fan';
    if (pack.name === BASE_PACK) return 'base';
    return EXPANSIONS.includes(pack.name) ? 'expansion' : 'themed';
}

function comparePacks(a: PackInfo, b: PackInfo): number {
    return (
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        EXPANSIONS.indexOf(a.name) - EXPANSIONS.indexOf(b.name) ||
        a.name.localeCompare(b.name, 'en') ||
        a.id.localeCompare(b.id, 'en')
    );
}

function uniqueSlug(name: string, taken: Set<string>): string {
    const base =
        name
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'pack';
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    return slug;
}

/** Keeps the first card of each text; ids without a playable card (e.g. pick > 3) are dropped. */
export function uniqueByText(ids: readonly string[], textOf: (id: string) => string | undefined): string[] {
    const seen = new Set<string>();
    return ids.filter((id) => {
        const text = textOf(id);
        if (text === undefined) return false;
        const key = cardKey(text);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
