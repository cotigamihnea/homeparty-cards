import { MIN_PLAYERS } from '../../shared/constants.js';
import type { PlayerView, PublicPlayer } from '../../shared/views.js';
import { avatarBadge } from '../ui/avatars.js';
import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';
import { crownIcon } from '../ui/icons.js';
import { deckProblemLine } from '../ui/settings/settingsForm.js';
import { avatarPicker } from './avatarPicker.js';
import { miniBrand } from './brand.js';
import { button, me, noticeLine } from './parts.js';

export interface WaitingOptions {
    dealIn: boolean;
    notice: string | null;
    pending: boolean;
    onStart: () => void;
    onOpenPanel: (panel: 'settings' | 'players' | 'decks') => void;
    onChooseAvatar: (avatar: number) => void;
}

export function waitingScreen(view: PlayerView, options: WaitingOptions): HTMLElement {
    const you = me(view);
    const here = view.players.filter((player) => player.connected);
    return el('div', { class: 'phone-screen waiting-screen' }, [
        miniBrand(),
        el('h1', { class: 'screen-title', text: t('phone.youreIn') }),
        you ? youCard(you, options.dealIn) : null,
        avatarPicker(view, options.onChooseAvatar),
        lobbyRow(here),
        noticeLine(options.notice),
        you?.isVip
            ? vipPanel(view, here.length, options)
            : el('div', { class: 'waiting-hints' }, [
                  el('p', { class: 'screen-hint', text: t('phone.watchTv') }),
                  el('p', { class: 'screen-hint', text: t('phone.czarExplainer') }),
              ]),
    ]);
}

/** Who else is here: their colours in a row, and how many. */
function lobbyRow(here: readonly PublicPlayer[]): HTMLElement {
    return el('div', { class: 'lobby-row' }, [
        el(
            'span',
            { class: 'lobby-avatars', attrs: { 'aria-hidden': 'true' } },
            here.map((player) => avatarBadge(player)),
        ),
        el('p', { class: 'screen-hint', text: t('phone.inLobby', { count: here.length }) }),
    ]);
}

function youCard(you: PublicPlayer, dealIn: boolean): HTMLElement {
    return el('div', { class: dealIn ? 'you-card is-new' : 'you-card' }, [
        el('div', { class: 'you-row' }, [avatarBadge(you), el('span', { class: 'you-name', text: you.name })]),
        you.isVip
            ? el('span', { class: 'vip-badge' }, [crownIcon(), el('span', { text: t('phone.youHaveCrown') })])
            : null,
    ]);
}

function vipPanel(view: PlayerView, connected: number, options: WaitingOptions): HTMLElement {
    const missing = MIN_PLAYERS - connected;
    return el('div', { class: 'vip-panel' }, [
        el('p', { class: 'screen-hint', text: t('phone.vipHint') }),
        deckProblemLine(view.deck),
        button(missing > 0 ? t('phone.needPlayers', { count: missing }) : t('phone.startGame'), options.onStart, {
            disabled: missing > 0 || view.deck.problem !== null || options.pending,
        }),
        button(t('phone.settings'), () => options.onOpenPanel('settings'), { ghost: true }),
        button(t('decks.title'), () => options.onOpenPanel('decks'), { ghost: true }),
        view.players.length > 1
            ? button(t('phone.players'), () => options.onOpenPanel('players'), { ghost: true })
            : null,
    ]);
}
