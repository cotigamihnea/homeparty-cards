import type { HostView, SubmissionView } from '../../shared/views.js';
import { answerTexts, blackCardEl, whiteCardEl } from '../ui/cards.js';
import { classNames, el } from '../ui/dom.js';
import { playerName } from '../ui/gameText.js';
import { t } from '../ui/i18n/index.js';
import { entering } from '../ui/motion.js';
import { revealStep, type RevealStep } from '../ui/reveal.js';
import { awayStrip, tvHeader, tvPage, type KickButton } from './parts.js';
import { gridColumns } from './stage.js';

/** JUDGING: each answer is dealt onto the table on its own, then all of them, with the Czar's current look marked. */
export function judgingScreen(view: HostView, now: number, kick: KickButton | null): HTMLElement {
    const step = revealStep(view.judging!, view.paused ? (view.pausedAt ?? now) : now);
    const screen = step ? revealScreen(view, now, step) : choosingScreen(view, now);
    screen.append(...[awayStrip(view, kick)].filter((node) => node !== null));
    return screen;
}

/** One answer at a time, dealt beside the prompt. */
function revealScreen(view: HostView, now: number, step: RevealStep): HTMLElement {
    const round = view.round!;
    const submission = view.judging!.submissions[step.index]!;
    const dealt = entering(`reveal-${round.number}-${step.index}`, 'is-dealt');
    return tvPage('tv-judging-screen is-revealing', [
        tvHeader(view, now, t('host.reading')),
        el('main', { class: 'tv-table', attrs: { 'data-pick': String(round.black.pick) } }, [
            blackCardEl(round.black, { className: 'tv-card is-prompt' }),
            el('div', { class: 'tv-dealt' }, [
                el('p', {
                    class: 'tv-reveal-count',
                    text: t('host.answerOf', { index: step.index + 1, total: step.total }),
                }),
                el(
                    'div',
                    { class: 'tv-dealt-cards' },
                    answerTexts(submission.cards).map((text) => whiteCardEl([text], classNames('tv-card', dealt))),
                ),
            ]),
        ]),
    ]);
}

/** Every answer in a grid while the Czar chooses. */
function choosingScreen(view: HostView, now: number): HTMLElement {
    const round = view.round!;
    const judging = view.judging!;
    const czar = playerName(view, round.czarId);
    const cascade = entering(`grid-${round.number}`, 'is-cascading');
    const columns = gridColumns(judging.submissions.length);
    return tvPage('tv-judging-screen', [
        tvHeader(view, now, t('game.czarChoosing', { name: czar })),
        el('main', { class: 'tv-judging-main' }, [
            blackCardEl(round.black, { className: 'tv-card is-prompt is-small' }),
            el(
                'ul',
                {
                    class: classNames('tv-submissions', cascade),
                    attrs: {
                        'data-cols': String(columns),
                        'data-rows': String(Math.ceil(judging.submissions.length / columns)),
                    },
                },
                judging.submissions.map((submission, i) =>
                    submissionCard(submission, submission.id === judging.highlightedId, czar, i),
                ),
            ),
        ]),
    ]);
}

function submissionCard(submission: SubmissionView, highlighted: boolean, czar: string, index: number): HTMLElement {
    return el('li', { class: highlighted ? 'is-highlighted' : '', attrs: { style: `--i: ${index}` } }, [
        highlighted ? el('span', { class: 'tv-looking', text: t('host.lookingAt', { name: czar }) }) : null,
        whiteCardEl(answerTexts(submission.cards), 'tv-card'),
    ]);
}
