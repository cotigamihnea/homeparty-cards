import type { PlayerView, PublicPlayer } from '../../shared/views.js';
import { avatarBadge } from '../ui/avatars.js';
import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';
import type { SettingsEditActions, SettingsEditContext } from '../ui/settings/editor.js';
import { catalogPicker } from '../ui/settings/packPicker.js';
import { settingsForm } from '../ui/settings/settingsForm.js';
import { button, noticeLine } from './parts.js';

/** What the VIP's lobby panels need from main. */
export interface PanelContext extends SettingsEditContext {
    pending: boolean;
    notice: string | null;
    confirmKick: string | null;
    act: PanelActions;
}

export interface PanelActions extends SettingsEditActions {
    close(): void;
    openPacks(): void;
    closePacks(): void;
    passCrown(playerId: string): void;
    askKick(playerId: string | null): void;
    kick(playerId: string): void;
}

export function panelScreen(
    className: string,
    title: string,
    body: readonly (Node | null)[],
    done: HTMLElement,
): HTMLElement {
    return el('div', { class: `phone-screen panel-screen ${className}` }, [
        el('h1', { class: 'screen-title', text: title }),
        ...body,
        el('div', { class: 'action-bar' }, [done]),
    ]);
}

export function settingsScreen(view: PlayerView, ctx: PanelContext): HTMLElement {
    return panelScreen(
        'settings-screen',
        t('settings.title'),
        [
            settingsForm(ctx.settings, view.deck, {
                onChange: ctx.act.changeSettings,
                onOpenPacks: ctx.act.openPacks,
            }),
            noticeLine(ctx.notice),
        ],
        button(t('settings.done'), ctx.act.close),
    );
}

export function packsScreen(view: PlayerView, ctx: PanelContext): HTMLElement {
    return panelScreen(
        'packs-screen',
        t('packs.title'),
        [catalogPicker(ctx, view.deck, { hintClass: 'screen-hint', blockButton: true }), noticeLine(ctx.notice)],
        button(t('settings.done'), ctx.act.closePacks),
    );
}

export function playersScreen(view: PlayerView, ctx: PanelContext): HTMLElement {
    const others = view.players.filter((player) => player.id !== view.myId);
    return panelScreen(
        'players-screen',
        t('phone.players'),
        [
            others.length === 0
                ? el('p', { class: 'screen-hint', text: t('phone.noOthers') })
                : el(
                      'ul',
                      { class: 'player-list' },
                      others.map((player) => el('li', {}, [playerRow(player, ctx)])),
                  ),
            noticeLine(ctx.notice),
        ],
        button(t('settings.done'), ctx.act.close),
    );
}

function playerRow(player: PublicPlayer, ctx: PanelContext): HTMLElement {
    const head = el('div', { class: 'player-row-head' }, [
        avatarBadge(player),
        el('span', { class: 'player-row-name', text: player.name }),
        player.connected ? null : el('span', { class: 'player-row-away', text: t('phone.away') }),
    ]);
    if (ctx.confirmKick === player.id) {
        return el('div', { class: 'player-row is-confirming' }, [
            head,
            el('p', { class: 'screen-hint', text: t('phone.removeConfirm', { name: player.name }) }),
            el('div', { class: 'player-row-actions' }, [
                button(t('phone.removeYes'), () => ctx.act.kick(player.id), { disabled: ctx.pending }),
                button(t('phone.cancel'), () => ctx.act.askKick(null), { ghost: true }),
            ]),
        ]);
    }
    return el('div', { class: 'player-row' }, [
        head,
        el('div', { class: 'player-row-actions' }, [
            button(t('phone.giveCrown'), () => ctx.act.passCrown(player.id), {
                ghost: true,
                disabled: !player.connected || ctx.pending,
            }),
            button(t('phone.remove'), () => ctx.act.askKick(player.id), { ghost: true, disabled: ctx.pending }),
        ]),
    ]);
}
