import { RANDO_ID } from '../../shared/constants.js';
import type { AnnouncementView, HostView, RoundResultView } from '../../shared/views.js';
import { revealStep } from '../ui/reveal.js';

export type SoundName = 'join' | 'answered' | 'deal' | 'tick' | 'win' | 'gameOver' | 'shame' | 'skipped' | 'reboot';

/** A sound that belongs to a moment on the TV; the key names the moment, so it plays once however often it renders. */
export interface Cue {
    key: string;
    sound: SoundName;
}

/** The last seconds of a running timer tick. */
const TICK_SECONDS = 5;

const TALK_SOUND: Record<AnnouncementView['kind'], SoundName> = { confession: 'shame', reboot: 'reboot' };

/** Every sound that belongs to what the TV shows at `now` (server time): who joined, answered, was read out, won… */
export function soundCues(view: HostView, now: number): Cue[] {
    const round = view.round;
    const inRound = `g${view.game}-r${round?.number ?? 0}`;
    const cues: Cue[] = view.players.map((player) => ({ key: `join-${player.id}`, sound: 'join' }));
    for (const entry of view.writing?.progress.filter((p) => p.done) ?? []) {
        cues.push({ key: `g${view.game}-writing-done-${entry.playerId}`, sound: 'answered' });
    }
    if (view.phase === 'SUBMITTING') {
        for (const player of view.players.filter((p) => p.hasSubmitted)) {
            cues.push({ key: `${inRound}-answered-${player.id}`, sound: 'answered' });
        }
    }
    round?.announcements.forEach((entry, i) =>
        cues.push({ key: `${inRound}-talk-${i}`, sound: TALK_SOUND[entry.kind] }),
    );
    const step = view.judging && !view.paused ? revealStep(view.judging, now) : null;
    if (step) cues.push({ key: `${inRound}-deal-${step.index}`, sound: 'deal' });
    const tick = tickSecond(view, now);
    if (tick !== null) cues.push({ key: `${inRound}-${view.phase}-tick-${tick}`, sound: 'tick' });
    if (view.result) cues.push({ key: `${inRound}-result`, sound: resultSound(view.result) });
    if (view.gameOver) {
        const randoWon = view.gameOver.winnerIds.length === 1 && view.gameOver.winnerIds[0] === RANDO_ID;
        cues.push({ key: `g${view.game}-over`, sound: randoWon ? 'shame' : 'gameOver' });
    }
    return cues;
}

function resultSound(result: RoundResultView): SoundName {
    if (result.kind === 'void') return 'skipped';
    return result.winnerId === RANDO_ID ? 'shame' : 'win';
}

/** The whole seconds left on a running answer or judging timer, while it is in its last few; otherwise null. */
function tickSecond(view: HostView, now: number): number | null {
    if (view.paused || view.phaseEndsAt === null) return null;
    if (view.phase !== 'SUBMITTING' && view.phase !== 'JUDGING' && view.phase !== 'WRITING') return null;
    const left = Math.ceil((view.phaseEndsAt - now) / 1000);
    return left >= 1 && left <= TICK_SECONDS ? left : null;
}
