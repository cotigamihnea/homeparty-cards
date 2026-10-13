import { MAX_PLAYERS, MIN_PLAYERS } from '../../shared/constants.js';
import type { HostView, NetworkWarning, PublicPlayer } from '../../shared/views.js';
import { avatarBadge } from '../ui/avatars.js';
import { classNames, el } from '../ui/dom.js';
import { t, translateReason } from '../ui/i18n/index.js';
import { crownIcon } from '../ui/icons.js';
import { settingsSummary } from '../ui/settings/summary.js';
import type { KickButton } from './parts.js';

export interface LobbyContext {
    qr: HTMLImageElement;
    knownPlayerIds: Set<string>;
}

export function lobbyScreen(view: HostView, ctx: LobbyContext, kick: KickButton | null): HTMLElement {
    const known = new Set(ctx.knownPlayerIds);
    ctx.knownPlayerIds.clear();
    for (const player of view.players) ctx.knownPlayerIds.add(player.id);
    return el('div', { class: 'host-page' }, [
        el('main', { class: 'host-lobby' }, [
            el('section', { class: 'join-column' }, [
                el('div', { class: 'brand-stack' }, [
                    el('div', { class: 'brand-back', attrs: { 'aria-hidden': 'true' } }),
                    el('div', { class: 'brand-card' }, [
                        el('h1', { class: 'brand-title', text: t('appName') }),
                        el('p', { class: 'unofficial brand-unofficial', text: t('unofficial') }),
                    ]),
                ]),
                el('div', { class: 'join-card' }, [
                    el('h2', { class: 'join-title', text: t('host.scanToJoin') }),
                    ctx.qr,
                    el('p', { class: 'join-or', text: t('host.orVisit') }),
                    el('p', { class: 'join-url', text: view.network.joinUrl }),
                ]),
            ]),
            el('section', { class: 'players-column', attrs: { 'aria-labelledby': 'players-title' } }, [
                networkBanner(view.network.warning),
                el('div', { class: 'players-head' }, [
                    el('h2', { attrs: { id: 'players-title' }, text: t('host.playersTitle') }),
                    el('span', {
                        class: 'players-count',
                        text: t('host.playersCount', { count: view.players.length, max: MAX_PLAYERS }),
                    }),
                ]),
                view.players.length === 0 ? emptyState() : playerGrid(view.players, known, kick),
                el('p', { class: 'lobby-status', text: statusText(view) }),
            ]),
        ]),
        settingsStrip(view),
    ]);
}

/** The VIP's choices, mirrored for the room. */
function settingsStrip(view: HostView): HTMLElement {
    return el(
        'dl',
        { class: 'lobby-settings', attrs: { 'aria-label': t('settings.title') } },
        settingsSummary(view.settings, view.deck).map(({ label, value }) =>
            el('div', { class: 'lobby-setting' }, [el('dt', { text: label }), el('dd', { text: value })]),
        ),
    );
}

function networkBanner(warning: NetworkWarning | null): HTMLElement | null {
    if (!warning) return null;
    const [title, body] =
        warning === 'WSL_NAT'
            ? [t('host.wslNatTitle'), t('host.wslNatBody')]
            : [t('host.noLanTitle'), t('host.noLanBody')];
    return el('div', { class: 'network-banner', attrs: { role: 'alert' } }, [
        el('strong', { text: title }),
        el('span', { text: body }),
    ]);
}

function emptyState(): HTMLElement {
    return el('div', { class: 'empty-card' }, [
        el('h2', { text: t('host.emptyTitle') }),
        el('p', { text: t('host.emptyBody') }),
    ]);
}

function playerGrid(
    players: readonly PublicPlayer[],
    known: ReadonlySet<string>,
    kick: KickButton | null,
): HTMLElement {
    let newIndex = 0;
    return el(
        'ul',
        { class: 'player-grid' },
        players.map((player) => {
            const isNew = !known.has(player.id);
            const classes = classNames('player-tile', isNew && 'is-new', !player.connected && 'is-away');
            const tile = el('li', { class: classes }, [
                el('span', { class: 'player-name', text: player.name }),
                el('span', { class: 'player-foot' }, [
                    avatarBadge(player),
                    player.connected ? null : el('span', { class: 'away-label', text: t('host.reconnecting') }),
                    player.isVip
                        ? el('span', { class: 'vip-badge' }, [crownIcon(), el('span', { text: t('vip') })])
                        : null,
                    kick?.(player) ?? null,
                ]),
            ]);
            if (isNew) tile.style.animationDelay = `${newIndex++ * 70}ms`;
            return tile;
        }),
    );
}

function statusText(view: HostView): string {
    const players = view.players;
    if (players.length === 0) return '';
    const missing = MIN_PLAYERS - players.filter((player) => player.connected).length;
    if (missing > 0) return t('host.needPlayers', { count: missing });
    if (view.deck.problem) return translateReason(view.deck.problem);
    return t('host.waitingForVip', { name: players.find((player) => player.isVip)?.name ?? '' });
}
