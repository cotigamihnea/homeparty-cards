import type { PlayerView, PublicPlayer } from '../../shared/views.js';
import { AVATAR_COLORS, initialOf, type AvatarColor } from '../ui/avatars.js';
import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';
import { checkIcon } from '../ui/icons.js';

/** Twelve colours; yours has a tick, one someone else has shows their initial and can't be chosen. */
export function avatarPicker(view: PlayerView, onChoose: (avatar: number) => void): HTMLElement {
    const holders = new Map(view.players.map((player) => [player.avatar, player]));
    return el('section', { class: 'avatar-picker', attrs: { 'aria-labelledby': 'avatar-title' } }, [
        el('div', { class: 'avatar-picker-head' }, [
            el('h2', { class: 'panel-title', attrs: { id: 'avatar-title' }, text: t('phone.yourColour') }),
            el('span', { class: 'field-hint', text: t('phone.colourOptional') }),
        ]),
        el(
            'ul',
            { class: 'avatar-grid' },
            AVATAR_COLORS.map((colour, avatar) =>
                el('li', {}, [avatarSwatch(colour, avatar, holders.get(avatar), view.myId, onChoose)]),
            ),
        ),
    ]);
}

function avatarSwatch(
    colour: AvatarColor,
    avatar: number,
    holder: PublicPlayer | undefined,
    myId: string,
    onChoose: (avatar: number) => void,
): HTMLButtonElement {
    const mine = holder?.id === myId;
    const taken = holder !== undefined && !mine;
    const label = taken ? t('phone.colourTaken', { colour: t(colour.name), name: holder.name }) : t(colour.name);
    const swatch = el(
        'button',
        {
            class: 'avatar-swatch',
            attrs: {
                type: 'button',
                id: `avatar-${avatar}`,
                style: `--avatar: ${colour.hex}`,
                'aria-pressed': String(mine),
                'aria-label': label,
                title: label,
            },
        },
        [
            mine ? checkIcon() : null,
            taken
                ? el('span', { class: 'avatar-holder', attrs: { 'aria-hidden': 'true' }, text: initialOf(holder.name) })
                : null,
        ],
    );
    swatch.disabled = taken;
    if (!mine && !taken) swatch.addEventListener('click', () => onChoose(avatar));
    return swatch;
}
