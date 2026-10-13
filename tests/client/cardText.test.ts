// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { blackCardText, whiteCardText } from '../../src/client/ui/cardText.js';

describe('card text rendering', () => {
    it('keeps hostile text as text: nothing in a card can become HTML', () => {
        const nasty = '<img src=x onerror="alert(1)"> & <b>bold</b>';
        const white = whiteCardText(nasty);
        const black = blackCardText(`${nasty} _.`, [nasty]);
        expect(white.querySelector('img, b')).toBeNull();
        expect(black.querySelector('img, b')).toBeNull();
        expect(white.textContent).toBe(nasty);
        expect(black.querySelector('.answer')?.textContent).toBe(nasty);
    });

    it('shows each blank as a blank, and fills blanks with answers in order', () => {
        const empty = blackCardText('_ + _ = _.');
        expect(empty.querySelectorAll('.blank')).toHaveLength(3);
        const filled = blackCardText('_ + _ = _.', ['Cats.', 'dogs.']);
        expect([...filled.querySelectorAll('.answer')].map((node) => node.textContent)).toEqual(['Cats', 'dogs']);
        expect(filled.querySelectorAll('.blank')).toHaveLength(1);
    });

    it('puts the answer underneath a question that has no blank', () => {
        const card = blackCardText('Why am I sticky?', ['Bees?']);
        expect(card.querySelector('.card-extra .answer')?.textContent).toBe('Bees?');
    });

    it('renders emphasis and line breaks from the card markup', () => {
        const card = whiteCardText('A **big** *deal*\nfor sure');
        expect(card.querySelector('strong')?.textContent).toBe('big');
        expect(card.querySelector('em')?.textContent).toBe('deal');
        expect(card.querySelectorAll('br')).toHaveLength(1);
        expect(card.textContent).toBe('A big dealfor sure');
    });
});
