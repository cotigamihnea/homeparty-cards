import type { BlackCardView, PlayerView, PublicPlayer } from '../../shared/views.js';
import { avatarBadge } from '../ui/avatars.js';
import { textButton, type ButtonOptions } from '../ui/button.js';
import { blackCardEl } from '../ui/cards.js';
import { countdown } from '../ui/countdown.js';
import { classNames, el } from '../ui/dom.js';
import { roundLabel, scoreboardPlayers } from '../ui/gameText.js';
import { t } from '../ui/i18n/index.js';
import { crownIcon } from '../ui/icons.js';
import { timerLength } from '../ui/timer.js';
import type { Draft } from '../ui/decks/cardWriter.js';
import type { LeaveChoice } from '../ui/feverSave.js';

/** The VIP's game menu: closed, open (End game), or asking to confirm ending the game. */
export type VipMenu = 'closed' | 'open' | 'confirm';

/**
 * A house-rule move in progress, shown in place of the answer's buttons: a reboot to confirm, or a confession
 * (choosing the card, then confirming).
 */
export type HouseAction = { kind: 'reboot' } | { kind: 'confess'; cardId: string | null } | null;

/** What the screens need from main: the clock, local choices and the actions they can take. */
export interface PhoneContext {
    now: number;
    selected: readonly string[];
    pending: boolean;
    notice: string | null;
    vipMenu: VipMenu;
    /** The Czar tapped Pick and is asked to confirm. */
    confirmPick: boolean;
    houseAction: HouseAction;
    /** What the player wrote on their blank cards this round, by card id (kept on the phone until sent). */
    blankTexts: Readonly<Record<string, string>>;
    /** Play again or Back to lobby was tapped while Custom Fever's cards are unsaved, and waits for a confirm. */
    confirmLeave: LeaveChoice | null;
    /** The Custom Fever save form's name as typed (null: not touched, so the default name shows). */
    feverName: Draft | null;
    act: PhoneActions;
}

export interface PhoneActions {
    toggleCard(cardId: string): void;
    /** Opens the writer for a blank card; using what was written selects the card. */
    writeBlank(cardId: string): void;
    submit(): void;
    editAnswer(): void;
    cancelEdit(): void;
    setHouseAction(action: HouseAction): void;
    reboot(): void;
    confess(cardId: string): void;
    highlight(submissionId: string): void;
    askPick(confirm: boolean): void;
    pick(submissionId: string): void;
    advance(): void;
    setVipMenu(menu: VipMenu): void;
    endGame(): void;
    playAgain(): void;
    backToLobby(): void;
    askLeave(choice: LeaveChoice | null): void;
    setFeverName(draft: Draft): void;
    saveFever(): void;
}

export function me(view: PlayerView): PublicPlayer | undefined {
    return view.players.find((player) => player.id === view.myId);
}

/** Phone buttons are full width, for thumbs. */
export function button(
    text: string,
    onClick: () => void,
    options: Omit<ButtonOptions, 'block'> = {},
): HTMLButtonElement {
    return textButton(text, onClick, { ...options, block: true });
}

/** The black card, laid out wide for a phone; answers, if given, fill its blanks. */
export function blackCard(black: BlackCardView, answers: readonly string[] = [], className?: string): HTMLElement {
    return blackCardEl(black, { answers, className: classNames('is-wide', className) });
}

/** Round number (or sudden-death round), the VIP's menu, and the countdown ring. */
export function gameHeader(view: PlayerView, ctx: PhoneContext): HTMLElement {
    const isVip = me(view)?.isVip === true;
    return el('header', { class: 'game-header' }, [
        el('span', { class: 'game-round', text: roundLabel(view) }),
        isVip ? vipMenuButton(ctx) : null,
        countdown(view.phaseEndsAt, ctx.now, timerLength(view)),
        isVip ? vipMenuPanel(ctx) : null,
    ]);
}

function vipMenuButton(ctx: PhoneContext): HTMLElement {
    const open = ctx.vipMenu !== 'closed';
    const node = el(
        'button',
        {
            class: 'vip-menu-button',
            attrs: {
                type: 'button',
                id: 'vip-menu-button',
                'aria-expanded': String(open),
                'aria-controls': 'vip-menu',
                'aria-label': t('phone.vipMenu'),
            },
        },
        [crownIcon(), el('span', { text: t('vip') })],
    );
    node.addEventListener('click', () => ctx.act.setVipMenu(open ? 'closed' : 'open'));
    return node;
}

/** Ending the game lives in the VIP's menu, away from the thumb, and always asks first. */
function vipMenuPanel(ctx: PhoneContext): HTMLElement | null {
    if (ctx.vipMenu === 'closed') return null;
    const body =
        ctx.vipMenu === 'open'
            ? [
                  button(t('game.endGame'), () => ctx.act.setVipMenu('confirm'), {
                      ghost: true,
                      danger: true,
                      attrs: { id: 'vip-end-game' },
                  }),
              ]
            : [
                  el('p', { class: 'confirm-question', text: t('game.endGameConfirm') }),
                  button(t('game.endGameYes'), ctx.act.endGame, {
                      danger: true,
                      disabled: ctx.pending,
                      attrs: { id: 'vip-end-confirm' },
                  }),
                  button(t('game.cancel'), () => ctx.act.setVipMenu('closed'), {
                      ghost: true,
                      attrs: { id: 'vip-end-cancel' },
                  }),
              ];
    return el('div', { class: 'vip-menu', attrs: { id: 'vip-menu' } }, body);
}

export function pauseBanner(view: PlayerView): HTMLElement | null {
    return view.paused ? el('p', { class: 'pause-banner', attrs: { role: 'status' }, text: t('game.paused') }) : null;
}

/** Auto-play on timeout played this phone's answer: say so, in place of a choice the player never made. */
export function autoPlayedLine(view: PlayerView): HTMLElement | null {
    return view.autoPlayed ? el('p', { class: 'screen-hint', text: t('phone.autoPlayed') }) : null;
}

export function noticeLine(notice: string | null): HTMLElement | null {
    return notice ? el('p', { class: 'form-error', attrs: { role: 'alert' }, text: notice }) : null;
}

/** Everyone's score; your own row says "You" in words, not just in colour. */
export function scoreList(view: PlayerView): HTMLElement {
    const ranked = [...scoreboardPlayers(view)].sort((a, b) => b.score - a.score);
    return el('section', { class: 'score-section', attrs: { 'aria-label': t('game.scores') } }, [
        el('h2', { class: 'panel-title', text: t('game.scores') }),
        el(
            'ol',
            { class: 'score-list' },
            ranked.map((player) => {
                const isMe = player.id === view.myId;
                return el('li', { class: isMe ? 'score-row is-me' : 'score-row' }, [
                    avatarBadge(player),
                    el('span', { class: 'score-name', text: player.name }),
                    isMe ? el('span', { class: 'you-tag', text: t('phone.you') }) : null,
                    el('span', { class: 'score-points', text: String(player.score) }),
                ]);
            }),
        ),
    ]);
}

export function gameScreen(className: string, children: readonly (Node | null)[]): HTMLElement {
    return el('div', { class: `phone-screen game-screen ${className}` }, children);
}
