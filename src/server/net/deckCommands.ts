import type { Answer } from '../../shared/events.js';
import type { DeckStore } from '../cards/customDecks.js';
import { actorOf } from './commands.js';
import type { GameSocket, Room } from './room.js';
import { onPayload } from './socketEvents.js';
import {
    isDeckCardPayload,
    isDeckIdPayload,
    isDeckNamePayload,
    isEditDeckCardPayload,
    isImportDeckPayload,
    isRenameDeckPayload,
} from './validate.js';

/** The custom deck commands (GAME_DESIGN §12): the VIP's phone or the laptop, in the lobby only. */
export function registerDeckCommands(socket: GameSocket, room: Room, decks: DeckStore): void {
    /** Checks who and when, runs the work, and tells every screen when the decks changed. */
    function asEditor<T>(work: () => Answer<T>, changes = true): Answer<T> {
        const by = actorOf(socket);
        const blocked = typeof by === 'string' ? by : room.deckAccess(by);
        if (blocked) return { ok: false, reason: blocked };
        const answer = work();
        if (answer.ok && changes) room.decksChanged();
        return answer;
    }

    onPayload(socket, 'getDeck', isDeckIdPayload, ({ deckId }) =>
        asEditor(() => {
            const deck = decks.get(deckId);
            return deck ? { ok: true, deck } : { ok: false, reason: 'DECK_NOT_FOUND' };
        }, false),
    );
    onPayload(socket, 'createDeck', isDeckNamePayload, ({ name }) => asEditor(() => decks.create(name)));
    onPayload(socket, 'renameDeck', isRenameDeckPayload, ({ deckId, name }) =>
        asEditor(() => decks.rename(deckId, name)),
    );
    onPayload(socket, 'addDeckCard', isDeckCardPayload, ({ deckId, color, text }) =>
        asEditor(() => decks.addCard(deckId, color, text)),
    );
    onPayload(socket, 'editDeckCard', isEditDeckCardPayload, ({ deckId, color, oldText, text }) =>
        asEditor(() => decks.editCard(deckId, color, oldText, text)),
    );
    onPayload(socket, 'removeDeckCard', isDeckCardPayload, ({ deckId, color, text }) =>
        asEditor(() => decks.removeCard(deckId, color, text)),
    );
    onPayload(socket, 'deleteDeck', isDeckIdPayload, ({ deckId }) => asEditor(() => decks.remove(deckId)));
    onPayload(socket, 'exportDeck', isDeckIdPayload, ({ deckId }) => asEditor(() => decks.exportDeck(deckId), false));
    onPayload(socket, 'importDeck', isImportDeckPayload, ({ json }) => asEditor(() => decks.importDeck(json)));
    onPayload(socket, 'saveFeverDeck', isDeckNamePayload, ({ name }) => {
        const by = actorOf(socket);
        return typeof by === 'string' ? { ok: false, reason: by } : room.saveFever(by, name, decks);
    });
}
