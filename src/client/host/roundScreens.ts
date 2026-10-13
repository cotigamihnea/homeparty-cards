import type { HostView } from '../../shared/views.js';
import { avatarBadge } from '../ui/avatars.js';
import { blackCardEl } from '../ui/cards.js';
import { classNames, el } from '../ui/dom.js';
import { answeredText, findPlayer, playerName, roundLabel } from '../ui/gameText.js';
import { formatList, t } from '../ui/i18n/index.js';
import { entering } from '../ui/motion.js';
import { playerStatusList, tvHeader, tvPage, type KickButton } from './parts.js';
import { stillThinking } from './stage.js';
import { tableTalk } from './tableTalk.js';

/** ROUND_START: the round number, who judges, and the prompt card dealt onto the table. */
export function introScreen(view: HostView): HTMLElement {
    const round = view.round!;
    const czar = findPlayer(view, round.czarId);
    const moment = entering(`intro-${round.number}`);
    return tvPage(classNames('tv-intro-screen', moment), [
        el('main', { class: 'tv-intro' }, [
            blackCardEl(round.black, { className: 'tv-card is-prompt' }),
            el('div', { class: 'tv-intro-text' }, [
                el('h1', { class: 'tv-intro-round', text: roundLabel(view) }),
                round.finale ? el('p', { class: 'tv-finale-line', text: t('game.finaleLine') }) : null,
                el('div', { class: 'tv-czar' }, [
                    czar ? avatarBadge(czar) : null,
                    el('p', {
                        class: 'tv-czar-name',
                        text: t('game.czarIs', { name: playerName(view, round.czarId) }),
                    }),
                ]),
            ]),
        ]),
    ]);
}

/** SUBMITTING: the prompt, who has answered (never what), and a nudge for the last one or two. */
export function submittingScreen(view: HostView, now: number, kick: KickButton | null): HTMLElement {
    const round = view.round!;
    const waiting = stillThinking(view);
    return tvPage('tv-round-screen', [
        tvHeader(view, now, t('game.czarIs', { name: playerName(view, round.czarId) })),
        el('main', { class: 'tv-round-main' }, [
            blackCardEl(round.black, { className: 'tv-card is-prompt' }),
            el('aside', { class: 'tv-side' }, [
                el('p', { class: 'tv-answered', text: answeredText(round) }),
                waiting
                    ? el('p', {
                          class: 'tv-nudge',
                          text: t('host.stillWaiting', { names: formatList(waiting.map((player) => player.name)) }),
                      })
                    : null,
                playerStatusList(view, kick),
                tableTalk(view),
            ]),
        ]),
    ]);
}
