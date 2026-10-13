import type { HostView } from '../../shared/views.js';
import { textButton } from '../ui/button.js';
import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';
import type { SettingsEditActions, SettingsEditContext } from '../ui/settings/editor.js';
import { catalogPicker } from '../ui/settings/packPicker.js';
import { settingsForm } from '../ui/settings/settingsForm.js';
import { dialogFrame } from './dialog.js';

export type SettingsPage = 'settings' | 'packs';

export interface SettingsDialogActions extends SettingsEditActions {
    close(): void;
    showPage(page: SettingsPage): void;
}

export interface SettingsDialogContext extends SettingsEditContext {
    page: SettingsPage;
    notice: string | null;
    act: SettingsDialogActions;
}

/** The laptop's fallback for the VIP's settings: the same form and pack picker, in a panel over the lobby. */
export function settingsDialog(view: HostView, ctx: SettingsDialogContext): HTMLElement {
    const onPacks = ctx.page === 'packs';
    const done = textButton(t('settings.done'), onPacks ? () => ctx.act.showPage('settings') : ctx.act.close, {
        attrs: { id: 'settings-done' },
    });
    return dialogFrame({
        titleId: 'settings-dialog-title',
        title: onPacks ? t('packs.title') : t('settings.title'),
        scrollKey: `dialog-${ctx.page}`,
        onClose: ctx.act.close,
        body: [
            onPacks
                ? catalogPicker(ctx, view.deck)
                : settingsForm(ctx.settings, view.deck, {
                      onChange: ctx.act.changeSettings,
                      onOpenPacks: () => ctx.act.showPage('packs'),
                  }),
        ],
        foot: [
            ctx.notice ? el('p', { class: 'admin-notice', attrs: { role: 'alert' }, text: ctx.notice }) : null,
            done,
        ],
    });
}
