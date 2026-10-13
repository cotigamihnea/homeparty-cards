import path from 'node:path';
import { startServer } from '../../src/server/index.js';
import { serveBuiltClient } from '../../src/server/static.js';
import { PHONE_VIEWPORTS, expect, expectNoHorizontalScroll, joinAs, test } from './fixtures.js';

test('a phone rejoins under its name by itself when the game server restarts', async ({
    openHost,
    openPhone,
    server,
    lan,
}) => {
    const tv = await openHost();
    const ana = await openPhone();
    await joinAs(ana, 'Ana');
    await expect(tv.locator('.player-tile .player-name')).toHaveText(['Ana']);

    await server.close();
    const restarted = await startServer({
        port: server.port,
        host: '127.0.0.1',
        mountClient: serveBuiltClient(path.resolve('dist/client')),
        lan,
        customDecksDir: server.decks.folder,
    });
    try {
        // Bogdan joining the new server proves the TV is showing fresh state, not the pre-restart DOM.
        await joinAs(await openPhone(), 'Bogdan');
        await expect(tv.locator('.player-tile', { hasText: 'Bogdan' })).toBeVisible();
        await expect(tv.locator('.player-tile', { hasText: 'Ana' })).toBeVisible({ timeout: 15_000 });
        await expect(ana.getByText('2 players in the lobby')).toBeVisible();
    } finally {
        await restarted.close();
    }
});

for (const viewport of PHONE_VIEWPORTS) {
    test.describe(`lobby on a ${viewport.width}px phone`, () => {
        test('players join and appear on the TV, first one is VIP', async ({ openHost, openPhone, server }) => {
            const tv = await openHost();
            await expect(tv.getByRole('img', { name: /QR code for/ })).toBeVisible();
            await expect(tv.locator('.join-url')).toHaveText(`http://127.0.0.1:${server.port}`);

            const ana = await openPhone(viewport);
            await joinAs(ana, 'Ana');
            await expect(ana.getByText("You're in!")).toBeVisible();
            await expect(ana.getByText('You have the crown')).toBeVisible();
            await expect(tv.locator('.lobby-status')).toHaveText('Need 2 more players to start');

            const bogdan = await openPhone(viewport);
            await joinAs(bogdan, 'Bogdan');
            const cara = await openPhone(viewport);
            await joinAs(cara, 'Cara');

            await expect(tv.locator('.player-tile .player-name')).toHaveText(['Ana', 'Bogdan', 'Cara']);
            await expect(tv.locator('.player-tile', { hasText: 'Ana' }).locator('.vip-badge')).toHaveText('VIP');
            await expect(tv.locator('.player-tile', { hasText: 'Bogdan' }).locator('.vip-badge')).toHaveCount(0);
            await expect(tv.locator('.lobby-status')).toHaveText('Waiting for Ana to start the game');
            await expect(bogdan.getByText('Watch the TV. The game starts when the VIP is ready.')).toBeVisible();
            for (const phone of [ana, bogdan, cara]) await expectNoHorizontalScroll(phone);
        });

        test('a duplicate name is rejected case-insensitively', async ({ openPhone }) => {
            await joinAs(await openPhone(viewport), 'Ana');
            const second = await openPhone(viewport);
            await joinAs(second, 'ANA');
            await expect(second.getByRole('alert')).toHaveText(
                'Someone already has that name. Add a letter or an emoji to yours.',
            );
        });

        test('the VIP can pass the crown', async ({ openHost, openPhone }) => {
            const tv = await openHost();
            const ana = await openPhone(viewport);
            await joinAs(ana, 'Ana');
            await joinAs(await openPhone(viewport), 'Bogdan');
            await ana.getByRole('button', { name: 'Players' }).click();
            await ana
                .locator('.player-row', { hasText: 'Bogdan' })
                .getByRole('button', { name: 'Give the crown' })
                .click();
            await expect(tv.locator('.player-tile', { hasText: 'Bogdan' }).locator('.vip-badge')).toBeVisible();
            await expect(ana.getByText('You have the crown')).toHaveCount(0);
            await expect(ana.locator('.players-screen')).toHaveCount(0);
        });

        test('the VIP removes a player, after confirming; that phone says so', async ({ openHost, openPhone }) => {
            const tv = await openHost();
            const ana = await openPhone(viewport);
            await joinAs(ana, 'Ana');
            const bogdan = await openPhone(viewport);
            await joinAs(bogdan, 'Bogdan');
            await ana.getByRole('button', { name: 'Players' }).click();
            const row = ana.locator('.player-row', { hasText: 'Bogdan' });
            await row.getByRole('button', { name: 'Remove' }).click();
            await expect(row).toContainText('Remove Bogdan from the game?');
            await row.getByRole('button', { name: 'Cancel' }).click();
            await expect(row).not.toContainText('Remove Bogdan from the game?');
            await row.getByRole('button', { name: 'Remove' }).click();
            await row.getByRole('button', { name: 'Remove' }).click();
            await expect(bogdan.getByText('You were removed from the game')).toBeVisible();
            await expect(tv.locator('.player-tile .player-name')).toHaveText(['Ana']);
            await expect(ana.getByText('Nobody else is here yet.')).toBeVisible();
        });

        test('your own card is dealt in once, not again whenever someone joins', async ({ openPhone }) => {
            const ana = await openPhone(viewport);
            await joinAs(ana, 'Ana');
            await expect(ana.locator('.you-card')).toBeVisible();
            await ana.waitForTimeout(600);
            await joinAs(await openPhone(viewport), 'Bogdan');
            await expect(ana.getByText('2 players in the lobby')).toBeVisible();
            const running = await ana.locator('.you-card').evaluate((card) => card.getAnimations().length);
            expect(running).toBe(0);
        });

        test('closing a phone keeps its seat, marked as reconnecting, and the crown stays', async ({
            openHost,
            openPhone,
        }) => {
            const tv = await openHost();
            const ana = await openPhone(viewport);
            await joinAs(ana, 'Ana');
            const bogdan = await openPhone(viewport);
            await joinAs(bogdan, 'Bogdan');
            await joinAs(await openPhone(viewport), 'Cara');
            await expect(tv.locator('.lobby-status')).toHaveText('Waiting for Ana to start the game');
            await ana.context().close();
            const anaTile = tv.locator('.player-tile', { hasText: 'Ana' });
            await expect(anaTile.locator('.away-label')).toHaveText('Reconnecting…');
            await expect(anaTile.locator('.vip-badge')).toBeVisible();
            await expect(tv.locator('.lobby-status')).toHaveText('Need 1 more player to start');
            await expect(bogdan.getByText('You have the crown')).toHaveCount(0);
        });

        test('a phone gets its own seat back by typing its name again', async ({ openHost, openPhone }) => {
            const tv = await openHost();
            const ana = await openPhone(viewport);
            await joinAs(ana, 'Ana');
            await ana.context().close();
            await expect(tv.locator('.player-tile', { hasText: 'Ana' }).locator('.away-label')).toBeVisible();
            const again = await openPhone(viewport);
            await joinAs(again, 'ana');
            await expect(again.getByText('You have the crown')).toBeVisible();
            await expect(tv.locator('.player-tile .player-name')).toHaveText(['Ana']);
            await expect(tv.locator('.away-label')).toHaveCount(0);
        });

        test('the crown can only be passed to someone who is here', async ({ openPhone }) => {
            const ana = await openPhone(viewport);
            await joinAs(ana, 'Ana');
            const bogdan = await openPhone(viewport);
            await joinAs(bogdan, 'Bogdan');
            await joinAs(await openPhone(viewport), 'Cara');
            await bogdan.context().close();
            await ana.getByRole('button', { name: 'Players' }).click();
            const giveTo = (name: string) =>
                ana.locator('.player-row', { hasText: name }).getByRole('button', { name: 'Give the crown' });
            await expect(giveTo('Cara')).toBeEnabled();
            await expect(giveTo('Bogdan')).toBeDisabled();
            await expect(ana.locator('.player-row', { hasText: 'Bogdan' })).toContainText('Away');
        });
    });
}
