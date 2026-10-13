import type { JudgingView } from '../../shared/views.js';

export interface RevealStep {
    /** The answer being read out now. */
    index: number;
    total: number;
}

function stepMs(judging: JudgingView): number {
    return (judging.revealEndsAt - judging.revealStartedAt) / judging.submissions.length;
}

/** Which answer the TV is reading out at `at`; null once every answer has been read (or the server says so). */
export function revealStep(judging: JudgingView, at: number): RevealStep | null {
    const total = judging.submissions.length;
    if (judging.revealed || total === 0 || at >= judging.revealEndsAt) return null;
    const each = stepMs(judging);
    const index = each > 0 ? Math.floor((at - judging.revealStartedAt) / each) : 0;
    return { index: Math.min(Math.max(index, 0), total - 1), total };
}

/** Milliseconds until the next answer is read out (or the reveal ends); null when the reveal is over. */
export function nextRevealChange(judging: JudgingView, at: number): number | null {
    const step = revealStep(judging, at);
    if (!step) return null;
    const nextAt = judging.revealStartedAt + (step.index + 1) * stepMs(judging);
    return Math.ceil(nextAt - at);
}
