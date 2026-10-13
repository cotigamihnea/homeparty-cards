import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';
import { closeIcon } from '../ui/icons.js';

export interface DialogFrame {
    /** The id of the title, which names the dialog. */
    titleId: string;
    title: string;
    body: readonly (Node | null)[];
    foot: readonly (Node | null)[];
    /** Keeps the body's scroll across re-renders. */
    scrollKey: string;
    onClose(): void;
}

/** A panel over the TV for the laptop: a titled head with a close button, a scrolling body, and a foot. */
export function dialogFrame(frame: DialogFrame): HTMLElement {
    const close = el(
        'button',
        { class: 'dialog-close', attrs: { type: 'button', id: 'dialog-close', 'aria-label': t('host.close') } },
        [closeIcon()],
    );
    close.addEventListener('click', frame.onClose);
    return el('div', { class: 'dialog-backdrop' }, [
        el(
            'section',
            {
                class: 'settings-dialog',
                attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': frame.titleId },
            },
            [
                el('header', { class: 'dialog-head' }, [
                    el('h2', { attrs: { id: frame.titleId }, text: frame.title }),
                    close,
                ]),
                el('div', { class: 'dialog-body', attrs: { 'data-scroll-key': frame.scrollKey } }, frame.body),
                el('footer', { class: 'dialog-foot' }, frame.foot),
            ],
        ),
    ]);
}
