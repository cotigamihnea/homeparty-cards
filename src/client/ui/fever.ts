import type { CommonView, PublicPlayer, WritingProgress } from '../../shared/views.js';
import { t } from './i18n/index.js';

export function progressOf(view: CommonView, playerId: string): WritingProgress | undefined {
    return view.writing?.progress.find((entry) => entry.playerId === playerId);
}

/** The players still writing who are here (an away phone doesn't hold the game up). */
export function stillWriting(view: CommonView): PublicPlayer[] {
    return view.players.filter((player) => player.connected && progressOf(view, player.id)?.done === false);
}

/** "2 players haven't finished. Their missing cards will come from the packs." */
export function startNowQuestion(view: CommonView): string {
    return t('fever.startNowConfirm', { count: stillWriting(view).length });
}
