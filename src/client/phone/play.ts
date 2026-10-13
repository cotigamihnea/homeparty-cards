import type { AnnouncementView, PlayerView, WhiteCardView } from '../../shared/views.js';
import type { Buzz } from '../ui/haptics.js';

export type PhoneScreen =
    | 'lobby'
    | 'writing'
    | 'intro'
    | 'czarWaiting'
    | 'dealtInNext'
    | 'sitOut'
    | 'answer'
    | 'answerSent'
    | 'czarJudging'
    | 'watchJudging'
    | 'result'
    | 'gameOver';

/** Tapping a card adds it in tap order (the answer order) or takes it back out. */
export function toggleCard(selected: readonly string[], cardId: string, pick: number): string[] {
    if (selected.includes(cardId)) return selected.filter((id) => id !== cardId);
    if (selected.length < pick) return [...selected, cardId];
    return pick === 1 ? [cardId] : [...selected];
}

/** The hand, plus the cards already sent when changing an answer (they can be sent again). */
export function choosableCards(view: PlayerView): WhiteCardView[] {
    return [...(view.mySubmission ?? []), ...view.hand];
}

/** The words on a card as this phone shows them: on a blank card, what the player wrote ('' until then). */
export function wordsOn(card: WhiteCardView, blankTexts: Readonly<Record<string, string>>): string {
    return card.blank ? (blankTexts[card.id] ?? '') : card.text;
}

/** The chosen cards this phone still has (a reboot or a confession may have swapped some out), in order. */
export function pruneSelection(selected: readonly string[], view: PlayerView): string[] {
    const choosable = new Set(choosableCards(view).map((card) => card.id));
    return selected.filter((id) => choosable.has(id));
}

/** The answer with this card in it: added, or swapped in for the last card when the answer is already full. */
export function selectionWith(selected: readonly string[], cardId: string, pick: number): string[] {
    if (selected.includes(cardId)) return [...selected];
    return selected.length < pick ? [...selected, cardId] : [...selected.slice(0, pick - 1), cardId];
}

/** Which screen this phone shows; editingAnswer is true while the player changes an answer already sent. */
export function phoneScreen(view: PlayerView, editingAnswer: boolean): PhoneScreen {
    const isCzar = view.round?.czarId === view.myId;
    switch (view.phase) {
        case 'LOBBY':
            return 'lobby';
        case 'WRITING':
            return 'writing';
        case 'ROUND_START':
            return 'intro';
        case 'SUBMITTING': {
            if (isCzar) return 'czarWaiting';
            const me = view.players.find((player) => player.id === view.myId);
            if (!me?.inRound) return 'dealtInNext';
            if (!view.canSubmit) return 'sitOut';
            return view.mySubmission && !editingAnswer ? 'answerSent' : 'answer';
        }
        case 'JUDGING':
            return isCzar ? 'czarJudging' : 'watchJudging';
        case 'ROUND_RESULT':
            return 'result';
        case 'GAME_OVER':
            return 'gameOver';
    }
}

function myAnnouncement(view: PlayerView, kind: AnnouncementView['kind']): boolean {
    return view.round?.announcements.some((entry) => entry.kind === kind && entry.playerId === view.myId) ?? false;
}

/**
 * Rebooting the Universe: on, answering this round, a point to spend, not used yet this round; never in the Happy
 * Ending or in sudden death.
 */
export function canReboot(view: PlayerView): boolean {
    const me = view.players.find((player) => player.id === view.myId);
    return (
        view.settings.rebootTheUniverse &&
        view.canSubmit &&
        !view.round?.finale &&
        !view.suddenDeath &&
        (me?.score ?? 0) >= 1 &&
        !myAnnouncement(view, 'reboot')
    );
}

/** Never Have I Ever: on, answering this round, a card in hand, no confession yet this round. */
export function canConfess(view: PlayerView): boolean {
    return (
        view.settings.neverHaveIEver && view.canSubmit && view.hand.length > 0 && !myAnnouncement(view, 'confession')
    );
}

/** The VIP's lobby panels on top of the waiting screen. */
export type LobbyPanel = 'settings' | 'packs' | 'players' | 'decks' | null;

/** An open panel stays open only for the VIP, and only in the lobby. */
export function lobbyPanel(view: PlayerView, panel: LobbyPanel): LobbyPanel {
    const isVip = view.players.some((player) => player.id === view.myId && player.isVip);
    return view.phase === 'LOBBY' && isVip ? panel : null;
}

/** A moment worth a buzz on this phone, keyed so it buzzes once however often the view arrives. */
export function buzzMoment(view: PlayerView): { key: string; kind: Buzz } | null {
    const round = view.round?.number ?? 0;
    if (view.phase === 'JUDGING' && view.judging?.revealed && view.round?.czarId === view.myId) {
        return { key: `judge-${round}`, kind: 'yourTurn' };
    }
    if (view.phase === 'ROUND_RESULT' && view.result?.kind === 'winner' && view.result.winnerId === view.myId) {
        return { key: `won-${round}`, kind: 'won' };
    }
    if (view.phase === 'GAME_OVER' && view.gameOver?.winnerIds.includes(view.myId)) {
        return { key: 'game-won', kind: 'gameWon' };
    }
    return null;
}
