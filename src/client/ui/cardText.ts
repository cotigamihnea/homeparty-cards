import { fillBlackCard, parseCardText, type FilledRun, type TextRun } from '../../shared/cardText.js';
import { el } from './dom.js';
import { t } from './i18n/index.js';

function textNode(run: TextRun): Node {
    let node: Node = document.createTextNode(run.text);
    if (run.em) node = el('em', {}, [node]);
    if (run.strong) node = el('strong', {}, [node]);
    return node;
}

/** Card runs to DOM nodes. Text only ever becomes text nodes, so card and player text can't turn into HTML. */
export function runsToNodes(runs: readonly FilledRun[]): Node[] {
    return runs.map((run) => {
        switch (run.kind) {
            case 'text':
                return textNode(run);
            case 'break':
                return el('br');
            case 'blank':
                return el('span', { class: 'blank' }, [el('span', { class: 'sr-only', text: t('card.blank') })]);
            case 'answer':
                return el('span', { class: 'answer' }, runsToNodes(run.runs));
        }
    });
}

/** A black card's text with its blanks filled by the given answers (in order); extra answers go underneath. */
export function blackCardText(text: string, answers: readonly string[] = []): HTMLElement {
    const filled = fillBlackCard(text, answers);
    return el('div', { class: 'card-text' }, [
        el('p', {}, runsToNodes(filled.prompt)),
        ...filled.extraAnswers.map((answer) => el('p', { class: 'card-extra' }, runsToNodes([answer]))),
    ]);
}

export function whiteCardText(text: string): HTMLElement {
    return el('p', { class: 'card-text' }, runsToNodes(parseCardText(text, { blanks: false })));
}

/** "Pick 2" or "Pick 3" on a black card; a Pick 1 has no badge. */
export function pickBadge(pick: number): HTMLElement | null {
    return pick > 1 ? el('span', { class: 'pick-badge', text: t('card.pick', { count: pick }) }) : null;
}
