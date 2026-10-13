import { requireRound } from './players.js';
import type { GameState, PlayerState } from './state.js';

/** Who may answer this round: dealt-in, connected non-Czars (only the contenders in sudden death). */
export function isEligibleSubmitter(state: GameState, player: PlayerState, czarId: string): boolean {
    return player.dealtIn && player.connected && player.id !== czarId && isContender(state, player.id);
}

export function isContender(state: GameState, playerId: string): boolean {
    return !state.suddenDeath || state.suddenDeath.contenderIds.includes(playerId);
}

export function eligibleSubmitters(state: GameState): PlayerState[] {
    const { czarId } = requireRound(state);
    return state.players.filter((player) => isEligibleSubmitter(state, player, czarId));
}
