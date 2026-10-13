import { BLANK_TEXT_MAX, checkBlankText, normalizeBlankText } from '../../shared/blanks.js';
import { nameLength } from '../../shared/names.js';
import { textButton } from '../ui/button.js';
import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';

export interface BlankWriterOptions {
    /** What the card says so far (empty for a fresh blank). */
    initial: string;
    /** The black card with this answer in its place, redrawn as the player types. */
    preview(text: string): HTMLElement;
    /** The player chose this text (cleaned up); the writer closes itself. */
    onUse(text: string): void;
    /** The player backed out (Cancel or Escape). */
    onClose(): void;
}

export interface BlankWriter {
    /** What the screen behind would show: the answer countdown and a pause, kept in view while writing. */
    setStatus(nodes: readonly (Node | null)[]): void;
    /** Closes without a word to the player, e.g. when answering time is over. */
    close(): void;
}

/**
 * "Write your card": a sheet over the phone screen for a blank card. It lives outside the screen that every view
 * re-renders, so the text field, its caret and the keyboard stay put while other players answer.
 */
export function openBlankWriter(options: BlankWriterOptions): BlankWriter {
    const textarea = el('textarea', {
        class: 'blank-writer-text',
        attrs: {
            id: 'blank-writer-text',
            maxlength: String(BLANK_TEXT_MAX),
            rows: '3',
            enterkeyhint: 'done',
            autocomplete: 'off',
            'aria-describedby': 'blank-writer-count',
        },
    });
    textarea.value = options.initial;
    const preview = el('div', { class: 'blank-writer-preview' });
    const status = el('div', { class: 'blank-writer-status' });
    const count = el('p', { class: 'blank-writer-count', attrs: { id: 'blank-writer-count', 'aria-live': 'polite' } });
    const use = textButton(t('phone.blankUse'), choose, { block: true, attrs: { id: 'blank-use' } });
    const cancel = textButton(t('phone.cancel'), back, { ghost: true, block: true, attrs: { id: 'blank-cancel' } });
    const layer = el(
        'div',
        {
            class: 'blank-writer',
            attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'blank-writer-title' },
        },
        [
            el('div', { class: 'blank-writer-sheet' }, [
                el('div', { class: 'blank-writer-head' }, [
                    el('h2', {
                        class: 'panel-title',
                        attrs: { id: 'blank-writer-title' },
                        text: t('phone.blankTitle'),
                    }),
                    status,
                ]),
                preview,
                el('label', {
                    class: 'blank-writer-label',
                    attrs: { for: 'blank-writer-text' },
                    text: t('phone.blankLabel'),
                }),
                textarea,
                count,
                el('div', { class: 'blank-writer-actions' }, [use, cancel]),
            ]),
        ],
    );
    let open = true;

    function update(): void {
        const text = normalizeBlankText(textarea.value);
        preview.replaceChildren(options.preview(text));
        count.textContent = t('phone.blankCount', { count: nameLength(text), max: BLANK_TEXT_MAX });
        use.disabled = checkBlankText(textarea.value) !== null;
    }

    function close(): void {
        if (!open) return;
        open = false;
        layer.remove();
    }

    function choose(): void {
        if (!open || checkBlankText(textarea.value) !== null) return;
        const text = normalizeBlankText(textarea.value);
        close();
        options.onUse(text);
    }

    function back(): void {
        if (!open) return;
        close();
        options.onClose();
    }

    textarea.addEventListener('input', update);
    textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            // A keyboard still composing a word (IME) confirms it with Enter; that Enter is not "use this answer".
            if (event.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            choose();
        } else if (event.key === 'Escape') {
            back();
        }
    });
    update();
    document.body.append(layer);
    textarea.focus();
    return {
        setStatus: (nodes) => status.replaceChildren(...nodes.filter((node) => node !== null)),
        close,
    };
}
