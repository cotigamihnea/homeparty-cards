import type { CardColor } from '../../shared/customCards.js';
import type { PlayerView } from '../../shared/views.js';
import { cardWriter } from '../ui/decks/cardWriter.js';
import { el } from '../ui/dom.js';
import { progressOf, startNowQuestion, stillWriting } from '../ui/fever.js';
import { t } from '../ui/i18n/index.js';
import { checkIcon } from '../ui/icons.js';
import type { FeverWriterActions, FeverWriterState } from './feverWriter.js';
import { button, gameHeader, gameScreen, me, noticeLine, pauseBanner, type PhoneContext } from './parts.js';

export interface WritingContext {
    state: FeverWriterState;
    pending: boolean;
    act: FeverWriterActions;
}

/** The VIP's Start now: at once when everyone here is done, otherwise after a question. */
function startNowTools(view: PlayerView, writer: WritingContext): HTMLElement {
    if (writer.state.confirmStart) {
        return el('div', { class: 'vip-tools' }, [
            el('p', { class: 'screen-hint', attrs: { role: 'alert' }, text: startNowQuestion(view) }),
            button(t('fever.startNow'), writer.act.startNow, { disabled: writer.pending, danger: true }),
            button(t('fever.keepWriting'), () => writer.act.askStart(false), { ghost: true }),
        ]);
    }
    const ask = () => (stillWriting(view).length > 0 ? writer.act.askStart(true) : writer.act.startNow());
    return el('div', { class: 'vip-tools' }, [
        button(t('fever.startNow'), ask, { ghost: true, disabled: writer.pending, attrs: { id: 'fever-start-now' } }),
    ]);
}

/** Custom Fever (GAME_DESIGN §13): this player writes their own white and black cards, up to the quota. */
export function writingScreen(view: PlayerView, ctx: PhoneContext, writer: WritingContext): HTMLElement {
    const quota = view.writing?.quota ?? { white: 0, black: 0 };
    const mine = progressOf(view, view.myId) ?? { white: 0, black: 0, done: false };
    const cards = {
        white: view.myWritten.filter((card) => card.color === 'white').map((card) => card.text),
        black: view.myWritten.filter((card) => card.color === 'black').map(({ text, pick }) => ({ text, pick })),
    };
    const fullLine = (color: CardColor) =>
        cards[color].length >= quota[color]
            ? t(color === 'white' ? 'fever.whiteFull' : 'fever.blackFull', { count: quota[color] })
            : null;
    return gameScreen('writing-screen', [
        gameHeader(view, ctx),
        pauseBanner(view),
        mine.done
            ? el('div', { class: 'fever-done', attrs: { role: 'status' } }, [
                  checkIcon(),
                  el('p', {}, [el('strong', { text: t('fever.doneTitle') }), ` ${t('fever.doneBody')}`]),
              ])
            : null,
        el('h1', { class: 'screen-title', text: t('fever.writeTitle') }),
        el('p', {
            class: 'screen-hint fever-progress',
            attrs: { id: 'fever-progress' },
            text: t('fever.progress', {
                white: mine.white,
                whiteQuota: quota.white,
                black: mine.black,
                blackQuota: quota.black,
            }),
        }),
        el(
            'div',
            { class: 'deck-panel' },
            cardWriter(cards, writer, {
                ids: 'fever',
                // The counts are in the progress line just above; the tabs stay short enough for one line.
                tabLabel: (color) => t(color === 'white' ? 'fever.whiteTab' : 'fever.blackTab'),
                fullLine,
            }),
        ),
        noticeLine(ctx.notice),
        me(view)?.isVip ? startNowTools(view, writer) : null,
    ]);
}
