import { parseCardText } from '../../../shared/cardText.js';
import { ADD_BLANK, CUSTOM_DECK_LIMITS, type CardColor, type CustomBlackCard } from '../../../shared/customCards.js';
import { nameLength } from '../../../shared/names.js';
import { textButton } from '../button.js';
import { pickBadge, runsToNodes } from '../cardText.js';
import { classNames, el } from '../dom.js';
import { t } from '../i18n/index.js';

/** Text being typed, with its caret, so a re-render (any view update) never loses either. */
export interface Draft {
    text: string;
    start: number;
    end: number;
}

export const emptyDraft = (text = ''): Draft => ({ text, start: text.length, end: text.length });

/** "Add blank": a blank where the caret is, and the caret after it. */
export function insertBlank({ text, start, end }: Draft): Draft {
    const caret = start + ADD_BLANK.length;
    return { text: text.slice(0, start) + ADD_BLANK + text.slice(end), start: caret, end: caret };
}

/** Writing cards: the colour tab, the box being written, and the card being edited in place. */
export interface CardWriterState {
    tab: CardColor;
    card: Draft;
    editing: { color: CardColor; oldText: string; draft: Draft } | null;
}

export interface CardWriterActions {
    /** Remembers typing; no re-render, so the field keeps the keyboard. */
    setDraft(field: 'card' | 'edit', draft: Draft): void;
    setTab(tab: CardColor): void;
    addBlank(): void;
    addCard(): void;
    startEdit(color: CardColor, text: string): void;
    saveEdit(): void;
    cancelEdit(): void;
    removeCard(color: CardColor, text: string): void;
}

export interface CardWriterContext {
    state: CardWriterState;
    pending: boolean;
    act: CardWriterActions;
}

export interface CardWriterOptions {
    /** The prefix of the element ids ("deck", "fever"): stable, so the focus survives re-renders. */
    ids: string;
    /** "White cards (4)", or "White cards (4 of 13)". */
    tabLabel(color: CardColor, count: number): string;
    /** When a colour takes no more cards (a Custom Fever quota), the line shown instead of its box. */
    fullLine?(color: CardColor): string | null;
}

export interface WrittenCards {
    white: readonly string[];
    black: readonly CustomBlackCard[];
}

interface FieldOptions {
    id: string;
    draft: Draft;
    onDraft(draft: Draft): void;
    attrs?: Record<string, string>;
    onEnter?: () => void;
    onEscape?: () => void;
    /** The length line, kept up to date while typing without a re-render (found by id: the field may outlive it). */
    counter?: { id: string; max: number };
}

/** A text field that hands every keystroke and caret move to the editor, so a re-render never loses them. */
export function boundField<T extends HTMLInputElement | HTMLTextAreaElement>(node: T, options: FieldOptions): T {
    node.id = options.id;
    for (const [name, value] of Object.entries(options.attrs ?? {})) node.setAttribute(name, value);
    node.value = options.draft.text;
    node.setSelectionRange(options.draft.start, options.draft.end);
    const count = () => {
        const counter = options.counter && document.getElementById(options.counter.id);
        if (counter) counter.textContent = lengthText(node.value, options.counter!.max);
    };
    const remember = () => {
        const end = node.value.length;
        options.onDraft({ text: node.value, start: node.selectionStart ?? end, end: node.selectionEnd ?? end });
        count();
    };
    for (const event of ['input', 'keyup', 'click', 'select']) node.addEventListener(event, remember);
    (node as HTMLElement).addEventListener('keydown', (event) => {
        // Enter that finishes an IME composition (keyCode 229) is the keyboard's, not ours.
        const typing = event.isComposing || event.keyCode === 229;
        if (event.key === 'Enter' && !event.shiftKey && !typing && options.onEnter) {
            event.preventDefault();
            remember();
            options.onEnter();
        } else if (event.key === 'Escape' && options.onEscape) {
            event.preventDefault();
            options.onEscape();
        }
    });
    return node;
}

function lengthText(text: string, max: number): string {
    return t('decks.length', { count: nameLength(text.trim()), max });
}

function textArea(options: FieldOptions): HTMLTextAreaElement {
    const node = el('textarea', {
        class: 'deck-input deck-textarea',
        attrs: { rows: '2', enterkeyhint: 'done', autocomplete: 'off' },
    });
    return boundField(node, options);
}

function tabs(cards: WrittenCards, ctx: CardWriterContext, options: CardWriterOptions): HTMLElement {
    const tab = (color: CardColor) => {
        const chosen = ctx.state.tab === color;
        const node = textButton(options.tabLabel(color, cards[color].length), () => ctx.act.setTab(color), {
            ghost: !chosen,
            attrs: { id: `${options.ids}-tab-${color}`, 'aria-pressed': String(chosen) },
        });
        node.classList.add('deck-tab');
        return node;
    };
    return el('div', { class: 'deck-tabs' }, [tab('white'), tab('black')]);
}

function addForm(ctx: CardWriterContext, options: CardWriterOptions): HTMLElement {
    const black = ctx.state.tab === 'black';
    const full = options.fullLine?.(ctx.state.tab) ?? null;
    if (full) return el('p', { class: 'deck-full', attrs: { id: `${options.ids}-full` }, text: full });
    const ids = options.ids;
    const max = black ? CUSTOM_DECK_LIMITS.blackText : CUSTOM_DECK_LIMITS.whiteText;
    const prompt = t(black ? 'decks.writeBlack' : 'decks.writeWhite');
    const counter = el('span', {
        class: 'deck-length',
        attrs: { id: `${ids}-card-length`, 'aria-live': 'polite' },
        text: lengthText(ctx.state.card.text, max),
    });
    const box = textArea({
        id: `${ids}-card-text`,
        draft: ctx.state.card,
        onDraft: (draft) => ctx.act.setDraft('card', draft),
        attrs: {
            placeholder: prompt,
            'aria-label': prompt,
            'aria-describedby': `${ids}-card-help ${ids}-card-length`,
        },
        onEnter: ctx.act.addCard,
        counter: { id: `${ids}-card-length`, max },
    });
    const addBlank = () => {
        ctx.act.addBlank();
        document.getElementById(`${ids}-card-text`)?.focus();
    };
    return el('div', { class: classNames('deck-add', black && 'is-black') }, [
        box,
        el('div', { class: 'deck-add-meta' }, [
            el('p', {
                class: 'deck-hint',
                attrs: { id: `${ids}-card-help` },
                text: t(black ? 'decks.blackHelp' : 'decks.whiteHelp', { max }),
            }),
            counter,
        ]),
        el('div', { class: 'deck-add-actions' }, [
            black
                ? textButton(t('decks.addBlank'), addBlank, { ghost: true, attrs: { id: `${ids}-add-blank` } })
                : null,
            textButton(t('decks.addCard'), ctx.act.addCard, {
                disabled: ctx.pending,
                attrs: { id: `${ids}-add-card` },
            }),
        ]),
    ]);
}

function cardFace(color: CardColor, text: string, pick: number): HTMLElement {
    return el('div', { class: classNames('deck-card-face', color === 'black' ? 'is-black' : 'is-white') }, [
        el('p', { class: 'deck-card-text' }, runsToNodes(parseCardText(text, { blanks: color === 'black' }))),
        color === 'black' ? pickBadge(pick) : null,
    ]);
}

function cardItem(
    color: CardColor,
    card: { text: string; pick: number },
    ctx: CardWriterContext,
    ids: string,
): HTMLElement {
    const editing = ctx.state.editing;
    const className = classNames('deck-card', color === 'black' && 'is-black');
    if (editing?.color === color && editing.oldText === card.text) {
        return el('li', { class: `${className} is-editing` }, [
            textArea({
                id: `${ids}-edit-text`,
                draft: editing.draft,
                onDraft: (draft) => ctx.act.setDraft('edit', draft),
                attrs: { 'aria-label': t('decks.edit') },
                onEnter: ctx.act.saveEdit,
                onEscape: ctx.act.cancelEdit,
            }),
            el('div', { class: 'deck-card-actions' }, [
                textButton(t('decks.save'), ctx.act.saveEdit, {
                    disabled: ctx.pending,
                    attrs: { id: `${ids}-edit-save` },
                }),
                textButton(t('decks.cancel'), ctx.act.cancelEdit, { ghost: true, attrs: { id: `${ids}-edit-cancel` } }),
            ]),
        ]);
    }
    return el('li', { class: className }, [
        cardFace(color, card.text, card.pick),
        el('div', { class: 'deck-card-actions' }, [
            textButton(t('decks.edit'), () => ctx.act.startEdit(color, card.text), { ghost: true }),
            textButton(t('decks.remove'), () => ctx.act.removeCard(color, card.text), {
                ghost: true,
                danger: true,
                disabled: ctx.pending,
            }),
        ]),
    ]);
}

function cardList(cards: WrittenCards, ctx: CardWriterContext, ids: string): HTMLElement {
    const color = ctx.state.tab;
    const list = color === 'white' ? cards.white.map((text) => ({ text, pick: 1 })) : cards.black;
    if (list.length === 0) {
        return el('p', { class: 'deck-hint', text: t(color === 'white' ? 'decks.noWhite' : 'decks.noBlack') });
    }
    // Newest first, right under the box it was written in.
    return el(
        'ul',
        { class: 'deck-cards' },
        list.toReversed().map((card) => cardItem(color, card, ctx, ids)),
    );
}

/** Writing cards (a custom deck, or Custom Fever): the colour tabs, the box to write in, then the cards written. */
export function cardWriter(cards: WrittenCards, ctx: CardWriterContext, options: CardWriterOptions): HTMLElement[] {
    return [tabs(cards, ctx, options), addForm(ctx, options), cardList(cards, ctx, options.ids)];
}
