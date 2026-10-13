import type { Page } from '@playwright/test';
import { PHONE_VIEWPORTS, joinAs, test } from './fixtures.js';

const SHOTS = 'test-results/screens';

function shot(page: Page, path: string): Promise<Buffer> {
    return page.screenshot({ path, animations: 'disabled' });
}

test('TV lobby: empty and with players', async ({ openHost, openPhone }) => {
    const tv = await openHost();
    await tv.locator('.empty-card').waitFor();
    await shot(tv, `${SHOTS}/tv-lobby-empty.png`);
    for (const name of ['Ana', 'Bogdan', 'Ioana-Cristina B', '👨‍👩‍👧 Squad']) await joinAs(await openPhone(), name);
    await tv.locator('.player-tile').nth(3).waitFor();
    await tv.waitForTimeout(800);
    await shot(tv, `${SHOTS}/tv-lobby-players.png`);
});

test('TV lobby: a seat whose phone dropped', async ({ openHost, openPhone }) => {
    const tv = await openHost();
    const phones = [];
    for (const name of ['Ana', 'Bogdan', 'Cara']) {
        const phone = await openPhone();
        await joinAs(phone, name);
        phones.push(phone);
    }
    await phones[1]!.context().close();
    await tv.locator('.away-label').waitFor();
    await shot(tv, `${SHOTS}/tv-lobby-away.png`);
});

test.describe('with a WSL NAT warning', () => {
    test.use({ lan: { address: '172.27.144.5', candidates: [], isWsl: true, wslMode: 'nat', warning: 'WSL_NAT' } });
    test('TV lobby shows the network banner', async ({ openHost }) => {
        const tv = await openHost();
        await tv.getByRole('alert').waitFor();
        await shot(tv, `${SHOTS}/tv-lobby-wsl-warning.png`);
    });
});

for (const viewport of PHONE_VIEWPORTS) {
    test(`phone screens at ${viewport.width}px`, async ({ openPhone }) => {
        const vip = await openPhone(viewport);
        await shot(vip, `${SHOTS}/phone-${viewport.width}-join.png`);
        await joinAs(vip, 'Ana');
        await vip.getByText("You're in!").waitFor();
        await shot(vip, `${SHOTS}/phone-${viewport.width}-vip-waiting.png`);
        const other = await openPhone(viewport);
        await joinAs(other, 'Bogdan');
        await other.getByText("You're in!").waitFor();
        await shot(other, `${SHOTS}/phone-${viewport.width}-waiting.png`);
        await vip.getByRole('button', { name: 'Players' }).click();
        await shot(vip, `${SHOTS}/phone-${viewport.width}-players.png`);
        const error = await openPhone(viewport);
        await joinAs(error, 'ana');
        await error
            .getByRole('alert')
            .getByText('Someone already has that name. Add a letter or an emoji to yours.')
            .waitFor();
        await shot(error, `${SHOTS}/phone-${viewport.width}-join-error.png`);
    });
}
