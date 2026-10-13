import type { GameState, PlayerState, RoundState } from './state.js';

/** For handlers that run only after checkAction allowed them: a missing round is a bug, not a user error. */
export function requireRound(state: GameState): RoundState {
    if (!state.round) throw new Error('Engine invariant broken: no current round');
    return state.round;
}

export function requirePlayer(state: GameState, playerId: string): PlayerState {
    const player = findPlayer(state, playerId);
    if (!player) throw new Error(`Engine invariant broken: no seat ${playerId}`);
    return player;
}

export function findPlayer(state: GameState, playerId: string): PlayerState | undefined {
    return state.players.find((player) => player.id === playerId);
}

export function updatePlayer(
    state: GameState,
    playerId: string,
    change: (player: PlayerState) => PlayerState,
): GameState {
    return { ...state, players: state.players.map((player) => (player.id === playerId ? change(player) : player)) };
}

export function connectedPlayers(state: GameState): PlayerState[] {
    return state.players.filter((player) => player.connected);
}

/** The first accepted seat after `afterSeat`, wrapping around the table; the first accepted seat if `afterSeat` is null. */
export function nextSeatAfter(
    players: readonly PlayerState[],
    afterSeat: number | null,
    accept: (player: PlayerState) => boolean,
): PlayerState | undefined {
    const candidates = players.filter(accept);
    if (afterSeat === null) return candidates[0];
    return candidates.find((player) => player.seat > afterSeat) ?? candidates[0];
}

/** Who gets the crown from `vip`: the next connected seat. */
export function crownSuccessor(state: GameState, vip: PlayerState): PlayerState | undefined {
    return nextSeatAfter(state.players, vip.seat, (player) => player.connected && player.id !== vip.id);
}
