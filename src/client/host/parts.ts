import type { HostView, PublicPlayer } from '../../shared/views.js';
import { avatarBadge } from '../ui/avatars.js';
import { countdown } from '../ui/countdown.js';
import { classNames, el } from '../ui/dom.js';
import { progressOf } from '../ui/fever.js';
import { findPlayer, roundLabel, scoreboardPlayers } from '../ui/gameText.js';
import { t } from '../ui/i18n/index.js';
import { checkIcon, crownIcon } from '../ui/icons.js';
import { entering } from '../ui/motion.js';
import { timerLength } from '../ui/timer.js';

export type KickButton = (player: PublicPlayer) => HTMLElement | null;

/** Round label, title and the countdown ring (a plain number for phases without a player timer). */
export function tvHeader(view: HostView, now: number, title: string): HTMLElement {
    return el('header', { class: 'tv-header' }, [
        el('span', { class: 'tv-round', text: roundLabel(view) }),
        el('h1', { class: 'tv-title', text: title }),
        countdown(view.phaseEndsAt, now, timerLength(view)),
    ]);
}

/** A player's colour and name, as the TV shows them everywhere. */
function nameTag(player: PublicPlayer): HTMLElement {
    return el('span', { class: 'name-tag' }, [
        avatarBadge(player),
        el('span', { class: 'tv-player-name', text: player.name }),
    ]);
}

/** The name tag of a player who may have left the game since; then just "someone who left". */
export function playerTag(view: HostView, playerId: string): HTMLElement {
    const player = findPlayer(view, playerId);
    return player ? nameTag(player) : el('span', { class: 'tv-player-name', text: t('game.someoneWhoLeft') });
}

/** Everyone's status this round, in seat order; the status is always spelled out, never colour alone. */
export function playerStatusList(
    view: HostView,
    kick: KickButton | null,
    players: readonly PublicPlayer[] = view.players,
): HTMLElement {
    const round = view.round?.number ?? 0;
    return el(
        'ul',
        { class: 'tv-players' },
        players.map((player) => {
            const answered =
                (view.phase === 'SUBMITTING' && player.hasSubmitted) || progressOf(view, player.id)?.done === true;
            const classes = classNames(
                'tv-player',
                !player.connected && 'is-away',
                player.isCzar && 'is-czar',
                answered && 'has-answered',
                answered && entering(`answered-${view.game}-${view.phase}-${round}-${player.id}`, 'is-flipping'),
            );
            return el('li', { class: classes }, [
                nameTag(player),
                answered ? checkIcon() : null,
                el('span', { class: 'tv-player-status', text: statusOf(view, player) }),
                player.isVip ? el('span', { class: 'vip-badge' }, [crownIcon()]) : null,
                kick?.(player) ?? null,
            ]);
        }),
    );
}

function statusOf(view: HostView, player: PublicPlayer): string {
    if (!player.connected) return t('host.reconnecting');
    const writing = progressOf(view, player.id);
    if (view.writing && writing) {
        const total = view.writing.quota.white + view.writing.quota.black;
        return writing.done ? t('fever.tvDone') : t('fever.tvCards', { count: writing.white + writing.black, total });
    }
    if (player.isCzar) return t('host.czar');
    if (!player.inRound) return t('host.nextRoundJoiner');
    if (view.phase !== 'SUBMITTING') return '';
    return player.hasSubmitted ? t('host.answered') : t('host.thinking');
}

/**
 * Who the room is waiting on while the full player list is off screen (judging, results): only players whose
 * phones dropped, with the laptop's remove button. Nothing at all while everyone is here.
 */
export function awayStrip(view: HostView, kick: KickButton | null): HTMLElement | null {
    const away = view.players.filter((player) => !player.connected);
    return away.length > 0 ? el('div', { class: 'tv-away' }, [playerStatusList(view, kick, away)]) : null;
}

/** Everyone's score, leaders first, in one row (a full room shows as many as fit, leaders always included). */
export function scoreStrip(view: HostView): HTMLElement {
    const ranked = [...scoreboardPlayers(view)].sort((a, b) => b.score - a.score);
    return el(
        'ol',
        { class: 'tv-score-strip', attrs: { 'aria-label': t('game.scores') } },
        ranked.map((player) =>
            el('li', {}, [nameTag(player), el('span', { class: 'tv-score', text: String(player.score) })]),
        ),
    );
}

export function tvPage(className: string, children: readonly (Node | null)[]): HTMLElement {
    return el('div', { class: `host-page tv-game ${className}` }, children);
}
