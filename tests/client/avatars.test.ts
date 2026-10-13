// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { AVATAR_COLORS, avatarBadge, initialOf } from '../../src/client/ui/avatars.js';
import { AVATAR_COUNT } from '../../src/shared/constants.js';
import { player } from './views.js';

describe('avatars', () => {
    it('has one distinct colour per avatar', () => {
        expect(AVATAR_COLORS).toHaveLength(AVATAR_COUNT);
        expect(new Set(AVATAR_COLORS.map((colour) => colour.hex)).size).toBe(AVATAR_COUNT);
    });

    it('uses the first letter of the name, as a capital, even for emoji and accents', () => {
        expect(initialOf('ana')).toBe('A');
        expect(initialOf('  ștefan')).toBe('Ș');
        expect(initialOf('👩🏽‍🚀 Ana')).toBe('👩🏽‍🚀');
        expect(initialOf('')).toBe('?');
    });

    it('draws the colour and the initial; the name stays text', () => {
        const badge = avatarBadge(player('p1', { name: '<b>x</b>', avatar: 3 }));
        expect(badge.textContent).toBe('<');
        expect(badge.querySelector('b')).toBeNull();
        expect(badge.getAttribute('style')).toContain(AVATAR_COLORS[3]!.hex);
        expect(badge.getAttribute('aria-hidden')).toBe('true');
    });

    it('falls back to the first colour for an unknown avatar number', () => {
        expect(avatarBadge(player('p1', { avatar: 99 })).getAttribute('style')).toContain(AVATAR_COLORS[0]!.hex);
    });
});
