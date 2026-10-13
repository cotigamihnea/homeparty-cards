// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { emptyDeckEditorState, type DeckActions, type DeckEditorState } from '../../src/client/ui/decks/deckEditor.js';
import { deckEditorView, deckList } from '../../src/client/ui/decks/deckViews.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import type { CustomDeck } from '../../src/shared/customCards.js';
import type { PackSummary } from '../../src/shared/packs.js';

setLanguage('en');

const DECKS: PackSummary[] = [
    { id: 'custom-0000000a', name: 'Office Party', kind: 'custom', white: 13, black: 4 },
    { id: 'custom-0000000b', name: '<b>x</b>', kind: 'custom', white: 0, black: 1 },
];
const DECK: CustomDeck = {
    id: 'custom-0000000a',
    name: 'Office Party',
    white: ['A stapler.', 'Free cake.'],
    black: [
        { text: 'What did HR find in _?', pick: 1 },
        { text: '_ meets _.', pick: 2 },
    ],
};

function actions(): DeckActions {
    return {
        setDraft: vi.fn(),
        create: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
        rename: vi.fn(),
        setTab: vi.fn(),
        addBlank: vi.fn(),
        addCard: vi.fn(),
        startEdit: vi.fn(),
        saveEdit: vi.fn(),
        cancelEdit: vi.fn(),
        removeCard: vi.fn(),
        askDelete: vi.fn(),
        deleteDeck: vi.fn(),
        exportDeck: vi.fn(),
        importFile: vi.fn(),
    };
}

const state = (changes: Partial<DeckEditorState> = {}): DeckEditorState => ({ ...emptyDeckEditorState(), ...changes });
const button = (root: HTMLElement, name: string) =>
    [...root.querySelectorAll('button')].find((node) => node.textContent === name);

describe('the deck list', () => {
    it('shows each deck with its counts, and Edit, Export and Delete', () => {
        const act = actions();
        const list = deckList(DECKS, { state: state(), pending: false, act });
        const rows = list.querySelectorAll('.deck-row');
        expect(rows).toHaveLength(2);
        expect(rows[0]!.textContent).toContain('Office Party');
        expect(rows[0]!.textContent).toContain('13 white, 4 black');
        expect(rows[1]!.querySelector('.deck-row-name')!.textContent).toBe('<b>x</b>');
        expect(rows[1]!.querySelector('b')).toBeNull();
        button(rows[0] as HTMLElement, 'Edit')!.click();
        expect(act.open).toHaveBeenCalledWith('custom-0000000a');
        button(rows[0] as HTMLElement, 'Export')!.click();
        expect(act.exportDeck).toHaveBeenCalledWith('custom-0000000a');
        button(rows[0] as HTMLElement, 'Delete')!.click();
        expect(act.askDelete).toHaveBeenCalledWith('custom-0000000a');
    });

    it('asks before deleting, naming the deck', () => {
        const act = actions();
        const list = deckList(DECKS, { state: state({ confirmDelete: 'custom-0000000a' }), pending: false, act });
        const row = list.querySelector('.deck-row') as HTMLElement;
        expect(row.textContent).toContain('Delete “Office Party”? This can’t be undone.');
        button(row, 'Delete')!.click();
        expect(act.deleteDeck).toHaveBeenCalledWith('custom-0000000a');
        button(row, 'Cancel')!.click();
        expect(act.askDelete).toHaveBeenCalledWith(null);
    });

    it('invites a first deck when there is none, and offers to create or import', () => {
        const act = actions();
        const list = deckList([], { state: state(), pending: false, act });
        expect(list.textContent).toContain('No decks yet.');
        const name = list.querySelector<HTMLInputElement>('#deck-new-name')!;
        expect(name).not.toBeNull();
        button(list, 'Create')!.click();
        expect(act.create).toHaveBeenCalled();
        const file = list.querySelector<HTMLInputElement>('#deck-import')!;
        expect(file.type).toBe('file');
        expect(file.accept).toContain('.json');
    });

    it('tells how an import went', () => {
        const result = { deckId: 'custom-0000000c', name: 'Copied', imported: 3, skipped: 1 };
        const list = deckList(DECKS, { state: state({ importResult: result }), pending: false, act: actions() });
        const status = list.querySelector('[role="status"]')!;
        expect(status.textContent).toContain('Imported 3 cards into “Copied”.');
        expect(status.textContent).toContain('1 card was left out');
    });
});

describe('the deck editor', () => {
    it('shows the white cards, newest first, with Edit and Remove on each', () => {
        const act = actions();
        const name = { text: 'Office Party', start: 12, end: 12 };
        const view = deckEditorView(DECK, { state: state({ tab: 'white', name }), pending: false, act });
        expect(view.querySelector<HTMLInputElement>('#deck-name')!.value).toBe('Office Party');
        expect([...view.querySelectorAll('.deck-card-text')].map((node) => node.textContent)).toEqual([
            'Free cake.',
            'A stapler.',
        ]);
        expect(view.querySelector('#deck-add-blank')).toBeNull();
        expect(view.querySelector('#deck-tab-white')!.getAttribute('aria-pressed')).toBe('true');
        const card = view.querySelector('.deck-card') as HTMLElement;
        button(card, 'Remove')!.click();
        expect(act.removeCard).toHaveBeenCalledWith('white', 'Free cake.');
        button(card, 'Edit')!.click();
        expect(act.startEdit).toHaveBeenCalledWith('white', 'Free cake.');
    });

    it('renames with the Rename button or Enter, never just because the field lost the focus', () => {
        const act = actions();
        const name = { text: 'Office Party!', start: 13, end: 13 };
        const view = deckEditorView(DECK, { state: state({ name }), pending: false, act });
        const field = view.querySelector<HTMLInputElement>('#deck-name')!;
        field.dispatchEvent(new Event('change'));
        field.dispatchEvent(new Event('blur'));
        expect(act.rename).not.toHaveBeenCalled();
        view.querySelector<HTMLButtonElement>('#deck-rename')!.click();
        expect(act.rename).toHaveBeenCalledTimes(1);
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(act.rename).toHaveBeenCalledTimes(2);
    });

    it('on the black tab, shows blanks and the Pick, and offers Add blank', () => {
        const act = actions();
        const view = deckEditorView(DECK, { state: state({ tab: 'black' }), pending: false, act });
        expect(view.querySelectorAll('.deck-card')).toHaveLength(2);
        expect(view.querySelector('.deck-card .blank')).not.toBeNull();
        expect(view.querySelector('.pick-badge')!.textContent).toBe('Pick 2');
        view.querySelector<HTMLButtonElement>('#deck-add-blank')!.click();
        expect(act.addBlank).toHaveBeenCalled();
        view.querySelector<HTMLButtonElement>('#deck-tab-white')!.click();
        expect(act.setTab).toHaveBeenCalledWith('white');
    });

    it('keeps what is typed, and its caret, across a re-render', () => {
        const act = actions();
        const card = { text: 'Why is _ here', start: 7, end: 7 };
        const view = deckEditorView(DECK, { state: state({ tab: 'black', card }), pending: false, act });
        const box = view.querySelector<HTMLTextAreaElement>('#deck-card-text')!;
        expect(box.value).toBe('Why is _ here');
        expect([box.selectionStart, box.selectionEnd]).toEqual([7, 7]);
        box.value = 'Why is _ here?';
        box.setSelectionRange(14, 14);
        box.dispatchEvent(new Event('input'));
        expect(act.setDraft).toHaveBeenCalledWith('card', { text: 'Why is _ here?', start: 14, end: 14 });
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(act.addCard).toHaveBeenCalled();
    });

    it('edits a card in place', () => {
        const act = actions();
        const editing = {
            color: 'white' as const,
            oldText: 'A stapler.',
            draft: { text: 'A stapler!', start: 0, end: 0 },
        };
        const view = deckEditorView(DECK, { state: state({ tab: 'white', editing }), pending: false, act });
        expect(view.querySelector<HTMLTextAreaElement>('#deck-edit-text')!.value).toBe('A stapler!');
        view.querySelector<HTMLButtonElement>('#deck-edit-save')!.click();
        expect(act.saveEdit).toHaveBeenCalled();
        view.querySelector<HTMLButtonElement>('#deck-edit-cancel')!.click();
        expect(act.cancelEdit).toHaveBeenCalled();
    });
});
