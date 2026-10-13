import type { PackSummary } from '../../shared/packs.js';

export interface PackCatalog {
    /** The packs once loaded; null while loading or after a failure. */
    readonly packs: readonly PackSummary[] | null;
    readonly failed: boolean;
    /** Asks the server the first time; after a failure it waits for retry, so the failure stays on screen. */
    load(onChange: () => void): void;
    retry(onChange: () => void): void;
    /** The views' pack list version: a loaded list older than it is fetched again (a custom deck changed). */
    sync(version: number, onChange: () => void): void;
}

/** The pack list, fetched when a pack picker first needs it, and again whenever the custom decks change. */
export function packCatalog(request: () => Promise<PackSummary[]>): PackCatalog {
    let packs: readonly PackSummary[] | null = null;
    let failed = false;
    let loading = false;
    /** The version the views last carried, and the one the loaded list was fetched for. */
    let wanted = 0;
    let loadedFor: number | null = null;

    function fetchPacks(onChange: () => void): void {
        const version = wanted;
        loading = true;
        failed = false;
        request().then(
            (list) => {
                packs = list;
                loadedFor = version;
                loading = false;
                onChange();
                if (wanted !== version) fetchPacks(onChange);
            },
            () => {
                failed = true;
                loading = false;
                onChange();
            },
        );
    }

    return {
        get packs() {
            return packs;
        },
        get failed() {
            return failed;
        },
        load(onChange) {
            if (!packs && !loading && !failed) fetchPacks(onChange);
        },
        retry(onChange) {
            if (!packs && !loading) fetchPacks(onChange);
        },
        sync(version, onChange) {
            wanted = version;
            if (packs && !loading && loadedFor !== version) fetchPacks(onChange);
        },
    };
}
