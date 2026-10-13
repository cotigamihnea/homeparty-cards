import type { Page } from '@playwright/test';
import { E2E_TIMING, expect, test } from './fixtures.js';
import { answer, czarOfRound, judge, phoneOf, seat } from './play.js';

test.use({ timing: E2E_TIMING });

const SOUNDS = /(join|answered|deal|tick|win|game-over|shame|skipped|reboot)/;

/** Counts the TV's sounds by name instead of playing them. */
async function listenTo(tv: Page): Promise<void> {
    await tv.addInitScript((pattern) => {
        const played: string[] = [];
        Object.assign(window, { played });
        HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
            played.push(new RegExp(pattern).exec(this.src)?.[1] ?? this.src);
            return Promise.resolve();
        };
    }, SOUNDS.source);
    await tv.reload();
}

const played = (tv: Page) => tv.evaluate(() => (window as unknown as { played: string[] }).played);

test('the laptop TV plays the moments of a round once, remembers mute, and stays quiet after a reload', async ({
    openHost,
    openPhone,
}) => {
    const tv = await openHost();
    await listenTo(tv);
    await expect(tv.locator('#admin-sound')).toHaveAttribute('aria-pressed', 'true');
    const phones = await seat(openPhone, ['Ana', 'Bo', 'Cy']);
    await expect.poll(() => played(tv)).toEqual(['join', 'join', 'join']);

    const ana = phoneOf(phones, 'Ana');
    await ana.getByRole('button', { name: 'Start game' }).click();
    expect(await czarOfRound(tv, 1)).toBe('Ana');
    const [card] = await answer(phoneOf(phones, 'Bo'), 1);
    await answer(phoneOf(phones, 'Cy'), 1);
    await judge(ana, card!);
    // The last answer goes straight into the read-out, so only the first one ticks on the answering screen.
    await expect
        .poll(async () => (await played(tv)).filter((name) => name !== 'tick'))
        .toEqual(['join', 'join', 'join', 'answered', 'deal', 'deal', 'win']);

    await tv.locator('#admin-sound').click();
    await expect(tv.locator('#admin-sound')).toHaveAttribute('aria-pressed', 'false');
    const before = (await played(tv)).length;
    await ana.getByRole('button', { name: 'Next round' }).click();
    await czarOfRound(tv, 2);
    await tv.waitForTimeout(500);
    expect(await played(tv)).toHaveLength(before);

    await tv.reload();
    await expect(tv.locator('#admin-sound')).toHaveAttribute('aria-pressed', 'false');
    await tv.locator('#admin-sound').click();
    await tv.waitForTimeout(500);
    expect(await played(tv)).toEqual([]);
});
