import type { HostView } from '../../shared/views.js';
import { blackCardEl } from '../ui/cards.js';
import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';
import { playerStatusList, tvHeader, tvPage, type KickButton } from './parts.js';

/** Custom Fever on the TV: everyone writing on their phones, who is done, and how far each is. Never a card's text. */
export function writingScreen(view: HostView, now: number, kick: KickButton | null): HTMLElement {
    const progress = view.writing?.progress ?? [];
    const done = progress.filter((entry) => entry.done).length;
    return tvPage('tv-round-screen tv-writing-screen', [
        tvHeader(view, now, t('fever.tvTitle')),
        el('main', { class: 'tv-round-main' }, [
            blackCardEl({ text: t('fever.tvCard'), pick: 1 }, { className: 'tv-card is-prompt' }),
            el('aside', { class: 'tv-side' }, [
                el('p', { class: 'tv-answered', text: t('fever.doneCount', { count: done, total: progress.length }) }),
                el('p', {
                    class: 'tv-writing-hint',
                    text: view.phaseEndsAt === null && !view.paused ? t('fever.tvHintNoLimit') : t('fever.tvHint'),
                }),
                playerStatusList(view, kick),
            ]),
        ]),
    ]);
}
