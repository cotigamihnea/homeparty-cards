import { NAME_MAX_LENGTH } from '../../shared/constants.js';
import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';
import { brandStack } from './brand.js';

export interface JoinScreen {
    readonly value: string;
    setPending(pending: boolean): void;
    showError(message: string | null): void;
}

export function buildJoinScreen(
    root: HTMLElement,
    options: { initialName: string; onSubmit: (rawName: string) => void },
): JoinScreen {
    const input = el('input', {
        class: 'name-input',
        attrs: {
            id: 'name-input',
            name: 'name',
            type: 'text',
            autocomplete: 'nickname',
            autocapitalize: 'words',
            enterkeyhint: 'go',
            spellcheck: 'false',
            'aria-describedby': 'name-hint name-error',
        },
    });
    input.value = options.initialName;
    const error = el('p', { class: 'form-error', attrs: { id: 'name-error', role: 'alert' } });
    const button = el('button', { class: 'btn btn-block', attrs: { type: 'submit' }, text: t('phone.join') });
    const form = el('form', { class: 'join-form', attrs: { novalidate: '' } }, [
        el('label', { class: 'field-label', attrs: { for: 'name-input' }, text: t('phone.nameLabel') }),
        input,
        el('p', {
            class: 'field-hint',
            attrs: { id: 'name-hint' },
            text: t('phone.nameHint', { max: NAME_MAX_LENGTH }),
        }),
        error,
        button,
    ]);
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        options.onSubmit(input.value);
    });
    input.addEventListener('input', () => {
        error.textContent = '';
    });
    root.replaceChildren(
        el('div', { class: 'phone-screen join-screen' }, [
            brandStack(),
            form,
            el('p', { class: 'unofficial', text: t('unofficial') }),
        ]),
    );
    return {
        get value() {
            return input.value;
        },
        setPending(pending) {
            button.disabled = pending;
            button.textContent = pending ? t('phone.joining') : t('phone.join');
            input.readOnly = pending;
        },
        showError(message) {
            error.textContent = message ?? '';
            if (message) input.focus();
        },
    };
}
