import type { HostView, Phase, PublicPlayer, StandingView } from '../../shared/views.js';

const NUDGE_AT_MOST = 2;

/** The last one or two players the room is waiting for, once someone has answered; otherwise null. */
export function stillThinking(view: HostView): PublicPlayer[] | null {
    if (view.phase !== 'SUBMITTING' || !view.round || view.round.answeredCount === 0) return null;
    const contenders = view.suddenDeath ? new Set(view.suddenDeath.contenderIds) : null;
    const thinking = view.players.filter(
        (player) =>
            player.connected &&
            player.inRound &&
            !player.isCzar &&
            !player.hasSubmitted &&
            (contenders?.has(player.id) ?? true),
    );
    return thinking.length > 0 && thinking.length <= NUDGE_AT_MOST ? thinking : null;
}

export interface PodiumStep {
    rank: number;
    score: number;
    playerIds: string[];
}

const PODIUM_RANKS = 3;

/** The top three ranks; players with equal scores share a step. */
export function podium(standings: readonly StandingView[]): PodiumStep[] {
    const steps: PodiumStep[] = [];
    for (const standing of standings) {
        if (standing.rank > PODIUM_RANKS) continue;
        const step = steps.find((candidate) => candidate.rank === standing.rank);
        if (step) step.playerIds.push(standing.playerId);
        else steps.push({ rank: standing.rank, score: standing.score, playerIds: [standing.playerId] });
    }
    return steps.sort((a, b) => a.rank - b.rank);
}

/** Columns for the judging grid: one row up to 4 answers, then two rows (12 players means up to 11 answers). */
export function gridColumns(count: number): number {
    if (count <= 4) return Math.max(1, count);
    if (count <= 6) return 3;
    if (count <= 8) return 4;
    return 6;
}

/** An empty lobby this long suggests phones can't reach the laptop. */
export const HELP_AFTER_MS = 60_000;

export interface HelpWatch {
    phase: Phase;
    /** Has any phone joined since this TV page opened? */
    everJoined: boolean;
    /** The connection help has already opened by itself once. */
    shown: boolean;
    /** When this TV page first showed the lobby (null before). */
    openedAt: number | null;
}

/** The connection help opens by itself once, when the lobby has stayed empty for a while. */
export function helpDue(watch: HelpWatch, now: number, afterMs: number): boolean {
    if (watch.phase !== 'LOBBY' || watch.everJoined || watch.shown || watch.openedAt === null) return false;
    return now - watch.openedAt >= afterMs;
}

/** Game over: the podium holds this long, then each winning combo of the game this long, then round again. */
export const PODIUM_MS = 10_000;
export const REEL_SLIDE_MS = 6_000;

/** What the game-over screen shows; `cycle` counts the loops, so each slide comes in again on the next one. */
export type GameOverStage = { kind: 'podium'; cycle: number } | { kind: 'reel'; index: number; cycle: number };

/** One loop of the game-over screen: the podium, then every winning combo. */
function loopMs(entries: number): number {
    return PODIUM_MS + entries * REEL_SLIDE_MS;
}

export function gameOverStage(elapsedMs: number, entries: number): GameOverStage {
    if (entries === 0) return { kind: 'podium', cycle: 0 };
    const elapsed = Math.max(0, elapsedMs);
    const cycle = Math.floor(elapsed / loopMs(entries));
    const at = elapsed % loopMs(entries);
    if (at < PODIUM_MS) return { kind: 'podium', cycle };
    return { kind: 'reel', index: Math.floor((at - PODIUM_MS) / REEL_SLIDE_MS), cycle };
}

/** Milliseconds until the game-over screen moves on (null when it never does: no round was won). */
export function nextGameOverChange(elapsedMs: number, entries: number): number | null {
    if (entries === 0) return null;
    const at = Math.max(0, elapsedMs) % loopMs(entries);
    if (at < PODIUM_MS) return PODIUM_MS - at;
    return REEL_SLIDE_MS - ((at - PODIUM_MS) % REEL_SLIDE_MS);
}
