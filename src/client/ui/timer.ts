import type { CommonView } from '../../shared/views.js';

/**
 * The full length of the answer or judging timer, which the countdown ring counts down from; null for the short
 * phases in between and when the timer is off. While the answers are read out, more time is left than this, so
 * the ring stays full until the judging time starts.
 */
export function timerLength(view: CommonView): number | null {
    if (view.phase === 'WRITING') {
        return view.settings.writingMinutes === null ? null : view.settings.writingMinutes * 60_000;
    }
    const seconds =
        view.phase === 'SUBMITTING'
            ? view.settings.submitSeconds
            : view.phase === 'JUDGING'
              ? view.settings.judgeSeconds
              : 0;
    return seconds > 0 ? seconds * 1000 : null;
}
