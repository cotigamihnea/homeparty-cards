import { describe, expect, it } from 'vitest';
import { nextRevealChange, revealStep } from '../../src/client/ui/reveal.js';
import type { JudgingView } from '../../src/shared/views.js';

const answer = (id: string) => ({ id, cards: [{ id: `w-${id}`, text: id }] });

/** Three answers read out over 3 s, one per second, from t = 1000. */
function judging(extra: Partial<JudgingView> = {}): JudgingView {
    return {
        submissions: [answer('a'), answer('b'), answer('c')],
        revealStartedAt: 1000,
        revealEndsAt: 4000,
        revealed: false,
        highlightedId: null,
        ...extra,
    };
}

describe('revealStep', () => {
    it('reads the answers out one by one', () => {
        expect(revealStep(judging(), 500)).toEqual({ index: 0, total: 3 });
        expect(revealStep(judging(), 1000)).toEqual({ index: 0, total: 3 });
        expect(revealStep(judging(), 2999)).toEqual({ index: 1, total: 3 });
        expect(revealStep(judging(), 3999)).toEqual({ index: 2, total: 3 });
    });

    it('is over at the end, or as soon as the server says every answer was read', () => {
        expect(revealStep(judging(), 4000)).toBeNull();
        expect(revealStep(judging({ revealed: true }), 1500)).toBeNull();
    });

    it('has nothing to read without answers', () => {
        expect(revealStep(judging({ submissions: [] }), 1500)).toBeNull();
    });
});

describe('nextRevealChange', () => {
    it('is the time left until the next answer', () => {
        expect(nextRevealChange(judging(), 1250)).toBe(750);
        expect(nextRevealChange(judging(), 500)).toBe(1500);
        expect(nextRevealChange(judging(), 3500)).toBe(500);
    });

    it('is null once the reveal is over', () => {
        expect(nextRevealChange(judging(), 4000)).toBeNull();
        expect(nextRevealChange(judging({ revealed: true }), 1000)).toBeNull();
    });
});
