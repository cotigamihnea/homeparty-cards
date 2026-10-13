import type { PublicPlayer } from '../../shared/views.js';
import { el } from './dom.js';
import { dieIcon } from './icons.js';
import type { MessageKey } from './i18n/index.js';

export interface AvatarColor {
    hex: string;
    name: MessageKey;
}

/** One light colour per avatar number, each readable with black text on it. */
export const AVATAR_COLORS: readonly AvatarColor[] = [
    { hex: '#ff8787', name: 'colors.red' },
    { hex: '#ffa94d', name: 'colors.orange' },
    { hex: '#ffe066', name: 'colors.yellow' },
    { hex: '#c0eb75', name: 'colors.lime' },
    { hex: '#69db7c', name: 'colors.green' },
    { hex: '#63e6be', name: 'colors.mint' },
    { hex: '#66d9e8', name: 'colors.sky' },
    { hex: '#74c0fc', name: 'colors.blue' },
    { hex: '#91a7ff', name: 'colors.indigo' },
    { hex: '#b197fc', name: 'colors.violet' },
    { hex: '#f783ac', name: 'colors.pink' },
    { hex: '#dee2e6', name: 'colors.silver' },
];

/** Not a colour: Rando Cardrissian, the house rule's bot, wears a die instead. */
export const RANDO_AVATAR = -1;

export function avatarColor(avatar: number): AvatarColor {
    return AVATAR_COLORS[avatar] ?? AVATAR_COLORS[0]!;
}

/** The first character of a name as a capital; an emoji counts as one character. */
export function initialOf(name: string): string {
    const [first] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name.trim());
    return first ? first.segment.toLocaleUpperCase() : '?';
}

/** A coloured disc with the player's initial; decorative, since the name is always written next to it. */
export function avatarBadge(player: Pick<PublicPlayer, 'name' | 'avatar'>): HTMLElement {
    if (player.avatar === RANDO_AVATAR) {
        return el('span', { class: 'avatar is-rando', attrs: { 'aria-hidden': 'true' } }, [dieIcon()]);
    }
    return el('span', {
        class: 'avatar',
        text: initialOf(player.name),
        attrs: { style: `--avatar: ${avatarColor(player.avatar).hex}`, 'aria-hidden': 'true' },
    });
}
