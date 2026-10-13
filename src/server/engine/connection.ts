import { crownSuccessor, findPlayer, updatePlayer } from './players.js';
import type { GameState } from './state.js';

export function markDisconnected(state: GameState, playerId: string, now: number): GameState {
    return updatePlayer(state, playerId, (player) =>
        player.connected ? { ...player, connected: false, disconnectedAt: now } : player,
    );
}

export function markReconnected(state: GameState, playerId: string): GameState {
    return updatePlayer(state, playerId, (player) => ({ ...player, connected: true, disconnectedAt: null }));
}

/** When and to whom the crown passes from a VIP who is away; null while nobody connected could take it. */
function vipHandover(state: GameState): { at: number; toId: string } | null {
    const vip = state.vipId ? findPlayer(state, state.vipId) : undefined;
    if (!vip || vip.disconnectedAt === null) return null;
    const successor = crownSuccessor(state, vip);
    return successor ? { at: vip.disconnectedAt + state.timing.vipGraceMs, toId: successor.id } : null;
}

export function vipGraceEndsAt(state: GameState): number | null {
    return vipHandover(state)?.at ?? null;
}

export function passCrownIfVipAway(state: GameState, now: number): GameState {
    const handover = vipHandover(state);
    return handover && now >= handover.at ? { ...state, vipId: handover.toId } : state;
}

/** A Czar who is away during judging gets 20 s, counted from the later of the disconnect and judging starting. */
export function czarGraceEndsAt(state: GameState): number | null {
    const round = state.round;
    if (state.phase !== 'JUDGING' || !round) return null;
    const czar = findPlayer(state, round.czarId);
    if (!czar || czar.connected) return null;
    return Math.max(czar.disconnectedAt ?? round.judgingStartedAt, round.judgingStartedAt) + state.timing.czarGraceMs;
}
