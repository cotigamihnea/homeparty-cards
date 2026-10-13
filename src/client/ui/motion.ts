import type { Phase } from '../../shared/views.js';

type Moment = { game: number; phase: Phase; round: { number: number } | null };

/** Moments that already played. Screens are rebuilt on every update, so an entrance must not replay each time. */
const played = new Set<string>();

/** True the first time a moment (e.g. `result-3`) is shown, false on every re-render after that. */
export function once(key: string): boolean {
    if (played.has(key)) return false;
    played.add(key);
    return true;
}

/** Plays an entrance class the first time a moment is shown, never again on a re-render. */
export function entering(key: string, className = 'is-entering'): string | false {
    return once(key) && className;
}

/** A new game starts every moment afresh. */
export function resetOnce(): void {
    played.clear();
}

/**
 * Back in the lobby, leaving the final scores for a new game, or finding a new game's first rounds after sleeping
 * through the end: every entrance, celebration and buzz plays again.
 */
export function resetOnNewGame(previous: Moment | null | undefined, next: Moment): void {
    const leftGameOver = previous?.phase === 'GAME_OVER' && next.phase !== 'GAME_OVER';
    const newGame = !!previous && previous.game !== next.game;
    if (next.phase === 'LOBBY' || leftGameOver || newGame) resetOnce();
}
