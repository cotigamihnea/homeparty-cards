import type { AnnouncementView, HostView } from '../../shared/views.js';
import { avatarBadge } from '../ui/avatars.js';
import { whiteCardEl } from '../ui/cards.js';
import { classNames, el } from '../ui/dom.js';
import { findPlayer, playerName } from '../ui/gameText.js';
import { t } from '../ui/i18n/index.js';
import { entering } from '../ui/motion.js';

/** How long a house-rule move holds the middle of the TV before it joins the log under the players. */
export const SPOTLIGHT_MS = 5_000;
/** The log's newest lines; older ones have had their moment. */
const LOGGED = 3;

function badge(view: HostView, playerId: string): HTMLElement | null {
    const player = findPlayer(view, playerId);
    return player ? avatarBadge(player) : null;
}

/** What the player did, after their name in the log. */
function moveText(entry: AnnouncementView): string {
    return entry.kind === 'reboot' ? t('host.rebooted') : t('host.confessedCard', { card: entry.text });
}

/**
 * The log of house-rule moves while answers come in, one line each, newest first: who rebooted the universe, and
 * who doesn't get which card. Lines that don't fit under the players are left out whole.
 */
export function tableTalk(view: HostView): HTMLElement | null {
    const round = view.round;
    if (!round || round.announcements.length === 0) return null;
    const newestFirst = round.announcements.map((entry, index) => ({ entry, index })).reverse();
    return el(
        'ol',
        { class: 'tv-table-talk', attrs: { 'aria-label': t('host.tableTalk') } },
        newestFirst
            .slice(0, LOGGED)
            .map(({ entry, index }) =>
                el('li', { class: classNames('tv-talk', entering(`talk-${round.number}-${index}`, 'is-new')) }, [
                    badge(view, entry.playerId),
                    el('span', { class: 'tv-talk-body' }, [
                        el('strong', { text: playerName(view, entry.playerId) }),
                        ' ',
                        moveText(entry),
                    ]),
                ]),
            ),
    );
}

/** The newest move while it still has the spotlight (answering, not paused). */
function inSpotlight(view: HostView, now: number): { entry: AnnouncementView; index: number } | null {
    const round = view.round;
    if (view.phase !== 'SUBMITTING' || view.paused || !round) return null;
    const index = round.announcements.length - 1;
    const entry = round.announcements[index];
    return entry && now - entry.at < SPOTLIGHT_MS ? { entry, index } : null;
}

/** A new move takes the middle of the screen for a few seconds: the public shaming, with the card shown. */
export function spotlight(view: HostView, now: number): HTMLElement | null {
    const found = inSpotlight(view, now);
    if (!found) return null;
    const { entry, index } = found;
    const name = playerName(view, entry.playerId);
    const moment = entering(`spotlight-${view.round!.number}-${index}`);
    return el('div', { class: classNames('tv-spotlight', moment), attrs: { role: 'status' } }, [
        el('div', { class: 'tv-spotlight-who' }, [
            badge(view, entry.playerId),
            el('h2', {
                text: entry.kind === 'reboot' ? t('host.spotRebooted', { name }) : t('host.spotConfessed', { name }),
            }),
        ]),
        entry.kind === 'confession'
            ? whiteCardEl([entry.text], 'tv-card tv-spotlight-card')
            : el('p', { class: 'tv-spotlight-sub', text: t('host.spotRebootedSub') }),
    ]);
}

/** How long until the spotlight goes (the TV re-renders then), or null when nothing is in it. */
export function spotlightChange(view: HostView, now: number): number | null {
    const found = inSpotlight(view, now);
    return found ? found.entry.at + SPOTLIGHT_MS - now : null;
}
