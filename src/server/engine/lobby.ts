import { AVATAR_COUNT } from '../../shared/constants.js';
import { normalizeName, sameName, validateName } from '../../shared/names.js';
import type { Action } from './actions.js';
import { crownSuccessor, findPlayer } from './players.js';
import type { GameState, PlayerState } from './state.js';

/** A disconnected seat with this name, which a returning phone may take back (CLAUDE.md fallback). */
export function findReclaimableSeat(state: GameState, rawName: string): string | null {
    const check = validateName(rawName);
    if (!check.ok) return null;
    return state.players.find((player) => !player.connected && sameName(player.name, check.name))?.id ?? null;
}

export function addPlayer(state: GameState, action: Extract<Action, { type: 'PLAYER_JOINED' }>): GameState {
    const player: PlayerState = {
        id: action.playerId,
        name: normalizeName(action.name),
        avatar: firstFreeAvatar(state.players),
        seat: state.nextSeat,
        connected: true,
        disconnectedAt: null,
        score: 0,
        hand: [],
        dealtIn: false,
    };
    return {
        ...state,
        players: [...state.players, player],
        nextSeat: state.nextSeat + 1,
        vipId: state.vipId ?? player.id,
    };
}

export function setAvatar(state: GameState, playerId: string, avatar: number): GameState {
    return {
        ...state,
        players: state.players.map((player) => (player.id === playerId ? { ...player, avatar } : player)),
    };
}

/** Takes the seat away; a kicked VIP's crown goes to the next connected seat. Cards are handled by the caller. */
export function removeSeat(state: GameState, playerId: string): GameState {
    const leaving = findPlayer(state, playerId);
    const vipId = leaving && state.vipId === playerId ? (crownSuccessor(state, leaving)?.id ?? null) : state.vipId;
    return { ...state, players: state.players.filter((player) => player.id !== playerId), vipId };
}

function firstFreeAvatar(players: readonly PlayerState[]): number {
    const used = new Set(players.map((player) => player.avatar));
    for (let avatar = 0; avatar < AVATAR_COUNT; avatar++) {
        if (!used.has(avatar)) return avatar;
    }
    return players.length % AVATAR_COUNT;
}
