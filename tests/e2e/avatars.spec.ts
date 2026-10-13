import { expect, joinAs, test } from './fixtures.js';

test('a player picks a colour; the TV shows it and nobody else can take it', async ({ openHost, openPhone }) => {
    const tv = await openHost();
    const ana = await openPhone();
    await joinAs(ana, 'Ana');
    const bogdan = await openPhone();
    await joinAs(bogdan, 'Bogdan');
    await ana.locator('#avatar-5').click();
    await expect(ana.locator('#avatar-5')).toHaveAttribute('aria-pressed', 'true');
    await expect(tv.locator('.player-tile', { hasText: 'Ana' }).locator('.avatar')).toHaveAttribute('style', /#63e6be/);
    const taken = bogdan.locator('#avatar-5');
    await expect(taken).toBeDisabled();
    await expect(taken).toHaveAttribute('aria-label', 'Mint, taken by Ana');
    await expect(bogdan.locator('#avatar-0')).toBeEnabled();
});
