import type { Page } from '@playwright/test';
import { E2E_TIMING, expect, test } from './fixtures.js';
import { answer, czarOfRound, judge, phoneOf, seat } from './play.js';

const SHOTS = 'test-results/screens';

function shot(page: Page, name: string): Promise<Buffer> {
    return page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
}

test.use({ timing: { ...E2E_TIMING, roundIntroMs: 2500, revealMsPerSubmission: 1500, resultMs: 60_000 } });

test('the TV tells the round: intro, nudge, one answer at a time, the Czar’s look, every author, pause and podium', async ({
    openHost,
    openPhone,
}) => {
    test.setTimeout(60_000);
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Cara', 'Dan']);
    await phoneOf(phones, 'Ana').getByRole('button', { name: 'Start game' }).click();

    await expect(tv.locator('#app[data-phase="ROUND_START"] .tv-czar-name')).toHaveText(/is the Card Czar$/);
    await shot(tv, 'tv-intro');

    const czar = await czarOfRound(tv, 1);
    const answering = [...phones.keys()].filter((name) => name !== czar);
    await answer(phoneOf(phones, answering[0]!), 1);
    await answer(phoneOf(phones, answering[1]!), 1);
    await expect(tv.locator('.tv-nudge')).toHaveText(`Still waiting on ${answering[2]}`);
    await expect(tv.locator('.tv-player.has-answered')).toHaveCount(2);
    await shot(tv, 'tv-submitting');
    await answer(phoneOf(phones, answering[2]!), 1);

    await expect(tv.locator('.tv-reveal-count')).toHaveText('Answer 1 of 3');
    await shot(tv, 'tv-reveal');
    await expect(tv.locator('.tv-reveal-count')).toHaveText('Answer 2 of 3');
    await expect(tv.locator('.tv-submissions li')).toHaveCount(3, { timeout: 5000 });

    const czarPhone = phoneOf(phones, czar);
    await czarPhone.locator('.submission-button').nth(1).click();
    await expect(tv.locator('.tv-submissions li').nth(1).locator('.tv-looking')).toHaveText(
        `${czar} is looking at this one`,
    );
    await shot(tv, 'tv-judging-grid');
    await judge(czarPhone, null);

    const authors = tv.locator('.tv-all-answers li');
    await expect(authors).toHaveCount(3);
    for (const name of answering) await expect(tv.locator('.tv-all-answers')).toContainText(name);
    await expect(tv.locator('.tv-all-answers li.is-winner')).toHaveCount(1);
    await expect(tv.locator('.confetti')).toHaveCount(1);
    await expect(tv.locator('.tv-score-strip li')).toHaveCount(4);
    await shot(tv, 'tv-result');

    await phoneOf(phones, answering[0]!).context().close();
    await phoneOf(phones, answering[1]!).context().close();
    await expect(tv.locator('.tv-pause-overlay')).toContainText(`${answering[0]} and ${answering[1]} are away`);
    await shot(tv, 'tv-paused');

    await tv.getByRole('button', { name: 'End game' }).click();
    await tv.getByRole('button', { name: 'End it now' }).click();
    await expect(tv.locator('.tv-podium .podium-step').first()).toBeVisible();
    await expect(tv.locator('.tv-standings li')).toHaveCount(4);
    await shot(tv, 'tv-game-over');
});
