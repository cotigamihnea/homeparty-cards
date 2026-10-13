import { deckPanelBody, deckPanelTitle, type DeckPanelContext } from '../ui/decks/deckViews.js';
import { t } from '../ui/i18n/index.js';
import { button, noticeLine } from './parts.js';
import { panelScreen } from './settingsScreens.js';

/** The VIP's custom decks (GAME_DESIGN §12): the list, or one deck open in the editor. */
export function decksScreen(ctx: DeckPanelContext): HTMLElement {
    const open = ctx.deck.state.open;
    const done = open
        ? button(t('decks.back'), ctx.deck.act.close, { ghost: true })
        : button(t('settings.done'), ctx.close);
    return panelScreen('decks-screen', deckPanelTitle(ctx), [deckPanelBody(ctx), noticeLine(ctx.notice)], done);
}
