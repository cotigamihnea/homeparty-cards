// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openBlankWriter } from '../../src/client/phone/blankWriter.js';
import { el } from '../../src/client/ui/dom.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';

setLanguage('en');

function open(initial = '') {
    const app = el('div', { attrs: { id: 'app' } });
    document.body.replaceChildren(app);
    const onUse = vi.fn();
    const onClose = vi.fn();
    const preview = vi.fn((text: string) => el('p', { class: 'preview', text: `Preview: ${text}` }));
    const writer = openBlankWriter({ initial, preview, onUse, onClose });
    const textarea = document.querySelector<HTMLTextAreaElement>('.blank-writer textarea')!;
    const use = document.querySelector<HTMLButtonElement>('#blank-use')!;
    const type = (text: string) => {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input'));
    };
    return { app, writer, textarea, use, type, onUse, onClose, preview };
}

afterEach(() => document.body.replaceChildren());

describe('the blank card writer', () => {
    it('opens over the screen but outside it, so a re-render of the screen leaves the typing alone', () => {
        const { app, textarea } = open();
        expect(document.querySelector('.blank-writer')?.getAttribute('role')).toBe('dialog');
        expect(app.contains(textarea)).toBe(false);
        expect(document.activeElement).toBe(textarea);
        expect(textarea.maxLength).toBe(80);
    });

    it('previews the card and counts the characters as you type, and only takes an answer with something in it', () => {
        const { type, use, preview } = open();
        expect(use.disabled).toBe(true);
        type('  My own   words');
        expect(preview).toHaveBeenLastCalledWith('My own words');
        expect(document.querySelector('.preview')?.textContent).toBe('Preview: My own words');
        expect(document.querySelector('.blank-writer-count')?.textContent).toBe('12 / 80');
        expect(use.disabled).toBe(false);
        type('   ');
        expect(use.disabled).toBe(true);
    });

    it('uses the cleaned-up answer on the button or on Enter, never adding a line break, then closes', () => {
        const byButton = open('Old words');
        expect(byButton.textarea.value).toBe('Old words');
        byButton.type('Grandma ');
        byButton.use.click();
        expect(byButton.onUse).toHaveBeenCalledExactlyOnceWith('Grandma');
        expect(document.querySelector('.blank-writer')).toBeNull();

        const byEnter = open();
        byEnter.type('Grandpa');
        const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
        byEnter.textarea.dispatchEvent(enter);
        expect(enter.defaultPrevented).toBe(true);
        expect(byEnter.onUse).toHaveBeenCalledExactlyOnceWith('Grandpa');
        expect(byEnter.onClose).not.toHaveBeenCalled();
    });

    it('shows what the phone screen behind it would: the countdown and any pause', () => {
        const { writer } = open();
        writer.setStatus([el('span', { class: 'countdown', text: '42' }), null]);
        expect(document.querySelector('.blank-writer-status')?.textContent).toBe('42');
        writer.setStatus([el('p', { class: 'pause-banner', text: 'Paused' })]);
        expect(document.querySelector('.blank-writer-status')?.textContent).toBe('Paused');
    });

    it('lets a keyboard finish composing a word before Enter uses the answer', () => {
        const { type, textarea, onUse } = open();
        type('Kanji');
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true }));
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, cancelable: true }));
        expect(onUse).not.toHaveBeenCalled();
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
        expect(onUse).toHaveBeenCalledWith('Kanji');
    });

    it('closes on Cancel or Escape, and can be closed from outside', () => {
        const first = open();
        document.querySelector<HTMLButtonElement>('#blank-cancel')!.click();
        expect(first.onClose).toHaveBeenCalledOnce();
        expect(document.querySelector('.blank-writer')).toBeNull();

        const second = open();
        second.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(second.onClose).toHaveBeenCalledOnce();

        const third = open();
        third.writer.close();
        expect(document.querySelector('.blank-writer')).toBeNull();
        expect(third.onClose).not.toHaveBeenCalled();
    });
});
