import type { CardColor } from '../../shared/customCards.js';
import type { WrittenCardView } from '../../shared/views.js';
import { emptyDraft, insertBlank, type CardWriterActions, type CardWriterState } from '../ui/decks/cardWriter.js';
import type { Commands, GameSocket } from '../ui/socket.js';

export interface FeverWriterState extends CardWriterState {
    /** The VIP tapped Start now while someone is still writing, and is asked to confirm. */
    confirmStart: boolean;
}

export interface FeverWriterActions extends CardWriterActions {
    askStart(confirm: boolean): void;
    startNow(): void;
}

export interface FeverWriter {
    readonly state: FeverWriterState;
    readonly act: FeverWriterActions;
    /** Writing is over: next time it opens on a clean page. */
    reset(): void;
}

const emptyState = (): FeverWriterState => ({ tab: 'white', card: emptyDraft(), editing: null, confirmStart: false });

/**
 * Custom Fever on the phone: the player's own cards, written through the server one at a time. The screen names a
 * card by its text (as in the deck editor); the server knows it by its id, found among this player's cards.
 */
export function createFeverWriter(
    _socket: GameSocket,
    commands: Commands,
    render: () => void,
    written: () => readonly WrittenCardView[],
): FeverWriter {
    let state = emptyState();

    function update(changes: Partial<FeverWriterState>): void {
        state = { ...state, ...changes };
        render();
    }

    const idOf = (color: CardColor, text: string) =>
        written().find((card) => card.color === color && card.text === text)?.id;

    const act: FeverWriterActions = {
        setDraft(field, draft) {
            if (field === 'card') state = { ...state, card: draft };
            else if (state.editing) state = { ...state, editing: { ...state.editing, draft } };
        },
        setTab: (tab) => update({ tab, editing: null }),
        addBlank: () => update({ card: insertBlank(state.card) }),
        addCard() {
            // The box empties as the card goes, so the next one can be typed at once; a refused card comes back.
            const card = { color: state.tab, text: state.card.text };
            state = { ...state, card: emptyDraft() };
            commands.send((timed, done) =>
                timed.emit('writeCard', card, (error, answer) => {
                    if ((error || !answer.ok) && state.card.text === '') {
                        state = { ...state, card: emptyDraft(card.text) };
                    }
                    done(error, answer);
                }),
            );
        },
        startEdit: (color, text) => update({ editing: { color, oldText: text, draft: emptyDraft(text) } }),
        saveEdit() {
            const editing = state.editing;
            const cardId = editing && idOf(editing.color, editing.oldText);
            if (!editing || !cardId) return update({ editing: null });
            commands.send(
                (timed, done) => timed.emit('editWrittenCard', { cardId, text: editing.draft.text }, done),
                () => {
                    state = { ...state, editing: null };
                },
            );
        },
        cancelEdit: () => update({ editing: null }),
        removeCard(color, text) {
            const cardId = idOf(color, text);
            if (cardId) commands.send((timed, done) => timed.emit('removeWrittenCard', { cardId }, done));
        },
        askStart: (confirm) => update({ confirmStart: confirm }),
        startNow() {
            state = { ...state, confirmStart: false };
            commands.admin('startNow');
        },
    };

    return {
        get state() {
            return state;
        },
        act,
        reset() {
            state = emptyState();
        },
    };
}
