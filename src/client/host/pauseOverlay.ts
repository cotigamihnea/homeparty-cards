import type { HostView } from '../../shared/views.js';
import { classNames, el } from '../ui/dom.js';
import { formatList, t } from '../ui/i18n/index.js';
import { entering } from '../ui/motion.js';

/** Fewer than 3 players connected: the whole TV says so, and names who the room is waiting for. */
export function pauseOverlay(view: HostView): HTMLElement | null {
    if (!view.paused) return null;
    const away = view.players.filter((player) => !player.connected).map((player) => player.name);
    const moment = entering(`pause-${view.pausedAt}`);
    return el('div', { class: classNames('tv-pause-overlay', moment), attrs: { role: 'status' } }, [
        el('div', { class: 'tv-pause-card' }, [
            el('h2', { text: t('host.waitingForPlayers') }),
            el('p', {
                text:
                    away.length > 0
                        ? t('host.pauseBody', { names: formatList(away), count: away.length })
                        : t('game.paused'),
            }),
        ]),
    ]);
}
