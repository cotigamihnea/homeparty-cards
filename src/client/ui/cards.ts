import type { BlackCardView, WhiteCardView } from '../../shared/views.js';
import { blackCardText, pickBadge, whiteCardText } from './cardText.js';
import { classNames, el } from './dom.js';
import { cardMarkIcon } from './icons.js';

/** Card text length class: long cards get smaller type so they never overflow a real-proportion card. */
export type CardTextSize = 's' | 'm' | 'l' | 'xl' | 'xxl' | 'xxxl';

const BLANK_AS_CHARACTERS = '______';
/** Each extra answer on a Pick 2/3 card starts its own lines and gets a number: about this much room. */
const EXTRA_ANSWER_CHARACTERS = 30;

export function textSize(text: string, answers = 1): CardTextSize {
    const length = text.replace(/_+/g, BLANK_AS_CHARACTERS).length + Math.max(0, answers - 1) * EXTRA_ANSWER_CHARACTERS;
    if (length <= 45) return 's';
    if (length <= 90) return 'm';
    if (length <= 150) return 'l';
    if (length <= 220) return 'xl';
    // Pick 2/3 answers made of long cards; the last step is three of the very longest.
    if (length <= 330) return 'xxl';
    return 'xxxl';
}

/** A black prompt card; answers, if given, fill its blanks (the phone's live preview). */
export function blackCardEl(
    black: BlackCardView,
    options: { answers?: readonly string[]; className?: string } = {},
): HTMLElement {
    const answers = options.answers ?? [];
    return el(
        'div',
        {
            class: classNames('card card-black', options.className),
            attrs: { 'data-size': textSize([black.text, ...answers].join(' ')) },
        },
        [
            blackCardText(black.text, answers),
            el('div', { class: 'card-foot' }, [cardMarkIcon(), pickBadge(black.pick)]),
        ],
    );
}

/** A white answer card; a Pick 2/3 answer lists its cards in order, numbered. */
export function whiteCardEl(answers: readonly string[], className?: string): HTMLElement {
    const numbered = answers.length > 1;
    return el(
        'div',
        {
            class: classNames('card card-white', numbered && 'is-stack', className),
            attrs: { 'data-size': textSize(answers.join(' '), answers.length) },
        },
        [
            el(
                'div',
                { class: 'card-answers' },
                answers.map((text, i) =>
                    el('div', { class: 'card-answer' }, [
                        numbered ? el('span', { class: 'card-answer-number', text: String(i + 1) }) : null,
                        whiteCardText(text),
                    ]),
                ),
            ),
            el('div', { class: 'card-foot' }, [cardMarkIcon()]),
        ],
    );
}

/** The text of each card in an answer, in the order they were played. */
export function answerTexts(cards: readonly WhiteCardView[]): string[] {
    return cards.map((card) => card.text);
}
