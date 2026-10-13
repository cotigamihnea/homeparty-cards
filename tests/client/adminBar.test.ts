// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { adminBar, type AdminActions, type AdminState } from '../../src/client/host/adminBar.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import { hostView } from './views.js';

setLanguage('en');

function bar(sound: AdminState['sound']) {
    const act = new Proxy(
        {},
        { get: (target: Record<string, unknown>, key: string) => (target[key] ??= vi.fn()) },
    ) as unknown as AdminActions;
    const state: AdminState = {
        pending: false,
        notice: null,
        confirmEnd: false,
        confirmStart: false,
        confirmLeave: null,
        feverName: null,
        sound,
    };
    const node = adminBar(hostView({ phase: 'LOBBY', round: null }), state, act);
    document.body.replaceChildren(node);
    return { node, act };
}

describe('the sound controls on the laptop', () => {
    it('say whether sound is on, in words, and switch it', () => {
        const { node, act } = bar({ muted: false, volume: 0.8 });
        const toggle = node.querySelector<HTMLButtonElement>('#admin-sound')!;
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
        expect(toggle.getAttribute('aria-label')).toBe('Sound');
        expect(toggle.textContent).toBe('Sound on');
        toggle.click();
        expect(act.toggleSound).toHaveBeenCalledOnce();
        expect(bar({ muted: true, volume: 0.8 }).node.querySelector('#admin-sound')?.textContent).toBe('Sound off');
    });

    it('set the volume when the slider is let go', () => {
        const { node, act } = bar({ muted: false, volume: 0.8 });
        const slider = node.querySelector<HTMLInputElement>('#admin-volume')!;
        expect(slider.value).toBe('80');
        expect(slider.getAttribute('aria-label')).toBe('Volume');
        slider.value = '40';
        slider.dispatchEvent(new Event('change'));
        expect(act.setVolume).toHaveBeenCalledWith(0.4);
    });
});
