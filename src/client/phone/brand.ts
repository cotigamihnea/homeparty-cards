import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';

export function miniBrand(): HTMLElement {
    return el('p', { class: 'mini-brand', text: t('appName') });
}

/** The join screen's title: the game's name on a black card, a white card behind it, and what the game is. */
export function brandStack(): HTMLElement {
    return el('div', { class: 'phone-brand' }, [
        el('div', { class: 'phone-brand-cards' }, [
            el('div', { class: 'phone-brand-back', attrs: { 'aria-hidden': 'true' } }),
            el('h1', { class: 'phone-brand-card', text: t('appName') }),
        ]),
        el('p', { class: 'phone-tagline', text: t('phone.joinTagline') }),
    ]);
}
