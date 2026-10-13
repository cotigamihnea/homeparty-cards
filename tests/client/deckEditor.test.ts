// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createDeckEditor, type DeckFiles } from '../../src/client/ui/decks/deckEditor.js';
import { readTextFile } from '../../src/client/ui/decks/files.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import type { Commands, GameSocket } from '../../src/client/ui/socket.js';
import type { CustomDeck } from '../../src/shared/customCards.js';

setLanguage('en');

const DECK: CustomDeck = { id: 'custom-0000000a', name: 'Office', white: ['A.'], black: [] };

/** A server that answers every command at once, and remembers what it was sent. */
function fakeServer(answers: Record<string, (payload: never) => unknown> = {}) {
    const sent: [string, unknown][] = [];
    const timed = {
        emit(event: string, payload: unknown, callback: (error: Error | null, response: unknown) => void) {
            sent.push([event, payload]);
            callback(null, answers[event]?.(payload as never) ?? { ok: true });
        },
    };
    const socket = { timeout: () => timed } as unknown as GameSocket;
    const commands = {
        send(emit, onOk) {
            emit(timed as never, (error, response) => {
                if (!error && response.ok) onOk?.();
            });
        },
        admin() {},
    } satisfies Commands;
    return { socket, commands, sent };
}

function files() {
    return { download: vi.fn<DeckFiles['download']>(), read: readTextFile } satisfies DeckFiles;
}

describe('the deck editor', () => {
    it('opens a deck, adds to the tab it is on, and clears the box', () => {
        const server = fakeServer({ getDeck: () => ({ ok: true, deck: DECK }) });
        const editor = createDeckEditor(server.socket, server.commands, () => {}, { files: files(), notify: () => {} });
        editor.act.open(DECK.id);
        expect(editor.state.open).toEqual(DECK);
        editor.act.setTab('black');
        editor.act.setDraft('card', { text: 'Why _?', start: 6, end: 6 });
        editor.act.addCard();
        expect(server.sent.at(-1)).toEqual(['addDeckCard', { deckId: DECK.id, color: 'black', text: 'Why _?' }]);
        expect(editor.state.card.text).toBe('');
    });

    it('keeps what was typed after Add when the answer comes back, and gives back a refused card', () => {
        const answers: ((response: unknown) => void)[] = [];
        const timed = {
            emit(event: string, payload: unknown, callback: (error: Error | null, response: unknown) => void) {
                if (event === 'getDeck') return callback(null, { ok: true, deck: DECK });
                answers.push((response) => callback(null, response));
            },
        };
        const commands = {
            send(emit, onOk) {
                emit(timed as never, (error, response) => {
                    if (!error && response.ok) onOk?.();
                });
            },
            admin() {},
        } satisfies Commands;
        const socket = { timeout: () => timed } as unknown as GameSocket;
        const editor = createDeckEditor(socket, commands, () => {}, { files: files(), notify: () => {} });
        editor.act.open(DECK.id);
        editor.act.setDraft('card', { text: 'First.', start: 6, end: 6 });
        editor.act.addCard();
        editor.act.setDraft('card', { text: 'Sec', start: 3, end: 3 });
        answers[0]!({ ok: true });
        expect(editor.state.card.text).toBe('Sec');
        editor.act.setDraft('card', { text: 'Dup.', start: 4, end: 4 });
        editor.act.addCard();
        expect(editor.state.card.text).toBe('');
        answers[1]!({ ok: false, reason: 'CARD_DUPLICATE' });
        expect(editor.state.card.text).toBe('Dup.');
    });

    it('puts a blank where the caret is, and the caret after it', () => {
        const server = fakeServer({ getDeck: () => ({ ok: true, deck: DECK }) });
        const editor = createDeckEditor(server.socket, server.commands, () => {}, { files: files(), notify: () => {} });
        editor.act.open(DECK.id);
        editor.act.setTab('black');
        editor.act.setDraft('card', { text: 'Why is  here?', start: 7, end: 7 });
        editor.act.addBlank();
        expect(editor.state.card).toEqual({ text: 'Why is _____ here?', start: 12, end: 12 });
    });

    it('fetches the open deck again when the decks change', () => {
        let version = 0;
        const server = fakeServer({ getDeck: () => ({ ok: true, deck: { ...DECK, name: `Office ${version}` } }) });
        const render = vi.fn();
        const editor = createDeckEditor(server.socket, server.commands, render, { files: files(), notify: () => {} });
        editor.sync(1);
        editor.act.open(DECK.id);
        version = 2;
        editor.sync(1);
        expect(editor.state.open?.name).toBe('Office 0');
        editor.sync(2);
        expect(editor.state.open?.name).toBe('Office 2');
    });

    it('goes back to the list when the open deck was deleted elsewhere', () => {
        let gone = false;
        const server = fakeServer({
            getDeck: () => (gone ? { ok: false, reason: 'DECK_NOT_FOUND' } : { ok: true, deck: DECK }),
        });
        const editor = createDeckEditor(server.socket, server.commands, () => {}, { files: files(), notify: () => {} });
        editor.act.open(DECK.id);
        gone = true;
        editor.sync(5);
        expect(editor.state.open).toBeNull();
    });

    it('keeps a name being typed when the deck arrives again, but follows a rename made elsewhere', () => {
        let deck = DECK;
        const server = fakeServer({ getDeck: () => ({ ok: true, deck }) });
        const editor = createDeckEditor(server.socket, server.commands, () => {}, { files: files(), notify: () => {} });
        editor.act.open(DECK.id);
        editor.act.setDraft('name', { text: 'Office Pa', start: 9, end: 9 });
        editor.sync(1);
        expect(editor.state.name.text).toBe('Office Pa');
        editor.act.setDraft('name', { text: 'Office', start: 6, end: 6 });
        deck = { ...DECK, name: 'Renamed' };
        editor.sync(2);
        expect(editor.state.name.text).toBe('Renamed');
    });

    it('going back to the list saves a new name that was typed but not confirmed', () => {
        const server = fakeServer({ getDeck: () => ({ ok: true, deck: DECK }) });
        const editor = createDeckEditor(server.socket, server.commands, () => {}, { files: files(), notify: () => {} });
        editor.act.open(DECK.id);
        editor.act.setDraft('name', { text: 'Office Party', start: 12, end: 12 });
        editor.act.close();
        expect(server.sent.at(-1)).toEqual(['renameDeck', { deckId: DECK.id, name: 'Office Party' }]);
        expect(editor.state.open).toBeNull();
        const sent = server.sent.length;
        editor.act.open(DECK.id);
        editor.act.close();
        expect(server.sent.filter(([event]) => event === 'renameDeck')).toHaveLength(1);
        expect(server.sent.length).toBe(sent + 1);
    });

    it('saves an export under the name the server gives', () => {
        const server = fakeServer({ exportDeck: () => ({ ok: true, fileName: 'Office.cah-deck.json', json: '{}' }) });
        const saved = files();
        const editor = createDeckEditor(server.socket, server.commands, () => {}, { files: saved, notify: () => {} });
        editor.act.exportDeck(DECK.id);
        expect(saved.download).toHaveBeenCalledWith('Office.cah-deck.json', '{}');
    });

    it('imports a file and says how it went; a file too big never leaves the phone', async () => {
        const result = { ok: true, deckId: 'custom-0000000c', name: 'Copy', imported: 2, skipped: 0 };
        const server = fakeServer({ importDeck: () => result });
        const notify = vi.fn();
        const editor = createDeckEditor(server.socket, server.commands, () => {}, { files: files(), notify });
        await editor.act.importFile(new File(['{"format":"homeparty-cards-deck"}'], 'deck.json'));
        expect(server.sent.at(-1)).toEqual(['importDeck', { json: '{"format":"homeparty-cards-deck"}' }]);
        expect(editor.state.importResult).toEqual({ deckId: 'custom-0000000c', name: 'Copy', imported: 2, skipped: 0 });

        const sentBefore = server.sent.length;
        await editor.act.importFile(new File(['x'.repeat(256 * 1024 + 1)], 'big.json'));
        expect(server.sent).toHaveLength(sentBefore);
        expect(notify).toHaveBeenCalledWith('That file is too big to be a deck.');
    });

    it('creating a deck opens it', () => {
        const server = fakeServer({
            createDeck: () => ({ ok: true, deckId: DECK.id }),
            getDeck: () => ({ ok: true, deck: DECK }),
        });
        const editor = createDeckEditor(server.socket, server.commands, () => {}, { files: files(), notify: () => {} });
        editor.act.setDraft('newName', { text: 'Office', start: 6, end: 6 });
        editor.act.create();
        expect(server.sent[0]).toEqual(['createDeck', { name: 'Office' }]);
        expect(editor.state.open).toEqual(DECK);
        expect(editor.state.newName.text).toBe('');
    });
});
