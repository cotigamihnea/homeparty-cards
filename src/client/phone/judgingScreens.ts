import type { PlayerView, SubmissionView } from '../../shared/views.js';
import { answerTexts, whiteCardEl } from '../ui/cards.js';
import { classNames, el } from '../ui/dom.js';
import { playerName } from '../ui/gameText.js';
import { t } from '../ui/i18n/index.js';
import {
    autoPlayedLine,
    blackCard,
    button,
    gameHeader,
    gameScreen,
    noticeLine,
    pauseBanner,
    type PhoneContext,
} from './parts.js';

/**
 * The Czar's screen: the black card stays pinned at the top, filled in with the answer being looked at, and the
 * answers are white cards below (in the TV's order). Pick, then confirm.
 */
export function czarJudgingScreen(view: PlayerView, ctx: PhoneContext): HTMLElement {
    const round = view.round!;
    const judging = view.judging!;
    const revealed = judging.revealed;
    const highlighted = judging.submissions.find((submission) => submission.id === judging.highlightedId);
    function pickHighlighted(): void {
        if (highlighted) ctx.act.pick(highlighted.id);
    }
    return gameScreen('judging-screen', [
        gameHeader(view, ctx),
        pauseBanner(view),
        el('h1', { class: 'screen-title', text: t('phone.pickWinner') }),
        el('div', { class: 'pinned-card' }, [
            blackCard(round.black, answerTexts(highlighted?.cards ?? []), 'is-preview'),
        ]),
        el('p', { class: 'screen-hint', text: revealed ? t('phone.tapToChoose') : t('phone.reading') }),
        el(
            'ul',
            { class: 'submission-list' },
            judging.submissions.map((submission) =>
                el('li', {}, [submissionButton(submission, submission.id === highlighted?.id, ctx)]),
            ),
        ),
        noticeLine(ctx.notice),
        el('div', { class: 'action-bar' }, pickButtons(ctx, pickHighlighted, !revealed || !highlighted || view.paused)),
    ]);
}

/** Pick, then confirm: picking the winner can't be undone. */
function pickButtons(ctx: PhoneContext, pickHighlighted: () => void, blocked: boolean): HTMLElement[] {
    if (ctx.confirmPick && !blocked) {
        return [
            el('p', { class: 'confirm-question', text: t('phone.confirmPick') }),
            button(t('phone.confirmPickYes'), pickHighlighted, { disabled: ctx.pending }),
            button(t('phone.keepLooking'), () => ctx.act.askPick(false), { ghost: true }),
        ];
    }
    return [button(t('phone.pickThis'), () => ctx.act.askPick(true), { disabled: blocked || ctx.pending })];
}

function submissionButton(submission: SubmissionView, isHighlighted: boolean, ctx: PhoneContext): HTMLElement {
    const node = el(
        'button',
        {
            class: classNames('submission-button', isHighlighted && 'is-highlighted'),
            attrs: { type: 'button', 'aria-pressed': String(isHighlighted) },
        },
        [
            whiteCardEl(answerTexts(submission.cards), 'is-wide'),
            isHighlighted ? el('span', { class: 'order-badge', text: t('phone.selected') }) : null,
        ],
    );
    node.addEventListener('click', () => ctx.act.highlight(submission.id));
    return node;
}

export function watchJudgingScreen(view: PlayerView, ctx: PhoneContext): HTMLElement {
    const round = view.round!;
    const answer = view.mySubmission;
    return gameScreen('watch-judging-screen', [
        gameHeader(view, ctx),
        pauseBanner(view),
        el('h1', { class: 'screen-title', text: t('game.czarChoosing', { name: playerName(view, round.czarId) }) }),
        autoPlayedLine(view),
        answer
            ? el('section', { class: 'your-answer', attrs: { 'aria-label': t('phone.yourAnswer') } }, [
                  el('h2', { class: 'panel-title', text: t('phone.yourAnswer') }),
                  blackCard(round.black, answerTexts(answer)),
              ])
            : el('p', { class: 'screen-hint', text: t('phone.noAnswer') }),
    ]);
}
