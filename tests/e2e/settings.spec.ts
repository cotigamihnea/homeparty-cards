import type { Page } from '@playwright/test';
import { PHONE_VIEWPORTS, expect, expectNoHorizontalScroll, joinAs, test } from './fixtures.js';
import { phoneOf, seat } from './play.js';

const SHOTS = 'test-results/screens';

function shot(page: Page, name: string): Promise<Buffer> {
    return page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled', fullPage: true });
}

function choose(page: Page, field: string, value: string | number): Promise<void> {
    return page.locator(`label[for="setting-${field}-${value}"]`).click();
}

for (const viewport of PHONE_VIEWPORTS) {
    test(`the VIP's settings and pack picker on a ${viewport.width}px phone, mirrored on the TV`, async ({
        openHost,
        openPhone,
    }) => {
        const tv = await openHost();
        const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Cara'], viewport);
        const ana = phoneOf(phones, 'Ana');
        await expect(phoneOf(phones, 'Bogdan').getByRole('button', { name: 'Game settings' })).toHaveCount(0);

        await ana.getByRole('button', { name: 'Game settings' }).click();
        await choose(ana, 'pointsToWin', 10);
        await choose(ana, 'handSize', 8);
        await choose(ana, 'submitSeconds', 45);
        const summary = tv.locator('.lobby-settings');
        await expect(summary).toContainText('First to 10 points');
        await expect(summary).toContainText('8 cards');
        await expect(summary).toContainText('45 s');
        await expectNoHorizontalScroll(ana);
        await shot(ana, `phone-${viewport.width}-settings`);

        await ana.getByRole('button', { name: 'Choose packs' }).click();
        await ana.getByRole('button', { name: 'Base only' }).click();
        await expect(summary).toContainText('1 pack: 1,269 white, 278 black cards');
        await expect(ana.locator('.pack-total')).toHaveText('1 pack: 1,269 white, 278 black cards');
        await expectNoHorizontalScroll(ana);
        await shot(ana, `phone-${viewport.width}-packs`);

        await ana.locator('label[for="pack-cah-base-set"]').click();
        await expect(ana.locator('.pack-picker .deck-problem')).toContainText('Not enough white cards');
        await ana.getByRole('button', { name: 'Done' }).click();
        await ana.getByRole('button', { name: 'Done' }).click();
        await expect(ana.getByRole('button', { name: 'Start game' })).toBeDisabled();
        await expect(ana.locator('.deck-problem')).toContainText('Not enough white cards');
        await expect(tv.locator('.lobby-status')).toContainText('Not enough white cards');
        await expect(tv.getByRole('button', { name: 'Start game' })).toBeDisabled();
    });
}

test('a new game language reaches the TV, every phone, and a phone still on the join screen', async ({
    openHost,
    openPhone,
}) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan']);
    const newcomer = await openPhone();
    await newcomer.getByLabel('Your name').fill('Zoe');
    const ana = phoneOf(phones, 'Ana');
    await ana.getByRole('button', { name: 'Game settings' }).click();
    await choose(ana, 'language', 'ro');
    await expect(tv.locator('#players-title')).toHaveText('Jucători');
    await expect(phoneOf(phones, 'Bogdan').getByText('Ești în joc!')).toBeVisible();
    await expect(ana.getByRole('heading', { name: 'Setările jocului' })).toBeVisible();
    await expect(newcomer.getByLabel('Numele tău')).toHaveValue('Zoe');
    await expect(tv.locator('html')).toHaveAttribute('lang', 'ro');
});

test('the laptop changes settings in its own panel', async ({ openHost, openPhone }) => {
    const tv = await openHost();
    await joinAs(await openPhone(), 'Ana');
    await tv.getByRole('button', { name: 'Settings' }).click();
    const dialog = tv.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(tv.locator('#dialog-close')).toBeFocused();
    await choose(tv, 'handSize', 12);
    await expect(tv.locator('.lobby-settings')).toContainText('12 cards');
    await shot(tv, 'tv-settings-dialog');
    await dialog.getByRole('button', { name: 'Choose packs' }).click();
    await expect(dialog.getByRole('heading', { name: 'Card packs' })).toBeVisible();
    await expect(dialog.locator('.pack-row').first()).toBeVisible();
    await shot(tv, 'tv-settings-packs');
    await tv.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(tv.getByRole('button', { name: 'Settings' })).toBeFocused();
});

test('someone joining while the VIP scrolls the pack list keeps the VIP’s place and focus', async ({
    openHost,
    openPhone,
}) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan']);
    const ana = phoneOf(phones, 'Ana');
    await ana.getByRole('button', { name: 'Game settings' }).click();
    await ana.getByRole('button', { name: 'Choose packs' }).click();
    const pack = ana.locator('#pack-cah-fifth-expansion');
    await pack.focus();
    await ana.evaluate(() => window.scrollTo(0, 700));
    const before = await ana.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(600);
    await joinAs(await openPhone(), 'Cara');
    await expect(tv.locator('.player-tile')).toHaveCount(3);
    await ana.waitForTimeout(300);
    expect(await ana.evaluate(() => window.scrollY)).toBe(before);
    await expect(ana.locator('#pack-cah-fifth-expansion')).toBeFocused();
});

test('a settings panel left open when the game starts is closed when the group is back in the lobby', async ({
    openHost,
    openPhone,
}) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Cara']);
    const ana = phoneOf(phones, 'Ana');
    await ana.getByRole('button', { name: 'Game settings' }).click();
    await expect(ana.locator('.settings-screen')).toBeVisible();
    await tv.getByRole('button', { name: 'Start game' }).click();
    await expect(tv.locator('#app[data-phase="ROUND_START"], #app[data-phase="SUBMITTING"]')).toHaveCount(1);
    await tv.getByRole('button', { name: 'End game' }).click();
    await tv.getByRole('button', { name: 'End it now' }).click();
    await tv.getByRole('button', { name: 'Back to lobby' }).click();
    await expect(ana.getByText("You're in!")).toBeVisible();
    await expect(ana.locator('.settings-screen')).toHaveCount(0);
});
