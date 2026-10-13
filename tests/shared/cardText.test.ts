import { describe, expect, it } from 'vitest';
import { countBlanks, parseCardText, toPlainText, type CardRun } from '../../src/shared/cardText.js';

const text = (value: string, style: { strong?: boolean; em?: boolean } = {}): CardRun => ({
    kind: 'text',
    text: value,
    strong: style.strong ?? false,
    em: style.em ?? false,
});
const blank = (index: number): CardRun => ({ kind: 'blank', index });
const BREAK: CardRun = { kind: 'break' };
const black = (value: string) => parseCardText(value, { blanks: true });
const white = (value: string) => parseCardText(value, { blanks: false });

describe('blanks in black cards', () => {
    it('numbers every blank in order', () => {
        expect(black('_ is a slippery slope that leads to _.')).toEqual([
            blank(0),
            text(' is a slippery slope that leads to '),
            blank(1),
            text('.'),
        ]);
    });

    it.each([
        ["Grandma's homemade _s are the best of all.", ["Grandma's homemade ", 0, 's are the best of all.']],
        ['_opoly', [0, 'opoly']],
        ['All we are saying is give _a chance.', ['All we are saying is give ', 0, 'a chance.']],
    ])('handles a blank glued to letters: %j', (card, expected) => {
        expect(black(card)).toEqual(expected.map((part) => (typeof part === 'number' ? blank(part) : text(part))));
    });

    it.each([
        'The old argument of "Hollywood" vs. "Savoy" is mirrored in the real world by "_" vs. "_."',
        'My mom freaked out when she looked at my browser history and found _.com/_.',
        "You want _? You can't handle _[SAME CARD AGAIN]_!",
    ])('treats underscore pairs as blanks, never italics: %j', (card) => {
        const runs = black(card);
        expect(runs.filter((run) => run.kind === 'text' && run.em)).toEqual([]);
        expect(runs.filter((run) => run.kind === 'blank').length).toBe(countBlanks(card));
    });

    it('counts blanks', () => {
        expect(countBlanks("You want _? You can't handle _[SAME CARD AGAIN]_!")).toBe(3);
        expect(countBlanks('What is that smell?')).toBe(0);
    });
});

describe('white cards', () => {
    it('keeps underscores as literal text', () => {
        expect(white('∩ (O_O) ∩')).toEqual([text('∩ (O_O) ∩')]);
    });
});

describe('line breaks', () => {
    it('turns each newline into a break', () => {
        expect(white('a boil,\na plague-sore,\nan embossed carbuncle')).toEqual([
            text('a boil,'),
            BREAK,
            text('a plague-sore,'),
            BREAK,
            text('an embossed carbuncle'),
        ]);
    });

    it('keeps a blank line as two breaks', () => {
        expect(white('A maid of honor with no shame.\n\nNo. Shame.')).toEqual([
            text('A maid of honor with no shame.'),
            BREAK,
            BREAK,
            text('No. Shame.'),
        ]);
    });
});

describe('emphasis', () => {
    it('reads *text* as emphasis', () => {
        expect(black('*RANDOM*\nHand this card to another player and have them: TELL A JOKE')).toEqual([
            text('RANDOM', { em: true }),
            BREAK,
            text('Hand this card to another player and have them: TELL A JOKE'),
        ]);
    });

    it('reads **text** as strong', () => {
        expect(white('This is **really** bad')).toEqual([
            text('This is '),
            text('really', { strong: true }),
            text(' bad'),
        ]);
    });

    it.each([
        'F**king cupcakes',
        'What the f**k is that?',
        'F***ing Millennials.',
        'A quick good luck s**k n f**k in the disabled toilets...',
        'Some F***ING EGGS!!',
    ])('leaves censored words alone: %j', (card) => {
        expect(white(card)).toEqual([text(card)]);
    });

    it('leaves an unmatched star as text', () => {
        expect(white('Five * stars')).toEqual([text('Five * stars')]);
    });
});

describe('special characters', () => {
    it('keeps < and > as plain text (rendered with textContent, never as HTML)', () => {
        const card = 'In line with our predictions, we find a robust correlation between _ and _ (p<.05).';
        expect(toPlainText(black(card))).toBe(
            'In line with our predictions, we find a robust correlation between ____ and ____ (p<.05).',
        );
    });
});

describe('toPlainText', () => {
    it('renders blanks and breaks', () => {
        expect(toPlainText(black('*RANDOM*\n_ is great.'))).toBe('RANDOM\n____ is great.');
    });
});
