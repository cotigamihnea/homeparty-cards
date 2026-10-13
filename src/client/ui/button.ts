import { classNames, el } from './dom.js';

export interface ButtonOptions {
    ghost?: boolean;
    /** Full width, as on the phone. */
    block?: boolean;
    disabled?: boolean;
    /** A destructive action (ending the game): styled apart from the everyday buttons. */
    danger?: boolean;
    attrs?: Record<string, string>;
}

/** A `.btn` with a text label, for the TV, the phone and the settings screens they share. */
export function textButton(text: string, onClick: () => void, options: ButtonOptions = {}): HTMLButtonElement {
    const node = el('button', {
        class: classNames(
            'btn',
            options.ghost && 'btn-ghost',
            options.danger && 'btn-danger',
            options.block && 'btn-block',
        ),
        attrs: { type: 'button', ...options.attrs },
        text,
    });
    node.disabled = options.disabled ?? false;
    node.addEventListener('click', onClick);
    return node;
}
