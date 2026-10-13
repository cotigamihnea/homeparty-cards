import type { PlayerView, WhiteCardView } from '../../shared/views.js';
import { answerTexts } from '../ui/cards.js';
import { whiteCardText } from '../ui/cardText.js';
import { classNames, el } from '../ui/dom.js';
import { answeredText, playerName } from '../ui/gameText.js';
import { t } from '../ui/i18n/index.js';
import { entering } from '../ui/motion.js';
import { blackCard, button, gameHeader, gameScreen, noticeLine, pauseBanner, type PhoneContext } from './parts.js';
import { houseConfirm, houseTools } from './houseMoves.js';
import { choosableCards, wordsOn } from './play.js';

function answeredLine(view: PlayerView): HTMLElement | null {
    return view.round ? el('p', { class: 'answered-line', text: answeredText(view.round) }) : null;
}

export function introScreen(view: PlayerView, ctx: PhoneContext): HTMLElement {
    const round = view.round!;
    const isCzar = round.czarId === view.myId;
    return gameScreen(classNames('intro-screen', entering(`phone-intro-${round.number}`)), [
        gameHeader(view, ctx),
        pauseBanner(view),
        el('h1', {
            class: 'screen-title',
            text: isCzar ? t('game.youAreCzar') : t('game.czarIs', { name: playerName(view, round.czarId) }),
        }),
        round.finale ? el('p', { class: 'screen-lead', text: t('game.finaleLine') }) : null,
        blackCard(round.black),
        el('p', { class: 'screen-hint', text: isCzar ? t('phone.czarHint') : t('phone.getReady') }),
    ]);
}

export function czarWaitingScreen(view: PlayerView, ctx: PhoneContext): HTMLElement {
    return gameScreen('czar-waiting-screen', [
        gameHeader(view, ctx),
        pauseBanner(view),
        el('h1', { class: 'screen-title', text: t('game.youAreCzar') }),
        blackCard(view.round!.black),
        answeredLine(view),
        el('p', { class: 'screen-hint', text: t('phone.czarHint') }),
    ]);
}

/** Waiting screens with a title and a line: a late joiner, or a non-contender in sudden death. */
export function waitScreen(view: PlayerView, ctx: PhoneContext, title: string, body: string): HTMLElement {
    return gameScreen('wait-screen', [
        gameHeader(view, ctx),
        pauseBanner(view),
        el('h1', { class: 'screen-title', text: title }),
        el('p', { class: 'screen-hint', text: body }),
        view.round ? blackCard(view.round.black) : null,
    ]);
}

export function answerScreen(view: PlayerView, ctx: PhoneContext, editing: boolean): HTMLElement {
    const round = view.round!;
    const cards = choosableCards(view);
    const textOf = new Map(cards.map((card) => [card.id, wordsOn(card, ctx.blankTexts)]));
    const complete = ctx.selected.length === round.black.pick;
    const dealt = entering(`hand-${round.number}`, 'is-dealt');
    const confessing = ctx.houseAction?.kind === 'confess';
    const inHand = new Set(view.hand.map((card) => card.id));
    return gameScreen('answer-screen', [
        gameHeader(view, ctx),
        pauseBanner(view),
        blackCard(
            round.black,
            ctx.selected.map((id) => textOf.get(id) ?? ''),
            'is-preview',
        ),
        el('p', { class: 'screen-hint', text: t('phone.pickCards', { count: round.black.pick }) }),
        el(
            'ul',
            { class: classNames('hand', dealt, confessing && 'is-confessing') },
            cards.map((card, i) =>
                el('li', { attrs: { style: `--i: ${i}` } }, [
                    confessing
                        ? confessableCard(card, ctx, inHand.has(card.id) && !card.blank)
                        : handCard(card, ctx, round.black.pick),
                ]),
            ),
        ),
        houseTools(view, ctx),
        noticeLine(ctx.notice),
        el('div', { class: 'action-bar' }, ctx.houseAction ? houseConfirm(ctx) : answerButtons(ctx, complete, editing)),
    ]);
}

function answerButtons(ctx: PhoneContext, complete: boolean, editing: boolean): (HTMLElement | null)[] {
    return [
        button(ctx.pending ? t('phone.sending') : t('phone.send'), ctx.act.submit, {
            disabled: !complete || ctx.pending,
            attrs: { id: 'send-answer' },
        }),
        editing ? button(t('phone.cancel'), ctx.act.cancelEdit, { ghost: true }) : null,
    ];
}

/** A card in the hand: tap to add it to the answer (in order) or take it back. A blank is written on first. */
function handCard(card: WhiteCardView, ctx: PhoneContext, pick: number): HTMLElement {
    const order = ctx.selected.indexOf(card.id);
    const written = card.blank && wordsOn(card, ctx.blankTexts) !== '';
    const node = el(
        'button',
        {
            class: classNames(
                'white-card hand-card',
                order >= 0 && 'is-selected',
                card.blank && 'is-blank',
                written && 'is-written',
            ),
            attrs: { type: 'button', id: `card-${card.id}`, 'aria-pressed': String(order >= 0) },
        },
        [
            cardFace(card, ctx),
            order >= 0
                ? el('span', { class: 'order-badge', text: pick > 1 ? String(order + 1) : t('phone.selected') })
                : null,
        ],
    );
    node.addEventListener('click', () =>
        card.blank && order < 0 ? ctx.act.writeBlank(card.id) : ctx.act.toggleCard(card.id),
    );
    return node;
}

/** What a hand card shows: its text, or on a blank what the player wrote (a prompt until then). */
function cardFace(card: WhiteCardView, ctx: PhoneContext): HTMLElement {
    const words = wordsOn(card, ctx.blankTexts);
    return card.blank && words === ''
        ? el('p', { class: 'card-text blank-prompt', text: t('phone.blankCard') })
        : whiteCardText(words);
}

/** Never Have I Ever: tapping a card marks it as the one to confess (a blank, or a card already sent, can't be). */
function confessableCard(card: WhiteCardView, ctx: PhoneContext, enabled: boolean): HTMLElement {
    const marked = ctx.houseAction?.kind === 'confess' && ctx.houseAction.cardId === card.id;
    const node = el(
        'button',
        {
            class: classNames('white-card hand-card', card.blank && 'is-blank', marked && 'is-confessed'),
            attrs: {
                type: 'button',
                id: `card-${card.id}`,
                'aria-pressed': String(marked),
                ...(enabled ? {} : { disabled: '' }),
            },
        },
        [cardFace(card, ctx)],
    );
    node.addEventListener('click', () => ctx.act.setHouseAction({ kind: 'confess', cardId: card.id }));
    return node;
}

export function answerSentScreen(view: PlayerView, ctx: PhoneContext): HTMLElement {
    const answer = view.mySubmission ?? [];
    const round = view.round!;
    return gameScreen(classNames('answer-sent-screen', entering(`sent-${round.number}`)), [
        gameHeader(view, ctx),
        pauseBanner(view),
        el('h1', { class: 'screen-title', text: t('phone.answerSent') }),
        blackCard(round.black, answerTexts(answer)),
        answeredLine(view),
        noticeLine(ctx.notice),
        button(t('phone.changeAnswer'), ctx.act.editAnswer, { ghost: true }),
    ]);
}
