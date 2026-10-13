import type { CardColor, CustomDeck } from '../../../shared/customCards.js';
import type { PackSummary } from '../../../shared/packs.js';
import { textButton } from '../button.js';
import type { PackCatalog } from '../catalog.js';
import { el } from '../dom.js';
import { formatNumber, t } from '../i18n/index.js';
import { boundField, cardWriter } from './cardWriter.js';
import type { DeckActions, DeckEditorState } from './deckEditor.js';

export interface DeckViewContext {
    state: DeckEditorState;
    pending: boolean;
    act: DeckActions;
}

function newDeckForm(ctx: DeckViewContext): HTMLElement {
    const name = boundField(el('input', { class: 'deck-input', attrs: { type: 'text', autocomplete: 'off' } }), {
        id: 'deck-new-name',
        draft: ctx.state.newName,
        onDraft: (draft) => ctx.act.setDraft('newName', draft),
        attrs: { placeholder: t('decks.namePlaceholder') },
        onEnter: ctx.act.create,
    });
    return el('div', { class: 'deck-new' }, [
        el('label', { class: 'settings-label', attrs: { for: 'deck-new-name' }, text: t('decks.newLabel') }),
        el('div', { class: 'deck-new-row' }, [
            name,
            textButton(t('decks.create'), ctx.act.create, { disabled: ctx.pending, attrs: { id: 'deck-create' } }),
        ]),
    ]);
}

/** A button-looking label around a hidden file input: the phone's or the laptop's own file picker. */
function importButton(ctx: DeckViewContext): HTMLElement {
    const input = el('input', {
        class: 'sr-only deck-import',
        attrs: { type: 'file', id: 'deck-import', accept: '.json,application/json' },
    });
    input.disabled = ctx.pending;
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.value = '';
        if (file) void ctx.act.importFile(file);
    });
    return el('label', { class: 'btn btn-ghost btn-block deck-import-label' }, [
        el('span', { text: t('decks.import') }),
        input,
    ]);
}

function importStatus(ctx: DeckViewContext): HTMLElement {
    const result = ctx.state.importResult;
    return el(
        'p',
        { class: 'deck-status', attrs: { role: 'status' } },
        result
            ? [
                  t('decks.imported', { count: result.imported, name: result.name }),
                  result.skipped > 0 ? ` ${t('decks.skipped', { count: result.skipped })}` : null,
              ]
            : [],
    );
}

function deckCounts(white: number, black: number): string {
    return t('packs.cardCounts', { white: formatNumber(white), black: formatNumber(black) });
}

function deckRow(deck: PackSummary, ctx: DeckViewContext): HTMLElement {
    const busy = ctx.pending;
    if (ctx.state.confirmDelete === deck.id) {
        return el('li', { class: 'deck-row is-confirming' }, [
            el('p', { class: 'deck-confirm', text: t('decks.deleteConfirm', { name: deck.name }) }),
            el('div', { class: 'deck-row-actions' }, [
                textButton(t('decks.delete'), () => ctx.act.deleteDeck(deck.id), { danger: true, disabled: busy }),
                textButton(t('decks.cancel'), () => ctx.act.askDelete(null), { ghost: true }),
            ]),
        ]);
    }
    return el('li', { class: 'deck-row' }, [
        el('div', { class: 'deck-row-head' }, [
            el('span', { class: 'deck-row-name', text: deck.name }),
            el('span', { class: 'deck-row-count', text: deckCounts(deck.white, deck.black) }),
        ]),
        el('div', { class: 'deck-row-actions' }, [
            textButton(t('decks.edit'), () => ctx.act.open(deck.id), { ghost: true, disabled: busy }),
            textButton(t('decks.export'), () => ctx.act.exportDeck(deck.id), { ghost: true, disabled: busy }),
            textButton(t('decks.delete'), () => ctx.act.askDelete(deck.id), { ghost: true, danger: true }),
        ]),
    ]);
}

/** The laptop's decks with Edit, Export and Delete, a new deck, and an import (GAME_DESIGN §12). */
export function deckList(decks: readonly PackSummary[], ctx: DeckViewContext): HTMLElement {
    return el('div', { class: 'deck-panel' }, [
        newDeckForm(ctx),
        importButton(ctx),
        importStatus(ctx),
        decks.length === 0
            ? el('p', { class: 'deck-hint', text: t('decks.empty') })
            : el(
                  'ul',
                  { class: 'deck-list' },
                  decks.map((deck) => deckRow(deck, ctx)),
              ),
    ]);
}

function deckTabLabel(color: CardColor, count: number): string {
    return t(color === 'white' ? 'decks.whiteTab' : 'decks.blackTab', { count });
}

/** One deck: its name, white and black cards in two tabs, a box to write the next card, and each card's edits. */
export function deckEditorView(deck: CustomDeck, ctx: DeckViewContext): HTMLElement {
    const name = boundField(el('input', { class: 'deck-input', attrs: { type: 'text', autocomplete: 'off' } }), {
        id: 'deck-name',
        draft: ctx.state.name,
        onDraft: (draft) => ctx.act.setDraft('name', draft),
        onEnter: ctx.act.rename,
    });
    // Renamed on purpose only (the button, Enter, or leaving the deck): never because a tap moved the focus.
    return el('div', { class: 'deck-panel deck-editor' }, [
        el('div', { class: 'deck-field' }, [
            el('label', { class: 'settings-label', attrs: { for: 'deck-name' }, text: t('decks.nameLabel') }),
            el('div', { class: 'deck-new-row' }, [
                name,
                textButton(t('decks.rename'), ctx.act.rename, {
                    ghost: true,
                    disabled: ctx.pending,
                    attrs: { id: 'deck-rename' },
                }),
            ]),
        ]),
        ...cardWriter(deck, ctx, { ids: 'deck', tabLabel: deckTabLabel }),
    ]);
}

/** What the phone panel and the laptop page need around the list and the editor. */
export interface DeckPanelContext {
    catalog: PackCatalog;
    deck: DeckViewContext;
    notice: string | null;
    /** Leaves the decks altogether. */
    close(): void;
    retryCatalog(): void;
}

export function deckPanelTitle(ctx: DeckPanelContext): string {
    return t(ctx.deck.state.open ? 'decks.editTitle' : 'decks.title');
}

/** The open deck's editor, or the deck list once the pack list is in (until then a loading or failure line). */
export function deckPanelBody(ctx: DeckPanelContext): HTMLElement {
    const open = ctx.deck.state.open;
    if (open) return deckEditorView(open, ctx.deck);
    const packs = ctx.catalog.packs;
    if (packs) {
        const decks = packs.filter((pack) => pack.kind === 'custom');
        return deckList(decks, ctx.deck);
    }
    if (ctx.catalog.failed) {
        return el('div', { class: 'panel-status' }, [
            el('p', { class: 'deck-hint', text: t('packs.failed') }),
            textButton(t('packs.retry'), ctx.retryCatalog, { ghost: true, block: true }),
        ]);
    }
    return el('p', { class: 'deck-hint', attrs: { role: 'status' }, text: t('packs.loading') });
}
