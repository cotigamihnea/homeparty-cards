import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';
import { miniBrand } from './brand.js';
import { button } from './parts.js';

function statusScreen(title: string, body: string | null, action: HTMLElement | null): HTMLElement {
    return el('div', { class: 'phone-screen status-screen' }, [
        miniBrand(),
        el('h1', { class: 'screen-title', text: title }),
        body ? el('p', { class: 'screen-hint', text: body }) : null,
        action,
    ]);
}

export function reclaimingScreen(): HTMLElement {
    return statusScreen(t('phone.reclaiming'), null, null);
}

export function kickedScreen(onJoinAgain: () => void): HTMLElement {
    return statusScreen(t('phone.kickedTitle'), t('phone.kickedBody'), button(t('phone.joinAgain'), onJoinAgain));
}

export function replacedScreen(onPlayHere: () => void): HTMLElement {
    return statusScreen(t('phone.replacedTitle'), t('phone.replacedBody'), button(t('phone.playHere'), onPlayHere));
}
