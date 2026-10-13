import { requireRound } from './players.js';
import type { Announcement, GameState, RoundState } from './state.js';

export function announce(state: GameState, announcement: Announcement): GameState {
    const round = requireRound(state);
    return { ...state, round: { ...round, announcements: [...round.announcements, announcement] } };
}

/** House rules that are once a round per player check this. */
export function hasAnnounced(round: RoundState, kind: Announcement['kind'], playerId: string): boolean {
    return round.announcements.some((entry) => entry.kind === kind && entry.playerId === playerId);
}
