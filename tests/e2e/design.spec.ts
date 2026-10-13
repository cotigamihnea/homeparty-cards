import type { Page } from '@playwright/test';
import { longCardLibrary, pick3Library } from './cards.js';
import { E2E_TIMING, expect, expectNoHorizontalScroll, joinAs, test } from './fixtures.js';
import { socketPhones } from './socketPhones.js';

const SHOTS = 'test-results/screens';
const SLOW_REVEAL = { ...E2E_TIMING, roundIntroMs: 1500, revealMsPerSubmission: 1200, resultMs: 60_000 };
const NAMES = [
    'Ana',
    'Bogdan',
    'Ioana-Cristina B',
    'Dan',
    'Eve',
    'Maximilian Wolf',
    'Radu',
    'Smaranda P',
    'Zoe',
    'Vlad',
    'Mo',
    'Alexandrina',
];

function shot(page: Page, name: string): Promise<Buffer> {
    return page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
}

/**
 * Real-proportion cards on the TV must hold their whole text and keep their 63:88 shape: a card with too much
 * text grows taller instead (an aspect-ratio box stretches to fit its content). Offset sizes ignore rotation.
 */
async function overflowingCards(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.card:not(.is-wide)')]
            .filter((card) => card.offsetHeight > (card.offsetWidth * 88) / 63 + 2)
            .map((card) => card.textContent ?? ''),
    );
}

/** Everything listed must sit above the laptop's host controls (and inside the screen). */
async function expectAboveHostControls(page: Page, selector: string): Promise<void> {
    const bar = await page.locator('.admin-bar').boundingBox();
    const boxes = await page
        .locator(selector)
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().bottom));
    expect(boxes.length).toBeGreaterThan(0);
    for (const bottom of boxes) expect(bottom).toBeLessThanOrEqual((bar?.y ?? 1080) + 1);
}

for (const blacks of ['any', 'pick3'] as const) {
    test.describe(`the longest ${blacks === 'pick3' ? 'Pick 3 ' : ''}cards`, () => {
        test.use({ cards: longCardLibrary(blacks), timing: SLOW_REVEAL });

        test('fit on every TV card: intro, answers, read-out, judging and result', async ({ openHost, server }) => {
            test.setTimeout(60_000);
            const tv = await openHost();
            const game = await socketPhones(server, NAMES.slice(0, 5));
            await game.vip.socket.emitWithAck('startGame');
            await expect(tv.locator('#app[data-phase="ROUND_START"] .card')).toBeVisible();
            expect(await overflowingCards(tv)).toEqual([]);
            await game.everyoneAnswers();
            await expect(tv.locator('.tv-reveal-count')).toBeVisible();
            await tv.waitForTimeout(700);
            expect(await overflowingCards(tv)).toEqual([]);
            await shot(tv, `tv-long-${blacks}-reveal`);
            await expect(tv.locator('.tv-submissions')).toBeVisible({ timeout: 15_000 });
            expect(await overflowingCards(tv)).toEqual([]);
            await shot(tv, `tv-long-${blacks}-grid`);
            await game.czarPicks();
            await expect(tv.locator('#app[data-phase="ROUND_RESULT"] .is-winner-card')).toBeVisible();
            await tv.waitForTimeout(800);
            expect(await overflowingCards(tv)).toEqual([]);
            await shot(tv, `tv-long-${blacks}-result`);
            game.close();
        });
    });
}

test.describe('a full room of 12', () => {
    test.use({ timing: SLOW_REVEAL });

    test('every answer, and every author on the result, is on screen above the host controls', async ({
        openHost,
        server,
    }) => {
        test.setTimeout(90_000);
        const tv = await openHost();
        const game = await socketPhones(server, NAMES);
        await expect(tv.locator('.player-tile')).toHaveCount(12);
        await expectAboveHostControls(tv, '.player-tile, .join-card, .lobby-settings');
        await game.vip.socket.emitWithAck('startGame');
        await game.everyoneAnswers();
        await expect(tv.locator('.tv-submissions li')).toHaveCount(11, { timeout: 30_000 });
        await tv.waitForTimeout(600);
        await expectAboveHostControls(tv, '.tv-submissions .card');
        expect(await overflowingCards(tv)).toEqual([]);
        await shot(tv, 'tv-12-grid');
        await game.czarPicks();
        await expect(tv.locator('.tv-all-answers li')).toHaveCount(11);
        await tv.waitForTimeout(1600);
        await expectAboveHostControls(tv, '.tv-all-answers li, .tv-winner, .tv-score-strip');
        const strip = await tv.locator('.tv-score-strip').boundingBox();
        const answerBottoms = await tv
            .locator('.tv-all-answers li')
            .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().bottom));
        for (const bottom of answerBottoms) expect(bottom).toBeLessThanOrEqual((strip?.y ?? 1080) + 1);
        await shot(tv, 'tv-12-result');
        game.close();
    });
});

test.describe('a full room of 12 on a Pick 3 card', () => {
    test.use({ cards: pick3Library(), timing: SLOW_REVEAL });

    test('keeps all eleven three-card answers on real cards above the host controls', async ({ openHost, server }) => {
        test.setTimeout(90_000);
        const tv = await openHost();
        const game = await socketPhones(server, NAMES);
        await game.vip.socket.emitWithAck('startGame');
        await game.everyoneAnswers();
        await expect(tv.locator('.tv-submissions li')).toHaveCount(11, { timeout: 40_000 });
        await tv.waitForTimeout(600);
        await shot(tv, 'tv-12-pick3-grid');
        expect(await overflowingCards(tv)).toEqual([]);
        await expectAboveHostControls(tv, '.tv-submissions .card');
        game.close();
    });
});

test('on a touch-screen laptop the remove buttons stay visible (there is no hover)', async ({
    browser,
    server,
    openPhone,
}) => {
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        isMobile: true,
        hasTouch: true,
    });
    const tv = await context.newPage();
    await tv.goto(`http://127.0.0.1:${server.port}/host`);
    await joinAs(await openPhone(), 'Ana');
    const remove = tv.getByRole('button', { name: 'Remove Ana' });
    await expect(remove).toBeVisible();
    expect(await remove.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
    await context.close();
});

test.describe('with reduced motion', () => {
    test.use({ timing: SLOW_REVEAL });

    test('the winner gets no confetti and the result still shows', async ({ openHost, server }) => {
        const tv = await openHost();
        await tv.emulateMedia({ reducedMotion: 'reduce' });
        const game = await socketPhones(server, NAMES.slice(0, 3));
        await game.vip.socket.emitWithAck('startGame');
        await game.everyoneAnswers();
        await game.czarPicks();
        await expect(tv.locator('#app[data-phase="ROUND_RESULT"] .tv-winner-name')).toBeVisible();
        await expect(tv.locator('.confetti')).toHaveCount(0);
        game.close();
    });
});

test('landscape phones and a 125% font: nothing scrolls sideways and Send stays in reach', async ({
    openPhone,
    browser,
    server,
}) => {
    test.setTimeout(60_000);
    const big = await openPhone();
    await big.addStyleTag({ content: 'html { font-size: 125% !important; }' });
    await joinAs(big, 'Ana');
    const context = await browser.newContext({
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
    });
    const landscape = await context.newPage();
    await landscape.goto(`http://127.0.0.1:${server.port}/`);
    await expectNoHorizontalScroll(landscape);
    await joinAs(landscape, 'Bogdan');
    const game = await socketPhones(server, ['Cara']);
    for (const phone of [big, landscape]) await expect(phone.getByText("You're in!")).toBeVisible();
    await expectNoHorizontalScroll(big);
    await expectNoHorizontalScroll(landscape);
    await big.getByRole('button', { name: 'Game settings' }).click();
    await expectNoHorizontalScroll(big);
    await shot(big, 'phone-125-settings');
    await big.getByRole('button', { name: 'Done' }).click();
    await big.getByRole('button', { name: 'Start game' }).click();
    for (const phone of [big, landscape]) {
        const answering = phone.locator('.answer-screen');
        const czarWaiting = phone.locator('.czar-waiting-screen');
        await expect(answering.or(czarWaiting)).toBeVisible({ timeout: 10_000 });
        await expectNoHorizontalScroll(phone);
        if (await answering.isVisible()) {
            await phone.locator('.hand-card').first().click();
            await expect(phone.getByRole('button', { name: 'Send answer' })).toBeInViewport();
        }
    }
    await shot(landscape, 'phone-landscape-round');
    await shot(big, 'phone-125-round');
    game.close();
    await context.close();
});

test.describe("the Czar's small phone with the longest Pick 3 cards", () => {
    test.use({ cards: longCardLibrary('pick3'), timing: E2E_TIMING });

    for (const viewport of [
        { width: 360, height: 740 },
        { width: 844, height: 390 },
    ]) {
        test(`${viewport.width}×${viewport.height}: the pinned prompt leaves room to look at and tap every answer`, async ({
            openPhone,
            server,
        }) => {
            const czar = await openPhone(viewport);
            await joinAs(czar, 'Ana');
            const game = await socketPhones(server, ['Bogdan', 'Dan', 'Eve']);
            await czar.getByRole('button', { name: 'Start game' }).click();
            await game.everyoneAnswers();
            const buttons = czar.locator('.submission-button');
            await expect(buttons).toHaveCount(3);
            for (let i = 0; i < 3; i++) {
                await buttons.nth(i).click({ timeout: 3_000 });
                await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'true');
                // Measured in the page: the phone re-renders when the read-out ends, replacing the element.
                const height = await czar
                    .locator('.pinned-card')
                    .evaluate((node) => node.getBoundingClientRect().height);
                expect(height, 'the pinned prompt takes over the screen').toBeLessThanOrEqual(
                    viewport.height * 0.45 + 1,
                );
            }
            await expectNoHorizontalScroll(czar);
            await shot(czar, `phone-${viewport.width}x${viewport.height}-czar-longest-pick3`);
            game.close();
        });
    }
});
