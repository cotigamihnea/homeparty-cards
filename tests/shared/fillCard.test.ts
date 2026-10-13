import { describe, expect, it } from 'vitest';
import { fillBlackCard, toPlainText } from '../../src/shared/cardText.js';

const filled = (black: string, answers: string[]) => {
    const card = fillBlackCard(black, answers);
    return { prompt: toPlainText(card.prompt), extra: card.extraAnswers.map((answer) => toPlainText(answer.runs)) };
};

describe('fillBlackCard', () => {
    it('fills blanks in order and drops the answer’s own trailing period', () => {
        expect(filled('_ is a slippery slope that leads to _.', ['Being on fire.', 'Bees?']).prompt).toBe(
            'Being on fire is a slippery slope that leads to Bees?',
        );
    });

    it('marks the inserted text as answers, numbered by blank', () => {
        const card = fillBlackCard('I drink to forget _.', ['Being on fire.']);
        expect(card.prompt.map((run) => run.kind)).toEqual(['text', 'answer', 'text']);
        expect(card.prompt[1]).toMatchObject({ kind: 'answer', index: 0 });
    });

    it('joins a suffix glued to the blank', () => {
        expect(filled("Grandma's homemade _s are the best of all.", ['Hot dog.']).prompt).toBe(
            "Grandma's homemade Hot dogs are the best of all.",
        );
    });

    it('capitalises an answer that starts a sentence', () => {
        expect(filled('_ is all the rage now.', ['a funny,\nsporty lad']).prompt).toBe(
            'A funny,\nsporty lad is all the rage now.',
        );
        expect(filled('Adventure. Romance. _. From Paramount Pictures.', ['being on fire.']).prompt).toBe(
            'Adventure. Romance. Being on fire. From Paramount Pictures.',
        );
    });

    it('keeps the answer’s case in mid-sentence (proper nouns survive)', () => {
        expect(filled('I never thought I would meet _ at a bar.', ['Barack Obama.']).prompt).toBe(
            'I never thought I would meet Barack Obama at a bar.',
        );
    });

    it.each([
        ['Bees?', 'I like Bees?'],
        ['Woo!', 'I like Woo!'],
        ['Waiting...', 'I like Waiting...'],
    ])('does not double punctuation when %j comes before the card’s period', (answer, expected) => {
        expect(filled('I like _.', [answer]).prompt).toBe(expected);
    });

    it('drops a quoted answer’s inner final period, keeping the quotes', () => {
        expect(filled('I like _.', ['"Tweeting."']).prompt).toBe('I like "Tweeting".');
    });

    it('does not double punctuation after a quoted answer that ends in ! or ?', () => {
        expect(filled('I like _.', ['"Wow!"']).prompt).toBe('I like "Wow!"');
        expect(filled('I like _.', ["'Why me?'"]).prompt).toBe("I like 'Why me?'");
    });

    it('drops the final period that comes before a ® or ™ mark, so the card does not end ".®."', () => {
        expect(filled('But before I kill you, Mr. Bond, I must show you _.', ["Gentleman's Relish.®"]).prompt).toBe(
            "But before I kill you, Mr. Bond, I must show you Gentleman's Relish®.",
        );
        expect(filled('_. That’s how I want to die.', ['Yeti Rambler!™']).prompt).toBe(
            'Yeti Rambler!™ That’s how I want to die.',
        );
    });

    it('handles quoted blanks end to end', () => {
        expect(filled('Adventure. Romance. _. From Paramount Pictures, "_."', ['being on fire.', 'Bees?']).prompt).toBe(
            'Adventure. Romance. Being on fire. From Paramount Pictures, "Bees?"',
        );
    });

    it('puts the answer underneath a question with no blank, unchanged', () => {
        expect(filled('What is that smell?', ['Being on fire.'])).toEqual({
            prompt: 'What is that smell?',
            extra: ['Being on fire.'],
        });
    });

    it('lists three answers under "Make a haiku."', () => {
        expect(filled('Make a haiku.', ['Bees?', 'Being on fire.', 'A sad handjob.']).extra).toEqual([
            'Bees?',
            'Being on fire.',
            'A sad handjob.',
        ]);
    });

    it('leaves missing answers as blanks (live preview while picking)', () => {
        expect(filled('_ is a slippery slope that leads to _.', ['Being on fire.']).prompt).toBe(
            'Being on fire is a slippery slope that leads to ____.',
        );
    });

    it('keeps an underscore inside an answer as text, not a new blank', () => {
        const card = fillBlackCard('My face when _.', ['∩ (O_O) ∩']);
        expect(toPlainText(card.prompt)).toBe('My face when ∩ (O_O) ∩.');
        expect(card.prompt.filter((run) => run.kind === 'blank')).toEqual([]);
    });

    it('does not mutate its inputs', () => {
        const answers = Object.freeze(['Being on fire.']);
        expect(() => fillBlackCard('I like _.', answers)).not.toThrow();
        expect(answers).toEqual(['Being on fire.']);
    });
});
