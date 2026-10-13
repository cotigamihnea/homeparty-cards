import { RANDO_ID } from '../../shared/constants.js';
import type { CommonView, PublicPlayer, RoundView, VoidReason } from '../../shared/views.js';
import { RANDO_AVATAR } from './avatars.js';
import { t } from './i18n/index.js';

/** Rando Cardrissian as a player to name and badge, while it plays; it never takes a seat. */
function randoPlayer(view: CommonView): PublicPlayer | undefined {
    if (!view.rando) return undefined;
    return {
        id: RANDO_ID,
        name: t('rando.name'),
        avatar: RANDO_AVATAR,
        score: view.rando.score,
        connected: true,
        isVip: false,
        isCzar: false,
        hasSubmitted: false,
        inRound: true,
    };
}

export function findPlayer(view: CommonView, playerId: string | undefined): PublicPlayer | undefined {
    if (playerId === RANDO_ID) return randoPlayer(view);
    return view.players.find((player) => player.id === playerId);
}

/** Everyone with a score: the players, then Rando Cardrissian when it plays. */
export function scoreboardPlayers(view: CommonView): PublicPlayer[] {
    const rando = randoPlayer(view);
    return rando ? [...view.players, rando] : view.players;
}

export function playerName(view: CommonView, playerId: string | undefined): string {
    return findPlayer(view, playerId)?.name ?? t('game.someoneWhoLeft');
}

/** "Round 3", the sudden-death round, or the Happy Ending. */
export function roundLabel(view: CommonView): string {
    if (view.phase === 'WRITING') return t('fever.title');
    if (view.round?.finale) return t('game.happyEnding');
    return view.suddenDeath
        ? t('game.suddenDeath', { number: view.suddenDeath.round })
        : t('game.round', { number: view.round?.number ?? 0 });
}

/** "Ana wins the round", or in the Happy Ending, the haiku. */
export function roundWinnerText(view: CommonView, winnerId: string): string {
    const name = playerName(view, winnerId);
    return view.round?.finale ? t('game.haikuWinner', { name }) : t('game.roundWinner', { name });
}

/** The VIP's button on a result: the next round, or after the Happy Ending's haiku, the final scores. */
export function advanceText(view: CommonView): string {
    return view.round?.finale ? t('game.showFinalScores') : t('game.nextRound');
}

export function answeredText(round: RoundView): string {
    return t('game.answered', { answered: round.answeredCount, expected: round.expectedCount });
}

export function voidReasonText(reason: VoidReason): string {
    return `${t(`game.voidReasons.${reason}`)} ${t('game.cardsBack')}`;
}

export function winnersTitle(view: CommonView, winnerIds: readonly string[]): string {
    if (winnerIds.length === 1 && winnerIds[0] === RANDO_ID) return t('rando.winsGame');
    const winners = winnerIds.map((id) => playerName(view, id));
    return winners.length > 1
        ? t('game.coWinners', { names: winners.join(' & ') })
        : t('game.winner', { name: winners[0] ?? '' });
}
