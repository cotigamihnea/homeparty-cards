import { E2E_TIMING, expect, test } from './fixtures.js';
import { socketPhones } from './socketPhones.js';

test.use({ timing: E2E_TIMING });

test('game over: the podium, then the best-of reel of winning combos, then the podium again', async ({
    server,
    openHost,
}) => {
    test.setTimeout(60_000);
    const tv = await openHost();
    const game = await socketPhones(server, ['Ana', 'Bo', 'Cy']);
    await game.vip.socket.emitWithAck('startGame');
    await game.everyoneAnswers();
    await game.czarPicks();
    await expect(tv.locator('#app[data-phase="ROUND_RESULT"]')).toBeVisible();
    await game.vip.socket.emitWithAck('endGame');

    await expect(tv.locator('#app[data-phase="GAME_OVER"] .tv-podium')).toBeVisible();
    const reel = tv.locator('.tv-reel');
    await expect(reel).toBeVisible({ timeout: 13_000 });
    await expect(reel.locator('.tv-title')).toHaveText('Best of the game');
    await expect(reel.locator('.tv-reel-count')).toHaveText('1 of 1');
    await expect(reel).toContainText('Round 1');
    await tv.screenshot({ path: 'test-results/screens/tv-reel.png', animations: 'disabled' });
    await expect(tv.locator('.tv-podium')).toBeVisible({ timeout: 8_000 });
    game.close();
});
