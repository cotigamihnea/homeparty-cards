import { describe, expect, it } from 'vitest';
import { createRejoiner, type JoinOutcome } from '../../src/client/phone/rejoin.js';

function harness(maxAttempts = 3) {
    const attempts: { name: string; done: (outcome: JoinOutcome) => void }[] = [];
    const timers: { run: () => void; cancelled: boolean }[] = [];
    const gaveUp: [string, string][] = [];
    const rejoiner = createRejoiner<string>({
        attempt: (name, done) => attempts.push({ name, done }),
        schedule: (run) => {
            const timer = { run, cancelled: false };
            timers.push(timer);
            return () => {
                timer.cancelled = true;
            };
        },
        onGiveUp: (name, reason) => gaveUp.push([name, reason]),
        retryMs: 2000,
        maxAttempts,
    });
    const fireTimers = () =>
        timers.splice(0).forEach((timer) => {
            if (!timer.cancelled) timer.run();
        });
    const answer = (index: number, outcome: JoinOutcome) => attempts[index]?.done(outcome);
    return { rejoiner, attempts, timers, gaveUp, fireTimers, answer };
}

describe('createRejoiner', () => {
    it('retries while the server still holds the old seat, and stops once seated', () => {
        const h = harness();
        h.rejoiner.start('Ana');
        h.answer(0, { ok: false, reason: 'NAME_TAKEN' });
        h.fireTimers();
        h.answer(1, { ok: true });
        h.fireTimers();
        expect(h.attempts.map((a) => a.name)).toEqual(['Ana', 'Ana']);
        expect(h.gaveUp).toEqual([]);
    });

    it('treats ALREADY_JOINED as seated (a duplicate join landed on the same socket)', () => {
        const h = harness();
        h.rejoiner.start('Ana');
        h.answer(0, { ok: false, reason: 'ALREADY_JOINED' });
        expect(h.timers).toHaveLength(0);
        expect(h.gaveUp).toEqual([]);
    });

    it('retries after an ack timeout instead of leaving a stale screen', () => {
        const h = harness();
        h.rejoiner.start('Ana');
        h.answer(0, { ok: false, reason: 'TIMEOUT' });
        h.fireTimers();
        expect(h.attempts).toHaveLength(2);
    });

    it('a new start cancels the previous chain and ignores its late answers', () => {
        const h = harness();
        h.rejoiner.start('Ana');
        h.answer(0, { ok: false, reason: 'NAME_TAKEN' });
        h.rejoiner.start('Ana');
        h.answer(0, { ok: false, reason: 'GAME_FULL' });
        h.fireTimers();
        expect(h.attempts).toHaveLength(2);
        expect(h.gaveUp).toEqual([]);
    });

    it('gives up after the last attempt with the last reason', () => {
        const h = harness(2);
        h.rejoiner.start('Ana');
        h.answer(0, { ok: false, reason: 'NAME_TAKEN' });
        h.fireTimers();
        h.answer(1, { ok: false, reason: 'NAME_TAKEN' });
        expect(h.gaveUp).toEqual([['Ana', 'NAME_TAKEN']]);
    });

    it('gives up at once on a reason that retrying cannot fix', () => {
        const h = harness();
        h.rejoiner.start('Ana');
        h.answer(0, { ok: false, reason: 'GAME_FULL' });
        expect(h.timers).toHaveLength(0);
        expect(h.gaveUp).toEqual([['Ana', 'GAME_FULL']]);
    });

    it('stop() cancels a pending retry', () => {
        const h = harness();
        h.rejoiner.start('Ana');
        h.answer(0, { ok: false, reason: 'NAME_TAKEN' });
        h.rejoiner.stop();
        h.fireTimers();
        expect(h.attempts).toHaveLength(1);
    });
});
