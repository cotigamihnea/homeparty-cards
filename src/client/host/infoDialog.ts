import type { HostView } from '../../shared/views.js';
import { textButton } from '../ui/button.js';
import { el } from '../ui/dom.js';
import { t, type MessageKey } from '../ui/i18n/index.js';
import { dialogFrame } from './dialog.js';

export type InfoPage = 'about' | 'help';

export interface InfoDialogContext {
    page: InfoPage;
    act: { close(): void };
}

const CREDITS: readonly (readonly [label: MessageKey, text: MessageKey])[] = [
    ['about.cardsLabel', 'about.cards'],
    ['about.dataLabel', 'about.data'],
    ['about.nameLabel', 'about.trademark'],
    ['about.soundsLabel', 'about.sounds'],
    ['about.fontLabel', 'about.font'],
    ['about.codeLabel', 'about.code'],
];

/** About & credits: what the licences ask for (the card content's above all), and that the game is free. */
function aboutBody(): HTMLElement[] {
    return [
        el('div', { class: 'about-app' }, [
            el('p', { class: 'about-name', text: t('appName') }),
            el('p', { class: 'about-version', text: t('about.version', { version: __APP_VERSION__ }) }),
            el('p', { class: 'unofficial', text: t('unofficial') }),
            el('p', { text: t('about.free') }),
        ]),
        el(
            'dl',
            { class: 'about-credits' },
            CREDITS.map(([label, text]) => el('div', {}, [el('dt', { text: t(label) }), el('dd', { text: t(text) })])),
        ),
    ];
}

/** A command or config to copy, kept exactly as typed. */
function code(text: string): HTMLElement {
    return el('pre', { class: 'help-code', text });
}

/** The fixes for the system the laptop runs, in the order they usually help (same Wi-Fi first, typing last). */
function helpSteps(view: HostView): (HTMLElement | string)[] {
    const port = new URL(view.network.joinUrl).port;
    switch (view.network.host) {
        case 'windows':
            return [t('help.private'), t('help.firewall')];
        case 'wsl-nat':
            return [
                el('div', {}, [
                    el('p', { text: t('help.wsl') }),
                    code('[wsl2]\nnetworkingMode=mirrored'),
                    el('p', { text: t('help.wslAfter') }),
                ]),
            ];
        case 'wsl-mirrored':
            return [
                t('help.private'),
                el('div', {}, [
                    el('p', { text: t('help.wslFirewall') }),
                    code(
                        `New-NetFirewallHyperVRule -Name Homeparty-Cards -DisplayName "Homeparty Cards" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts ${port}`,
                    ),
                ]),
            ];
        case 'other':
            return [t('help.otherFirewall')];
    }
}

/** Can't connect? The address and the QR code (the panel never hides the way in), then the fixes. */
function helpBody(view: HostView): HTMLElement[] {
    const steps = [t('help.sameWifi'), ...helpSteps(view), t('help.typeIt')];
    return [
        el('div', { class: 'help-join' }, [
            el('img', {
                class: 'help-qr',
                attrs: {
                    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(view.network.qrSvg)}`,
                    alt: t('host.qrAlt', { url: view.network.joinUrl }),
                    width: '160',
                    height: '160',
                },
            }),
            el('p', { class: 'help-join-text' }, [
                el('span', { class: 'help-join-label', text: t('help.joinAt') }),
                el('span', { class: 'help-join-url', text: view.network.joinUrl }),
            ]),
        ]),
        el(
            'ol',
            { class: 'help-steps' },
            steps.map((step) => el('li', {}, [typeof step === 'string' ? el('p', { text: step }) : step])),
        ),
    ];
}

/** About & credits, or the connection help: a panel over the lobby for the laptop. */
export function infoDialog(view: HostView, ctx: InfoDialogContext): HTMLElement {
    const about = ctx.page === 'about';
    return dialogFrame({
        titleId: 'info-dialog-title',
        title: about ? t('about.title') : t('help.title'),
        scrollKey: `dialog-${ctx.page}`,
        onClose: ctx.act.close,
        body: about ? aboutBody() : helpBody(view),
        foot: [textButton(t('settings.done'), ctx.act.close, { attrs: { id: 'info-done' } })],
    });
}
