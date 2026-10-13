import { RANDO_ID } from '../../shared/constants.js';
import { updatePlayer } from './players.js';
import type { GameState } from './state.js';

/** Anyone who can score. */
export interface Contestant {
    id: string;
    score: number;
    /** Seat order breaks ties in a list; Rando comes after every seat. */
    seat: number;
}

/** The seated players, plus Rando Cardrissian when it plays this game. */
export function contestants(state: GameState): Contestant[] {
    const seated = state.players.map((player) => ({ id: player.id, score: player.score, seat: player.seat }));
    return state.rando ? [...seated, { id: RANDO_ID, score: state.rando.score, seat: Infinity }] : seated;
}

/** The ids with the top score (several when they tie). */
export function topScorers(state: GameState): string[] {
    const all = contestants(state);
    const best = Math.max(...all.map((contestant) => contestant.score));
    return all.filter((contestant) => contestant.score === best).map((contestant) => contestant.id);
}

export function addPoint(state: GameState, contestantId: string): GameState {
    if (contestantId === RANDO_ID) return state.rando ? { ...state, rando: { score: state.rando.score + 1 } } : state;
    return updatePlayer(state, contestantId, (player) => ({ ...player, score: player.score + 1 }));
}
