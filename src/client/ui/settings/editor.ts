import type { PackKind } from '../../../shared/packs.js';
import type { Settings } from '../../../shared/settings.js';
import { packCatalog, type PackCatalog } from '../catalog.js';
import { ACK_TIMEOUT_MS, type Commands, type GameSocket } from '../socket.js';

export interface SettingsEditActions {
    changeSettings(patch: Partial<Settings>): void;
    /** A pack group was opened or folded away (kept across re-renders). */
    toggleGroup(kind: PackKind, open: boolean): void;
    /** The "Try again" button after the pack list failed to load. */
    retryCatalog(): void;
}

/** What the settings form and the pack picker need, on the VIP's phone and on the laptop alike. */
export interface SettingsEditContext {
    /** The settings as just chosen, before the server has confirmed. */
    settings: Settings;
    catalog: PackCatalog;
    openGroups: ReadonlySet<PackKind>;
    act: SettingsEditActions;
}

export interface SettingsEditor {
    readonly act: SettingsEditActions;
    /** Loads the pack list the first time a pack picker is shown. */
    ensureCatalog(): void;
    /** The views' pack list version: a loaded list is fetched again when the custom decks changed. */
    syncCatalog(version: number): void;
    /** The confirmed settings with any change still on its way to the server, plus the pack list. */
    context(confirmed: Settings): SettingsEditContext;
}

/** Settings changes show at once and are sent to the server; its next view replaces them. */
export function createSettingsEditor(socket: GameSocket, commands: Commands, render: () => void): SettingsEditor {
    const catalog = packCatalog(() => socket.timeout(ACK_TIMEOUT_MS).emitWithAck('listPacks'));
    let openGroups: ReadonlySet<PackKind> = new Set<PackKind>(['custom', 'base', 'expansion']);
    let unconfirmed: Partial<Settings> | null = null;
    // A later change must stay on screen until its own answer is in, not just the first one's.
    let waitingForAnswers = 0;

    const act: SettingsEditActions = {
        changeSettings(patch) {
            unconfirmed = { ...unconfirmed, ...patch };
            waitingForAnswers++;
            commands.send((timed, done) =>
                timed.emit('updateSettings', { patch }, (error, response) => {
                    waitingForAnswers--;
                    if (waitingForAnswers === 0) unconfirmed = null;
                    done(error, response);
                }),
            );
        },
        toggleGroup(kind, open) {
            const next = new Set(openGroups);
            if (open) next.add(kind);
            else next.delete(kind);
            openGroups = next;
            render();
        },
        retryCatalog: () => catalog.retry(render),
    };

    return {
        act,
        ensureCatalog: () => catalog.load(render),
        syncCatalog: (version) => catalog.sync(version, render),
        context: (confirmed) => ({ settings: { ...confirmed, ...unconfirmed }, catalog, openGroups, act }),
    };
}
