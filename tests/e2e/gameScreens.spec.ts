import type { Page } from '@playwright/test';
import { E2E_TIMING, PHONE_VIEWPORTS, expect, expectNoHorizontalScroll, joinAs, test } from './fixtures.js';
import { answer, czarOfRound, phoneOf, seat } from './play.js';

const SHOTS = 'test-results/screens';

test.use({ timing: { ...E2E_TIMING, resultMs: 60_000 } });

function shot(page: Page, name: string): Promise<Buffer> {
    return page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled', fullPage: true });
}

for (const viewport of PHONE_VIEWPORTS) {
    test(`game screens with ${viewport.width}px phones and the TV`, async ({ openHost, openPhone }) => {
        test.setTimeout(90_000);
        const withTv = viewport === PHONE_VIEWPORTS[0];
        const p = (name: string) => `phone-${viewport.width}-${name}`;
        const tv = await openHost();
        const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Ioana-Cristina B', 'Dan'], viewport);
        const ana = phoneOf(phones, 'Ana');
        await ana.getByRole('button', { name: 'Start game' }).click();
        const czar = await czarOfRound(tv, 1);
        const [first, second, last] = [...phones].filter(([name]) => name !== czar).map(([, page]) => page);

        const eve = await openPhone(viewport);
        await joinAs(eve, 'Eve');
        await expect(eve.locator('.wait-screen')).toBeVisible();
        await shot(eve, p('dealt-in-next'));
        await shot(phoneOf(phones, czar), p('czar-waiting'));

        await expect(first!.locator('.answer-screen')).toBeVisible();
        await shot(first!, p('answer'));
        await first!.locator('.hand-card').first().click();
        await shot(first!, p('answer-selected'));
        await answer(first!, 1);
        await shot(first!, p('answer-sent'));
        await answer(second!, 1);
        if (withTv) {
            await expect(tv.locator('.tv-answered')).toHaveText('2 of 3 answered');
            await shot(tv, 'tv-round');
        }
        await answer(last!, 1);

        const czarPhone = phoneOf(phones, czar);
        await expect(czarPhone.locator('.judging-screen')).toBeVisible();
        await shot(czarPhone, p('czar-reading'));
        await czarPhone.locator('.submission-button').nth(1).click();
        await expect(czarPhone.getByRole('button', { name: 'Pick this answer' })).toBeEnabled();
        await shot(czarPhone, p('czar-judging'));
        await shot(first!, p('watch-judging'));
        if (withTv) {
            await expect(tv.locator('.tv-submissions .is-highlighted')).toHaveCount(1);
            await shot(tv, 'tv-judging');
        }
        await czarPhone.getByRole('button', { name: 'Pick this answer' }).click();
        await expect(czarPhone.getByRole('button', { name: 'Yes, this one wins' })).toBeVisible();
        await shot(czarPhone, p('czar-confirm'));
        await czarPhone.getByRole('button', { name: 'Yes, this one wins' }).click();
        await expect(ana.locator('.result-screen')).toBeVisible();
        await shot(ana, p('result-vip'));
        if (withTv) await shot(tv, 'tv-result');

        await ana.getByRole('button', { name: 'VIP menu' }).click();
        await ana.getByRole('button', { name: 'End game' }).click();
        await shot(ana, p('end-game-confirm'));
        await ana.getByRole('button', { name: 'End it now' }).click();
        await expect(ana.locator('.game-over-screen')).toBeVisible();
        await shot(ana, p('game-over-vip'));
        await shot(second!, p('game-over'));
        if (withTv) await shot(tv, 'tv-game-over');

        await tv.getByRole('button', { name: 'Back to lobby' }).click();
        await tv.getByRole('button', { name: 'Remove Dan' }).click();
        const dan = phoneOf(phones, 'Dan');
        await expect(dan.locator('.status-screen')).toBeVisible();
        await shot(dan, p('kicked'));
        if (withTv) await shot(tv, 'tv-lobby-admin');
        for (const phone of [...phones.values(), eve]) {
            if (!phone.isClosed()) await expectNoHorizontalScroll(phone);
        }
    });
}
