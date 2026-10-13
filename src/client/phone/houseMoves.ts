import type { PlayerView } from '../../shared/views.js';
import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';
import { button, type HouseAction, type PhoneContext } from './parts.js';
import { canConfess, canReboot } from './play.js';

/** The house rules a player may use while answering, under the hand (only those that are on and still unused). */
export function houseTools(view: PlayerView, ctx: PhoneContext): HTMLElement | null {
    if (ctx.houseAction) return null;
    const start = (id: string, text: string, action: HouseAction) =>
        button(text, () => ctx.act.setHouseAction(action), { ghost: true, disabled: ctx.pending, attrs: { id } });
    const tools = [
        canConfess(view) ? start('confess-start', t('phone.confessStart'), { kind: 'confess', cardId: null }) : null,
        canReboot(view) ? start('reboot-hand', t('phone.rebootHand'), { kind: 'reboot' }) : null,
    ].filter((tool) => tool !== null);
    return tools.length > 0 ? el('div', { class: 'house-tools' }, tools) : null;
}

/** A house-rule move asks first, in place of the answer's buttons: it costs a point, or shows a card to the room. */
export function houseConfirm(ctx: PhoneContext): HTMLElement[] {
    const action = ctx.houseAction;
    const cancel = (id: string, text: string) =>
        button(text, () => ctx.act.setHouseAction(null), { ghost: true, attrs: { id } });
    if (action?.kind === 'reboot') {
        return [
            el('p', { class: 'confirm-question', text: t('phone.rebootConfirm') }),
            button(t('phone.rebootYes'), ctx.act.reboot, { disabled: ctx.pending, attrs: { id: 'reboot-yes' } }),
            cancel('reboot-no', t('phone.rebootNo')),
        ];
    }
    const cardId = action?.cardId;
    if (!cardId) {
        return [
            el('p', { class: 'confirm-question', text: t('phone.confessPick') }),
            cancel('confess-cancel', t('phone.cancel')),
        ];
    }
    return [
        el('p', { class: 'confirm-question', text: t('phone.confessConfirm') }),
        button(t('phone.confessYes'), () => ctx.act.confess(cardId), {
            disabled: ctx.pending,
            attrs: { id: 'confess-yes' },
        }),
        cancel('confess-no', t('phone.confessNo')),
    ];
}
