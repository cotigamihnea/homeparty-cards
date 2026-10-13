import type { CustomDeck } from '../../../shared/customCards.js';
import type { ImportedDeck } from '../../../shared/events.js';
import { t } from '../i18n/index.js';
import { ACK_TIMEOUT_MS, type Commands, type GameSocket } from '../socket.js';
import { emptyDraft, insertBlank, type CardWriterActions, type CardWriterState, type Draft } from './cardWriter.js';
import { downloadText, readTextFile } from './files.js';

export type DraftField = 'newName' | 'name' | 'card' | 'edit';

export interface DeckEditorState extends CardWriterState {
    /** The deck open in the editor, as the server last sent it; null on the deck list. */
    open: CustomDeck | null;
    newName: Draft;
    /** The open deck's name field. */
    name: Draft;
    /** The deck waiting for "Delete?" to be confirmed. */
    confirmDelete: string | null;
    importResult: ImportedDeck | null;
}

export interface DeckActions extends CardWriterActions {
    /** Remembers typing; no re-render, so the field keeps the keyboard. */
    setDraft(field: DraftField, draft: Draft): void;
    create(): void;
    open(deckId: string): void;
    /** Back to the deck list. */
    close(): void;
    rename(): void;
    askDelete(deckId: string | null): void;
    deleteDeck(deckId: string): void;
    exportDeck(deckId: string): void;
    importFile(file: File): Promise<void>;
}

export interface DeckFiles {
    download(fileName: string, text: string): void;
    read(file: File): Promise<string | 'TOO_BIG'>;
}

export interface DeckEditorOptions {
    files?: DeckFiles;
    /** Shows a message of the editor's own (an import file too big) where the screen shows refusals. */
    notify(message: string): void;
}

export interface DeckEditor {
    readonly state: DeckEditorState;
    readonly act: DeckActions;
    /** The views' pack list version: when it moves, the open deck is fetched again. */
    sync(catalogVersion: number): void;
    /** The panel closed: next time it opens on the list, with nothing half-done. */
    reset(): void;
}

export function emptyDeckEditorState(): DeckEditorState {
    return {
        open: null,
        tab: 'white',
        newName: emptyDraft(),
        name: emptyDraft(),
        card: emptyDraft(),
        editing: null,
        confirmDelete: null,
        importResult: null,
    };
}

/**
 * The custom deck editor behind the VIP's phone panel and the laptop's page (GAME_DESIGN §12). Every change goes
 * to the server at once; the open deck is fetched again whenever the views say the decks changed.
 */
export function createDeckEditor(
    socket: GameSocket,
    commands: Commands,
    render: () => void,
    options: DeckEditorOptions,
): DeckEditor {
    const files = options.files ?? { download: downloadText, read: readTextFile };
    let state = emptyDeckEditorState();
    let version: number | null = null;

    function update(changes: Partial<DeckEditorState>): void {
        state = { ...state, ...changes };
        render();
    }

    /** A name being typed is kept; an untouched field follows the deck's name (a rename made elsewhere). */
    function show(deck: CustomDeck): void {
        const typing = state.open?.id === deck.id && state.name.text !== state.open.name;
        update({ open: deck, name: typing ? state.name : emptyDraft(deck.name) });
    }

    /** A quiet refresh: no "pending", and a deck deleted elsewhere just closes. */
    function refresh(deckId: string): void {
        socket.timeout(ACK_TIMEOUT_MS).emit('getDeck', { deckId }, (error, answer) => {
            if (error || state.open?.id !== deckId) return;
            if (answer.ok) show(answer.deck);
            else update({ open: null, editing: null });
        });
    }

    const act: DeckActions = {
        setDraft(field, draft) {
            if (field === 'edit') {
                if (state.editing) state = { ...state, editing: { ...state.editing, draft } };
            } else {
                state = { ...state, [field]: draft };
            }
        },
        create() {
            const name = state.newName.text;
            commands.send((timed, done) =>
                timed.emit('createDeck', { name }, (error, answer) => {
                    done(error, answer);
                    if (!error && answer.ok) {
                        state = { ...state, newName: emptyDraft() };
                        act.open(answer.deckId);
                    }
                }),
            );
        },
        open(deckId) {
            commands.send((timed, done) =>
                timed.emit('getDeck', { deckId }, (error, answer) => {
                    if (!error && answer.ok) {
                        state = { ...state, tab: 'white', card: emptyDraft(), editing: null, confirmDelete: null };
                        show(answer.deck);
                    }
                    done(error, answer);
                }),
            );
        },
        close() {
            // A new name typed but not confirmed is still what the VIP meant.
            act.rename();
            update({ open: null, editing: null, card: emptyDraft() });
        },
        rename() {
            const deck = state.open;
            if (!deck || state.name.text === deck.name) return;
            commands.send((timed, done) => timed.emit('renameDeck', { deckId: deck.id, name: state.name.text }, done));
        },
        setTab: (tab) => update({ tab, editing: null }),
        addBlank: () => update({ card: insertBlank(state.card) }),
        addCard() {
            const deck = state.open;
            if (!deck) return;
            // The box empties as the card goes, so the next one can be typed at once; a refused card comes back.
            const card = { deckId: deck.id, color: state.tab, text: state.card.text };
            state = { ...state, card: emptyDraft() };
            commands.send((timed, done) =>
                timed.emit('addDeckCard', card, (error, answer) => {
                    if ((error || !answer.ok) && state.card.text === '') {
                        state = { ...state, card: emptyDraft(card.text) };
                    }
                    done(error, answer);
                }),
            );
        },
        startEdit: (color, text) => update({ editing: { color, oldText: text, draft: emptyDraft(text) } }),
        saveEdit() {
            const deck = state.open;
            const editing = state.editing;
            if (!deck || !editing) return;
            const change = {
                deckId: deck.id,
                color: editing.color,
                oldText: editing.oldText,
                text: editing.draft.text,
            };
            commands.send(
                (timed, done) => timed.emit('editDeckCard', change, done),
                () => {
                    state = { ...state, editing: null };
                },
            );
        },
        cancelEdit: () => update({ editing: null }),
        removeCard(color, text) {
            const deck = state.open;
            if (!deck) return;
            commands.send((timed, done) => timed.emit('removeDeckCard', { deckId: deck.id, color, text }, done));
        },
        askDelete: (deckId) => update({ confirmDelete: deckId }),
        deleteDeck(deckId) {
            commands.send(
                (timed, done) => timed.emit('deleteDeck', { deckId }, done),
                () => {
                    state = { ...state, confirmDelete: null };
                },
            );
        },
        exportDeck(deckId) {
            commands.send((timed, done) =>
                timed.emit('exportDeck', { deckId }, (error, answer) => {
                    if (!error && answer.ok) files.download(answer.fileName, answer.json);
                    done(error, answer);
                }),
            );
        },
        async importFile(file) {
            const json = await files.read(file);
            if (json === 'TOO_BIG') {
                options.notify(t('decks.tooBig'));
                return;
            }
            commands.send((timed, done) =>
                timed.emit('importDeck', { json }, (error, answer) => {
                    if (!error && answer.ok) {
                        const { deckId, name, imported, skipped } = answer;
                        state = { ...state, importResult: { deckId, name, imported, skipped } };
                    }
                    done(error, answer);
                }),
            );
        },
    };

    return {
        get state() {
            return state;
        },
        act,
        sync(catalogVersion) {
            const changed = version !== catalogVersion;
            version = catalogVersion;
            if (changed && state.open) refresh(state.open.id);
        },
        reset() {
            state = emptyDeckEditorState();
        },
    };
}
