import { textButton } from '../ui/button.js';
import { deckPanelBody, deckPanelTitle, type DeckPanelContext } from '../ui/decks/deckViews.js';
import { el } from '../ui/dom.js';
import { t } from '../ui/i18n/index.js';
import { dialogFrame } from './dialog.js';

export interface DecksDialogContext extends DeckPanelContext {
    /** Where this laptop keeps its decks, from the server's hello. */
    folder: string | null;
}

/** The laptop's custom decks: the same list and editor as the VIP's phone, plus where the files are. */
export function decksDialog(ctx: DecksDialogContext): HTMLElement {
    const open = ctx.deck.state.open;
    return dialogFrame({
        titleId: 'decks-dialog-title',
        title: deckPanelTitle(ctx),
        scrollKey: `dialog-decks-${open?.id ?? 'list'}`,
        onClose: ctx.close,
        body: [deckPanelBody(ctx)],
        foot: [
            ctx.notice ? el('p', { class: 'admin-notice', attrs: { role: 'alert' }, text: ctx.notice }) : null,
            ctx.folder ? el('p', { class: 'deck-folder', text: t('decks.folder', { folder: ctx.folder }) }) : null,
            open
                ? textButton(t('decks.back'), ctx.deck.act.close, { ghost: true, attrs: { id: 'decks-done' } })
                : textButton(t('settings.done'), ctx.close, { attrs: { id: 'decks-done' } }),
        ],
    });
}
