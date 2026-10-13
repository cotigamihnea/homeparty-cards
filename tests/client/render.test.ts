// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { el } from '../../src/client/ui/dom.js';
import { replaceContent } from '../../src/client/ui/render.js';

function screen(): HTMLElement {
    return el('div', {}, [
        el('input', { attrs: { id: 'pack-base', type: 'checkbox' } }),
        el('div', { attrs: { 'data-scroll-key': 'packs' } }, [el('p', { text: 'long list' })]),
    ]);
}

describe('replaceContent', () => {
    it('puts the focus back on the new element with the same id', () => {
        const root = el('main');
        document.body.replaceChildren(root);
        root.replaceChildren(screen());
        document.getElementById('pack-base')?.focus();
        const next = screen();
        replaceContent(root, next);
        expect(document.activeElement).toBe(next.querySelector('#pack-base'));
    });

    it('keeps the scroll position of scrolling panels', () => {
        const root = el('main');
        document.body.replaceChildren(root);
        root.replaceChildren(screen());
        root.querySelector<HTMLElement>('[data-scroll-key="packs"]')!.scrollTop = 240;
        const next = screen();
        replaceContent(root, next);
        expect(next.querySelector<HTMLElement>('[data-scroll-key="packs"]')!.scrollTop).toBe(240);
    });

    it('leaves the focus alone when it was somewhere else on the page', () => {
        const root = el('main');
        const outside = el('button', { attrs: { id: 'outside' } });
        document.body.replaceChildren(root, outside);
        root.replaceChildren(screen());
        outside.focus();
        replaceContent(root, screen());
        expect(document.activeElement).toBe(outside);
    });

    describe('while someone types', () => {
        function typing(label: string, value: string): HTMLElement {
            const field = el('textarea', { attrs: { id: 'card', placeholder: label } });
            field.value = value;
            return el('div', { class: `screen ${label}` }, [
                el('p', { text: label }),
                el('div', { class: 'box' }, [field, el('span', { attrs: { id: 'count' }, text: label })]),
                el('button', { attrs: { id: 'add' }, text: label }),
            ]);
        }

        function focusedField(): HTMLTextAreaElement {
            const root = el('main');
            document.body.replaceChildren(root);
            root.replaceChildren(typing('one', 'Why'));
            const field = document.getElementById('card') as HTMLTextAreaElement;
            field.focus();
            field.value = 'Why _';
            field.setSelectionRange(5, 5);
            return field;
        }

        it('keeps the field itself, so the keyboard and the caret stay, and replaces everything around it', () => {
            const field = focusedField();
            let blurs = 0;
            field.addEventListener('blur', () => blurs++);
            replaceContent(document.querySelector('main')!, typing('two', 'Why _'));
            expect(document.getElementById('card')).toBe(field);
            expect(document.activeElement).toBe(field);
            expect(blurs).toBe(0);
            expect([field.value, field.selectionStart]).toEqual(['Why _', 5]);
            expect(field.getAttribute('placeholder')).toBe('two');
            expect(document.querySelector('.screen')!.className).toBe('screen two');
            expect(document.querySelector('p')!.textContent).toBe('two');
            expect(document.getElementById('count')!.textContent).toBe('two');
            expect(document.getElementById('add')!.textContent).toBe('two');
        });

        it('takes a value the screen changed on purpose, such as an empty box after a card was added', () => {
            const field = focusedField();
            replaceContent(document.querySelector('main')!, typing('two', ''));
            expect(document.getElementById('card')).toBe(field);
            expect(field.value).toBe('');
        });

        it('rebuilds as before when the new screen has no such field', () => {
            const field = focusedField();
            const other = el('div', {}, [el('p', { text: 'game started' })]);
            replaceContent(document.querySelector('main')!, other);
            expect(field.isConnected).toBe(false);
            expect(document.querySelector('main')!.textContent).toBe('game started');
        });
    });

    describe('while a finger or the mouse is down', () => {
        afterEach(() => {
            document.dispatchEvent(new Event('pointercancel'));
            vi.useRealTimers();
        });

        it('waits until the tap is over, so the button pressed is the one clicked; then shows the latest', () => {
            vi.useFakeTimers();
            const root = el('main');
            document.body.replaceChildren(root);
            const pressed = el('button', { attrs: { id: 'tab' }, text: 'old' });
            root.replaceChildren(pressed);
            pressed.dispatchEvent(new Event('pointerdown', { bubbles: true }));
            replaceContent(root, el('p', { text: 'first update' }));
            replaceContent(root, el('p', { text: 'second update' }));
            expect(pressed.isConnected).toBe(true);
            document.dispatchEvent(new Event('pointerup'));
            expect(pressed.isConnected).toBe(true);
            vi.runAllTimers();
            expect(root.textContent).toBe('second update');
        });

        it('drops a held update once the tap itself has drawn a newer screen', () => {
            vi.useFakeTimers();
            const root = el('main');
            document.body.replaceChildren(root);
            root.replaceChildren(el('button', { attrs: { id: 'tab' } }));
            root.firstElementChild!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
            replaceContent(root, el('p', { text: 'stale' }));
            document.dispatchEvent(new Event('pointerup'));
            replaceContent(root, el('p', { text: 'after the click' }));
            vi.runAllTimers();
            expect(root.textContent).toBe('after the click');
        });

        it('a drag that turns into a scroll lets the update through', () => {
            vi.useFakeTimers();
            const root = el('main');
            document.body.replaceChildren(root);
            root.replaceChildren(el('ul', {}, [el('li', { text: 'card' })]));
            root.firstElementChild!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
            replaceContent(root, el('p', { text: 'new' }));
            document.dispatchEvent(new Event('pointercancel'));
            vi.runAllTimers();
            expect(root.textContent).toBe('new');
        });
    });
});
