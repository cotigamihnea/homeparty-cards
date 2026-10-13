// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { blackCardEl, textSize, whiteCardEl } from '../../src/client/ui/cards.js';

describe('textSize', () => {
    it('sorts card text into four lengths so long cards get smaller type', () => {
        expect(textSize('Bees?')).toBe('s');
        expect(textSize('A sad handjob from a man who has seen too much of this world.')).toBe('m');
        expect(textSize('x'.repeat(120))).toBe('l');
        expect(textSize('x'.repeat(200))).toBe('xl');
        expect(textSize('x'.repeat(300))).toBe('xxl');
        expect(textSize('x'.repeat(400))).toBe('xxxl');
    });

    it('counts each extra answer on a Pick 2/3 card as room taken (its own lines and number)', () => {
        expect(textSize('x'.repeat(50))).toBe('m');
        expect(textSize('x'.repeat(50), 3)).toBe('l');
    });

    it('counts a blank like a short word', () => {
        expect(textSize('_'.repeat(40))).toBe('s');
        expect(textSize(`${'x'.repeat(42)} _`)).toBe('m');
    });
});

describe('card elements', () => {
    it('builds a black card with its prompt, size, Pick badge and mark', () => {
        const card = blackCardEl({ text: 'What’s that smell? _ and _.', pick: 2 });
        expect(card.className).toContain('card card-black');
        expect(card.dataset.size).toBe('s');
        expect(card.querySelector('.pick-badge')?.textContent).toBe('Pick 2');
        expect(card.querySelector('.card-mark')).not.toBeNull();
    });

    it('builds a white card; several answers are numbered in order', () => {
        const one = whiteCardEl(['Bees?']);
        expect(one.className).toContain('card card-white');
        expect(one.querySelectorAll('.card-answer-number')).toHaveLength(0);
        const two = whiteCardEl(['Bees?', 'A windmill full of corpses.']);
        expect([...two.querySelectorAll('.card-answer-number')].map((n) => n.textContent)).toEqual(['1', '2']);
    });

    it('keeps card text as text', () => {
        const card = whiteCardEl(['<img src=x onerror=alert(1)>']);
        expect(card.querySelector('img')).toBeNull();
        expect(card.textContent).toContain('<img src=x onerror=alert(1)>');
    });
});
