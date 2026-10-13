// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { infoDialog } from '../../src/client/host/infoDialog.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import type { HostView } from '../../src/shared/views.js';
import { hostView } from './views.js';

setLanguage('en');

function show(page: 'about' | 'help', host: HostView['network']['host'] = 'windows') {
    const close = vi.fn();
    const view = hostView({ phase: 'LOBBY', round: null });
    const node = infoDialog({ ...view, network: { ...view.network, host } }, { page, act: { close } });
    document.body.replaceChildren(node);
    return { node, close };
}

describe('About & credits', () => {
    it('credits everyone the licences ask for, with the licences named', () => {
        const text = show('about').node.textContent ?? '';
        for (const credit of [
            'Homeparty Cards',
            'Not affiliated with Cards Against Humanity LLC.',
            'Cards Against Humanity LLC',
            'Creative Commons BY-NC-SA 2.0',
            'creativecommons.org/licenses/by-nc-sa/2.0',
            'BY-NC-SA 4.0',
            'creativecommons.org/licenses/by-nc-sa/4.0',
            'trademark of Cards Against Humanity LLC',
            'JSON Against Humanity',
            'Chris Hallberg',
            'Kenney',
            'CC0',
            'Inter',
            'Rasmus Andersson',
            'SIL Open Font License',
            'Homeparty Mafia',
            'MIT',
            'free',
        ]) {
            expect(text, credit).toContain(credit);
        }
        expect(text).toMatch(/Version \d+\.\d+\.\d+/);
    });

    it('is a labelled dialog that closes from its button', () => {
        const { node, close } = show('about');
        expect(node.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe('info-dialog-title');
        node.querySelector<HTMLButtonElement>('#dialog-close')!.click();
        expect(close).toHaveBeenCalledOnce();
    });
});

describe("Can't connect?", () => {
    it('shows where phones join and the Windows Firewall steps on Windows', () => {
        const text = show('help', 'windows').node.textContent ?? '';
        expect(text).toContain('http://10.0.0.2:4242');
        expect(text).toContain('same Wi-Fi');
        expect(text).toContain('Private');
        expect(text).toContain('Allow an app through Windows Firewall');
        expect(text).not.toContain('networkingMode=mirrored');
    });

    it('inside WSL: mirrored networking in NAT mode, the Hyper-V firewall once mirrored', () => {
        const nat = show('help', 'wsl-nat').node.textContent ?? '';
        expect(nat).toContain('networkingMode=mirrored');
        const mirrored = show('help', 'wsl-mirrored').node.textContent ?? '';
        expect(mirrored).not.toContain('networkingMode=mirrored');
        expect(mirrored).toContain('New-NetFirewallHyperVRule');
    });

    it('keeps it general elsewhere, and shows the QR code so the panel never hides the way in', () => {
        expect(show('help', 'windows').node.querySelector('.help-qr')).not.toBeNull();
        const other = show('help', 'other').node.textContent ?? '';
        expect(other).not.toContain('Windows Firewall');
        expect(other).toContain('firewall');
    });
});
