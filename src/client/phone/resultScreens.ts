import { RANDO_ID } from '../../shared/constants.js';
import type { PlayerView, RoundResultView } from '../../shared/views.js';
import { answerTexts } from '../ui/cards.js';
import { boundField, emptyDraft } from '../ui/decks/cardWriter.js';
import { classNames, el } from '../ui/dom.js';
import { defaultFeverName, unsavedFever, type LeaveChoice } from '../ui/feverSave.js';
import { advanceText, roundWinnerText, voidReasonText, winnersTitle } from '../ui/gameText.js';
import { t } from '../ui/i18n/index.js';
import { entering } from '../ui/motion.js';
import {
    autoPlayedLine,
    blackCard,
    button,
    gameHeader,
    gameScreen,
    me,
    noticeLine,
    pauseBanner,
    scoreList,
    type PhoneContext,
} from './parts.js';

function resultTitle(view: PlayerView, result: RoundResultView): string {
    if (result.kind === 'void') return t('game.roundSkipped');
    if (result.winnerId !== view.myId) return roundWinnerText(view, result.winnerId);
    return view.round?.finale ? t('phone.youWonHaiku') : t('phone.youWonRound');
}

export function resultScreen(view: PlayerView, ctx: PhoneContext): HTMLElement {
    const result = view.result!;
    const round = view.round!;
    const isVip = me(view)?.isVip === true;
    const winning = result.kind === 'winner' ? result.submissions.find((s) => s.id === result.submissionId) : undefined;
    return gameScreen('result-screen', [
        gameHeader(view, ctx),
        pauseBanner(view),
        el('h1', { class: 'screen-title', text: resultTitle(view, result) }),
        result.kind === 'void' ? el('p', { class: 'screen-hint', text: voidReasonText(result.reason) }) : null,
        autoPlayedLine(view),
        result.kind === 'winner' && result.winnerId === RANDO_ID
            ? el('p', { class: 'screen-hint', text: t('rando.shame') })
            : null,
        result.kind === 'winner' && result.winnerId === view.myId
            ? el('p', {
                  class: classNames('plus-one', entering(`plus-one-${round.number}`)),
                  text: round.finale ? t('game.forGlory') : t('phone.plusOne'),
              })
            : null,
        winning ? blackCard(round.black, answerTexts(winning.cards)) : null,
        scoreList(view),
        noticeLine(ctx.notice),
        isVip ? button(advanceText(view), ctx.act.advance, { disabled: ctx.pending || view.paused }) : null,
    ]);
}

export function gameOverScreen(view: PlayerView, ctx: PhoneContext): HTMLElement {
    const over = view.gameOver!;
    const isVip = me(view)?.isVip === true;
    const mine = over.standings.find((standing) => standing.playerId === view.myId);
    const title = over.winnerIds.includes(view.myId) ? t('phone.youWon') : winnersTitle(view, over.winnerIds);
    const vip = view.players.find((player) => player.isVip);
    return gameScreen('game-over-screen', [
        el('header', { class: 'game-header' }, [el('span', { class: 'game-round', text: t('game.gameOver') })]),
        mine
            ? el('p', {
                  class: classNames('final-rank', entering(`final-rank-${mine.rank}-${mine.score}`)),
                  attrs: { 'aria-hidden': 'true' },
                  text: `#${mine.rank}`,
              })
            : null,
        el('h1', { class: 'screen-title', text: title }),
        mine
            ? el('p', {
                  class: 'screen-hint',
                  text: t('phone.yourPlace', { rank: mine.rank, points: t('game.points', { count: mine.score }) }),
              })
            : null,
        scoreList(view),
        feverSection(view, ctx, isVip),
        noticeLine(ctx.notice),
        isVip
            ? leaveTools(view, ctx)
            : el('p', { class: 'screen-hint', text: t('game.waitingForVip', { name: vip?.name ?? '' }) }),
    ]);
}

/** Custom Fever's cards at the game over: the VIP's save form, or the deck they were saved as. */
function feverSection(view: PlayerView, ctx: PhoneContext, isVip: boolean): HTMLElement | null {
    const fever = view.gameOver?.fever;
    if (!fever) return null;
    if (fever.savedAs !== null) {
        return el('p', {
            class: 'fever-saved',
            attrs: { role: 'status' },
            text: t('fever.savedAs', { name: fever.savedAs }),
        });
    }
    if (!isVip) {
        const vip = view.players.find((player) => player.isVip);
        return el('p', { class: 'screen-hint', text: t('fever.vipCanSave', { name: vip?.name ?? '' }) });
    }
    const name = boundField(el('input', { class: 'deck-input', attrs: { type: 'text', autocomplete: 'off' } }), {
        id: 'fever-save-name',
        draft: ctx.feverName ?? emptyDraft(defaultFeverName()),
        onDraft: ctx.act.setFeverName,
        onEnter: ctx.act.saveFever,
    });
    return el('div', { class: 'fever-save' }, [
        el('label', { class: 'settings-label', attrs: { for: 'fever-save-name' }, text: t('fever.saveLabel') }),
        el('p', { class: 'screen-hint', text: t('fever.saveCounts', { white: fever.white, black: fever.black }) }),
        name,
        button(t('fever.save'), ctx.act.saveFever, { disabled: ctx.pending, attrs: { id: 'fever-save' } }),
    ]);
}

/** Play again / Back to lobby; while Custom Fever's cards are unsaved, they ask first. */
function leaveTools(view: PlayerView, ctx: PhoneContext): HTMLElement {
    const choice = ctx.confirmLeave;
    if (choice) {
        const go = choice === 'playAgain' ? ctx.act.playAgain : ctx.act.backToLobby;
        return el('div', { class: 'vip-tools' }, [
            el('p', { class: 'screen-hint', attrs: { role: 'alert' }, text: t('fever.leaveConfirm') }),
            button(t(choice === 'playAgain' ? 'game.playAgain' : 'game.backToLobby'), go, {
                danger: true,
                disabled: ctx.pending,
            }),
            button(t('phone.cancel'), () => ctx.act.askLeave(null), { ghost: true }),
        ]);
    }
    const unsaved = unsavedFever(view.gameOver);
    const leave = (next: LeaveChoice, go: () => void) => (unsaved ? () => ctx.act.askLeave(next) : go);
    return el('div', { class: 'vip-tools' }, [
        button(t('game.playAgain'), leave('playAgain', ctx.act.playAgain), { disabled: ctx.pending }),
        button(t('game.backToLobby'), leave('backToLobby', ctx.act.backToLobby), {
            ghost: true,
            disabled: ctx.pending,
        }),
    ]);
}
