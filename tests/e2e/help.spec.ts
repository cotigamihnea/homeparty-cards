import type { Page } from '@playwright/test';
import { expect, joinAs, test } from './fixtures.js';

const SHOTS = 'test-results/screens';

/** The TV page, with the connection help due after `ms` of an empty lobby instead of a minute. */
async function tvWithHelpAfter(openHost: () => Promise<Page>, ms: number): Promise<Page> {
    const tv = await openHost();
    await tv.goto(`${tv.url()}?helpAfter=${ms}`);
    await expect(tv.locator('#admin-help')).toBeVisible();
    return tv;
}

test('About & credits names every credit and gives the focus back when closed', async ({ openHost }) => {
    const tv = await openHost();
    await tv.locator('#admin-about').click();
    const dialog = tv.getByRole('dialog', { name: 'About & credits' });
    await expect(dialog).toBeVisible();
    for (const credit of [
        'Cards Against Humanity LLC',
        'Creative Commons BY-NC-SA 2.0',
        'BY-NC-SA 4.0',
        'Chris Hallberg',
        'Kenney',
        'trademark of Cards Against Humanity LLC',
    ]) {
        await expect(dialog).toContainText(credit);
    }
    await expect(dialog).toContainText(/Version \d+\.\d+\.\d+/);
    await tv.screenshot({ path: `${SHOTS}/tv-about.png`, animations: 'disabled' });
    await tv.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(tv.locator('#admin-about')).toBeFocused();
});

test('the connection help opens by itself on an empty lobby, once', async ({ openHost }) => {
    const tv = await tvWithHelpAfter(openHost, 400);
    const dialog = tv.getByRole('dialog', { name: "Can't connect?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Phones join at');
    await expect(dialog).toContainText('same Wi-Fi');
    await tv.screenshot({ path: `${SHOTS}/tv-help.png`, animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(tv.locator('#admin-help')).toBeFocused();
    await tv.waitForTimeout(800);
    await expect(dialog).toHaveCount(0);
});

test('the connection help stays away once a phone has joined', async ({ openHost, openPhone }) => {
    const phone = await openPhone();
    const tv = await tvWithHelpAfter(openHost, 2_000);
    await joinAs(phone, 'Ana');
    await expect(tv.locator('.player-tile')).toHaveCount(1);
    await tv.waitForTimeout(2_500);
    await expect(tv.getByRole('dialog')).toHaveCount(0);
});

test('the help that opened by itself shows the QR code, and goes once the first phone joins', async ({
    openHost,
    openPhone,
}) => {
    const phone = await openPhone();
    const tv = await tvWithHelpAfter(openHost, 400);
    const dialog = tv.getByRole('dialog', { name: "Can't connect?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.help-qr')).toBeVisible();
    await joinAs(phone, 'Ana');
    await expect(dialog).toHaveCount(0);
    await expect(tv.locator('.player-tile')).toHaveCount(1);
});
