import type { PackKind, PackSummary } from '../../../shared/packs.js';

export interface PackGroup {
    kind: PackKind;
    packs: readonly PackSummary[];
}

const GROUP_ORDER: readonly PackKind[] = ['custom', 'base', 'expansion', 'themed', 'fan'];
const OFFICIAL: readonly PackKind[] = ['base', 'expansion', 'themed'];

const isOfficial = (pack: PackSummary) => OFFICIAL.includes(pack.kind);

/** The laptop's own decks, the base set, the expansions, themed and fan-made packs; empty groups are left out. */
export function packGroups(catalog: readonly PackSummary[]): PackGroup[] {
    const groups = GROUP_ORDER.map((kind) => ({ kind, packs: catalog.filter((pack) => pack.kind === kind) }));
    return groups.filter((group) => group.packs.length > 0);
}

function inLibraryOrder(catalog: readonly PackSummary[], chosen: ReadonlySet<string>): string[] {
    return catalog.filter((pack) => chosen.has(pack.id)).map((pack) => pack.id);
}

/** Turns every pack of one kind on or off; the result is in library order and holds only known packs. */
export function setGroup(
    catalog: readonly PackSummary[],
    selected: readonly string[],
    kind: PackKind,
    on: boolean,
): string[] {
    const chosen = new Set(selected);
    for (const pack of catalog) {
        if (pack.kind !== kind) continue;
        if (on) chosen.add(pack.id);
        else chosen.delete(pack.id);
    }
    return inLibraryOrder(catalog, chosen);
}

export function officialOnly(catalog: readonly PackSummary[]): string[] {
    return catalog.filter(isOfficial).map((pack) => pack.id);
}

/** Only the laptop's own decks (GAME_DESIGN §12). */
export function customOnly(catalog: readonly PackSummary[]): string[] {
    return catalog.filter((pack) => pack.kind === 'custom').map((pack) => pack.id);
}

export function baseOnly(catalog: readonly PackSummary[]): string[] {
    return catalog.filter((pack) => pack.kind === 'base').map((pack) => pack.id);
}

/** Adds or removes one pack; the result is in library order and holds only packs the catalog knows. */
export function togglePack(catalog: readonly PackSummary[], selected: readonly string[], packId: string): string[] {
    const chosen = new Set(selected);
    if (chosen.has(packId)) chosen.delete(packId);
    else chosen.add(packId);
    return inLibraryOrder(catalog, chosen);
}
