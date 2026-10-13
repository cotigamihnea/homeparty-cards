import { describe, expect, it } from 'vitest';
import { packCatalog } from '../../src/client/ui/catalog.js';
import {
    baseOnly,
    customOnly,
    officialOnly,
    packGroups,
    setGroup,
    togglePack,
} from '../../src/client/ui/settings/packs.js';
import type { PackSummary } from '../../src/shared/packs.js';

const pack = (id: string, kind: PackSummary['kind']): PackSummary => ({ id, name: id, kind, white: 10, black: 2 });
const CATALOG = [
    pack('cah-base-set', 'base'),
    pack('first', 'expansion'),
    pack('xmas', 'themed'),
    pack('fan-a', 'fan'),
    pack('fan-b', 'fan'),
];

describe('pack helpers', () => {
    it('groups the packs by kind: the base set, expansions, themed packs, fan-made packs', () => {
        expect(packGroups(CATALOG).map((group) => [group.kind, group.packs.map((p) => p.id)])).toEqual([
            ['base', ['cah-base-set']],
            ['expansion', ['first']],
            ['themed', ['xmas']],
            ['fan', ['fan-a', 'fan-b']],
        ]);
    });

    it('leaves out a group with no packs', () => {
        expect(packGroups(CATALOG.slice(0, 2)).map((group) => group.kind)).toEqual(['base', 'expansion']);
    });

    it('turns a whole group on or off, keeping the rest and the library order', () => {
        expect(setGroup(CATALOG, ['xmas'], 'fan', true)).toEqual(['xmas', 'fan-a', 'fan-b']);
        expect(setGroup(CATALOG, ['cah-base-set', 'fan-a', 'fan-b'], 'fan', false)).toEqual(['cah-base-set']);
    });

    it('selects every official pack, or just the base set', () => {
        expect(officialOnly(CATALOG)).toEqual(['cah-base-set', 'first', 'xmas']);
        expect(baseOnly(CATALOG)).toEqual(['cah-base-set']);
    });

    it("puts the laptop's own decks first, never counts them as official, and can pick only them", () => {
        const withCustom = [pack('custom-0000000a', 'custom'), ...CATALOG, pack('custom-0000000b', 'custom')];
        expect(packGroups(withCustom)[0]).toEqual({
            kind: 'custom',
            packs: [withCustom[0], withCustom.at(-1)],
        });
        expect(officialOnly(withCustom)).toEqual(['cah-base-set', 'first', 'xmas']);
        expect(customOnly(withCustom)).toEqual(['custom-0000000a', 'custom-0000000b']);
    });

    it('toggles one pack and keeps the library order', () => {
        expect(togglePack(CATALOG, ['xmas'], 'cah-base-set')).toEqual(['cah-base-set', 'xmas']);
        expect(togglePack(CATALOG, ['cah-base-set', 'xmas'], 'cah-base-set')).toEqual(['xmas']);
    });

    it('drops ids the catalog does not know when toggling', () => {
        expect(togglePack(CATALOG, ['gone', 'xmas'], 'first')).toEqual(['first', 'xmas']);
    });
});

describe('packCatalog', () => {
    it('asks the server once, even when asked again while waiting', async () => {
        let calls = 0;
        const catalog = packCatalog(async () => {
            calls++;
            return CATALOG;
        });
        let changes = 0;
        catalog.load(() => changes++);
        catalog.load(() => changes++);
        expect(catalog.packs).toBeNull();
        await Promise.resolve();
        await Promise.resolve();
        expect(calls).toBe(1);
        expect(catalog.packs).toEqual(CATALOG);
        expect(changes).toBe(1);
        catalog.load(() => changes++);
        expect(calls).toBe(1);
    });

    it('fetches again when the custom decks changed since it last asked', async () => {
        let calls = 0;
        const catalog = packCatalog(async () => {
            calls++;
            return CATALOG;
        });
        catalog.sync(1, () => {});
        catalog.load(() => {});
        await Promise.resolve();
        await Promise.resolve();
        catalog.sync(1, () => {});
        expect(calls).toBe(1);
        catalog.sync(2, () => {});
        await Promise.resolve();
        await Promise.resolve();
        expect(calls).toBe(2);
        expect(catalog.packs).toEqual(CATALOG);
    });

    it('a change while asking is fetched as soon as the answer is in', async () => {
        let calls = 0;
        const catalog = packCatalog(async () => {
            calls++;
            return CATALOG;
        });
        catalog.load(() => {});
        catalog.sync(3, () => {});
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(calls).toBe(2);
    });

    it('says it failed and stays failed, until it is asked to try again', async () => {
        let calls = 0;
        let fail = true;
        const catalog = packCatalog(async () => {
            calls++;
            if (fail) throw new Error('timeout');
            return CATALOG;
        });
        catalog.load(() => {});
        await Promise.resolve();
        await Promise.resolve();
        expect(catalog.failed).toBe(true);
        catalog.load(() => {});
        expect(calls).toBe(1);
        expect(catalog.failed).toBe(true);
        fail = false;
        catalog.retry(() => {});
        expect(catalog.failed).toBe(false);
        await Promise.resolve();
        await Promise.resolve();
        expect(calls).toBe(2);
        expect(catalog.packs).toEqual(CATALOG);
    });
});
