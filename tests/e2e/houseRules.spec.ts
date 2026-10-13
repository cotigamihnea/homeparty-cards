import type { Page } from '@playwright/test';
import { E2E_TIMING, PHONE_VIEWPORTS, expect, expectNoHorizontalScroll, test } from './fixtures.js';
import { answer, czarOfRound, judge, phoneOf, sameAnswer, seat } from './play.js';
import { socketPhones, type SocketPhone } from './socketPhones.js';

test.use({ timing: E2E_TIMING });

const SHOTS = 'test-results/screens';

function shot(page: Page, name: string): Promise<Buffer> {
    return page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled', fullPage: true });
}

/** The VIP turns a house rule on from their phone's settings panel. */
async function turnOn(vip: Page, rule: string): Promise<void> {
    await vip.getByRole('button', { name: 'Game settings' }).click();
    await vip.locator(`label[for="setting-${rule}"]`).click();
    await expect(vip.locator(`#setting-${rule}`)).toBeChecked();
    await vip.getByRole('button', { name: 'Done' }).click();
}

test('Rebooting the Universe: a point for a new hand, announced on the TV', async ({ openHost, openPhone }) => {
    // Two whole rounds with screenshots: more than the default budget on a busy machine.
    test.setTimeout(60_000);
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bo', 'Cy']);
    const [ana, bo, cy] = ['Ana', 'Bo', 'Cy'].map((name) => phoneOf(phones, name)) as [Page, Page, Page];
    await turnOn(ana, 'rebootTheUniverse');
    await expect(tv.locator('.lobby-settings')).toContainText('Reboot');
    await ana.getByRole('button', { name: 'Start game' }).click();

    // Round 1: Ana judges and Cy wins a point.
    expect(await czarOfRound(tv, 1)).toBe('Ana');
    await answer(bo, 1);
    const [cyCard] = await answer(cy, 1);
    await judge(ana, cyCard!);
    await ana.getByRole('button', { name: 'Next round' }).click();

    // Round 2: Bo judges; Cy spends the point.
    expect(await czarOfRound(tv, 2)).toBe('Bo');
    await expect(cy.locator('.answer-screen')).toBeVisible();
    const before = await cy.locator('.hand-card .card-text').allTextContents();
    await cy.locator('#reboot-hand').click();
    await expect(cy.locator('.confirm-question')).toHaveText('Swap all your cards for new ones? It costs 1 point.');
    await shot(cy, 'phone-390-reboot-confirm');
    await cy.locator('#reboot-yes').click();
    await expect(cy.locator('#reboot-hand')).toHaveCount(0);
    await expect(tv.locator('.tv-spotlight h2')).toHaveText('Cy rebooted the universe');
    await expect(tv.locator('.tv-table-talk')).toContainText('Cy rebooted the universe');
    const after = await cy.locator('.hand-card .card-text').allTextContents();
    expect(after).toHaveLength(before.length);
    expect(after.filter((text) => before.includes(text))).toEqual([]);
    await expectNoHorizontalScroll(cy);
    await shot(tv, 'tv-reboot-table-talk');

    await answer(ana, 2);
    await answer(cy, 2);
    await judge(bo, null);
    await expect(tv.locator('.tv-score-strip li', { hasText: 'Cy' }).locator('.tv-score')).toHaveText(/^[01]$/);
    const cyScore = await tv.locator('.tv-score-strip li', { hasText: 'Cy' }).locator('.tv-score').textContent();
    const cyWonAgain = (await tv.locator('.tv-title').textContent()) === 'Cy wins the round';
    expect(cyScore).toBe(cyWonAgain ? '1' : '0');
});

test('Rando Cardrissian: a random answer that can win, and shames everyone', async ({
    openHost,
    openPhone,
    hostSettings,
}) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bo', 'Cy']);
    const [ana, bo, cy] = ['Ana', 'Bo', 'Cy'].map((name) => phoneOf(phones, name)) as [Page, Page, Page];
    await hostSettings({ randoCardrissian: true });
    await expect(tv.locator('.lobby-settings')).toContainText('Rando');
    await ana.getByRole('button', { name: 'Start game' }).click();

    expect(await czarOfRound(tv, 1)).toBe('Ana');
    const played = [...(await answer(bo, 1)), ...(await answer(cy, 1))];
    await expect(ana.locator('.submission-button')).toHaveCount(3);
    // Each answer is one card per blank (Pick 2 or 3 shows several); Rando's is the one nobody played.
    const shown = await ana
        .locator('.submission-button')
        .evaluateAll((buttons) =>
            buttons.map((button) =>
                [...button.querySelectorAll('.card-answer .card-text')].map((n) => n.textContent ?? ''),
            ),
        );
    const randos = shown.filter((texts) => !texts.some((text) => played.some((card) => sameAnswer(text, card))));
    expect(randos).toHaveLength(1);
    await judge(ana, randos[0]![0]!);

    await expect(tv.locator('.tv-title')).toHaveText('Rando Cardrissian wins the round');
    await expect(tv.locator('.tv-shame')).toHaveText('A random card beat all of you. Everyone shares the shame.');
    await expect(tv.locator('.tv-score-strip li').first()).toContainText('Rando Cardrissian');
    await expect(tv.locator('.tv-score-strip li').first().locator('.tv-score')).toHaveText('1');
    await expect(bo.getByText('Everyone shares the shame.', { exact: false })).toBeVisible();
    await expectNoHorizontalScroll(bo);
    await shot(tv, 'tv-rando-wins');
    await shot(bo, 'phone-390-rando-wins');
});

/** Until `check` holds for the phone's latest view. */
async function viewUntil(phone: SocketPhone, check: (view: ReturnType<SocketPhone['view']>) => boolean): Promise<void> {
    await expect.poll(() => check(phone.view()), { timeout: 15_000 }).toBe(true);
}

// The intro holds a little longer here, so a loaded machine still sees the Happy Ending's.
test.describe('with a slower round intro', () => {
    test.use({ timing: { ...E2E_TIMING, roundIntroMs: 1_500 } });

    test('Happy Ending: once the game is decided, one last haiku round just for glory', async ({
        server,
        openHost,
        hostSettings,
    }) => {
        test.setTimeout(90_000);
        const tv = await openHost();
        const game = await socketPhones(server, ['Ana', 'Bo', 'Cy', 'Dee']);
        const [ana] = game.phones as [SocketPhone];
        await hostSettings({ happyEnding: true, pointsToWin: 5 });
        await expect(tv.locator('.lobby-settings')).toContainText('Happy Ending');
        await ana.socket.emitWithAck('startGame');

        // Ana wins every round she answers; the haiku comes once she has 5 points.
        for (let round = 1; !game.vip.view().round?.finale; round++) {
            await viewUntil(ana, (view) => view.round?.number === round && view.phase === 'SUBMITTING');
            await game.everyoneAnswers();
            const czar = game.czar();
            await viewUntil(czar, (view) => view.judging?.revealed === true);
            const mine = ana
                .view()
                .mySubmission?.map((card) => card.id)
                .join();
            const submissions = czar.view().judging!.submissions;
            const pick = submissions.find((s) => s.cards.map((card) => card.id).join() === mine) ?? submissions[0]!;
            await czar.socket.emitWithAck('czarPick', { submissionId: pick.id });
            await viewUntil(ana, (view) => view.phase === 'ROUND_RESULT');
            await ana.socket.emitWithAck('advance');
            await viewUntil(ana, (view) => view.round?.number === round + 1 || view.phase === 'GAME_OVER');
        }
        expect(ana.view().players.find((p) => p.id === ana.id)?.score).toBe(5);

        // One look at the intro: the haiku card, the label and the line, before it moves on.
        await expect(tv.locator('#app[data-phase="ROUND_START"] .tv-intro')).toHaveText(
            /Make a haiku\.[\s\S]*Happy Ending[\s\S]*One last round, just for glory\./,
        );
        await shot(tv, 'tv-happy-ending-intro');
        await game.everyoneAnswers();
        await game.czarPicks();
        await expect(tv.locator('#app[data-phase="ROUND_RESULT"] .tv-title')).toHaveText(/ wins the haiku$/);
        await expect(tv.locator('.tv-plus-one')).toHaveText('For glory');
        await shot(tv, 'tv-happy-ending-result');
        await ana.socket.emitWithAck('advance');
        await expect(tv.locator('#app[data-phase="GAME_OVER"] .tv-title')).toHaveText('Ana wins!');
        game.close();
    });
});

test('Never Have I Ever: discard a card you don’t get, and the TV shows it', async ({
    openHost,
    openPhone,
    hostSettings,
}) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bo', 'Cy'], PHONE_VIEWPORTS[1]);
    const [ana, bo] = ['Ana', 'Bo'].map((name) => phoneOf(phones, name)) as [Page, Page];
    await hostSettings({ neverHaveIEver: true });
    await ana.getByRole('button', { name: 'Start game' }).click();
    expect(await czarOfRound(tv, 1)).toBe('Ana');

    await expect(bo.locator('.answer-screen')).toBeVisible();
    const before = await bo.locator('.hand-card .card-text').allTextContents();
    await bo.locator('#confess-start').click();
    await expect(bo.locator('.confirm-question')).toHaveText("Tap the card you don't understand.");
    await bo.locator('.hand-card').nth(2).click();
    await expect(bo.locator('.hand-card.is-confessed')).toHaveCount(1);
    await expectNoHorizontalScroll(bo);
    await shot(bo, 'phone-360-confess-confirm');
    await bo.locator('#confess-yes').click();

    await expect(tv.locator('.tv-spotlight h2')).toHaveText("Bo doesn't get this one:");
    await expect(tv.locator('.tv-spotlight .card-text')).toHaveText(before[2]!);
    await expect(tv.locator('.tv-talk')).toContainText(`Bo doesn't get “${before[2]}”`);
    await expect(bo.locator('#confess-start')).toHaveCount(0);
    const after = await bo.locator('.hand-card .card-text').allTextContents();
    expect(after).toHaveLength(before.length);
    expect(after).not.toContain(before[2]);
    await shot(tv, 'tv-confession');
});

test('Blank cards: write your own answer, and the Czar can pick it', async ({ openHost, openPhone, hostSettings }) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bo', 'Cy'], PHONE_VIEWPORTS[1]);
    const [ana, bo, cy] = ['Ana', 'Bo', 'Cy'].map((name) => phoneOf(phones, name)) as [Page, Page, Page];
    await hostSettings({ blankCards: 1 });
    await ana.getByRole('button', { name: 'Start game' }).click();
    expect(await czarOfRound(tv, 1)).toBe('Ana');

    await expect(bo.locator('.answer-screen')).toBeVisible();
    const blank = bo.locator('.hand-card.is-blank');
    await expect(blank).toHaveCount(1);
    await expect(blank).toHaveText('Blank card. Tap to write your own answer.');
    await blank.click();
    const writer = bo.locator('.blank-writer');
    await expect(writer).toBeVisible();
    // The writer covers the screen, so it carries the answer countdown.
    await expect(writer.locator('.blank-writer-status .countdown')).toBeVisible();
    await bo.locator('#blank-writer-text').fill('My own words');
    // Another phone answering re-renders Bo's screen; the writer and its text are untouched.
    await answer(cy, 1);
    await expect(bo.locator('#blank-writer-text')).toHaveValue('My own words');
    await expect(bo.locator('.blank-writer-count')).toHaveText('12 / 80');
    await expectNoHorizontalScroll(bo);
    await bo.screenshot({ path: `${SHOTS}/phone-360-blank-writer.png`, animations: 'disabled' });
    await bo.locator('#blank-use').click();
    await expect(writer).toHaveCount(0);
    await expect(bo.locator('.hand-card.is-blank .card-text')).toHaveText('My own words');
    const send = bo.getByRole('button', { name: 'Send answer' });
    for (let i = 0; await send.isDisabled(); i++) await bo.locator('.hand-card:not(.is-blank)').nth(i).click();
    await send.click();

    await judge(ana, 'My own words');
    await expect(tv.locator('.tv-title')).toHaveText('Bo wins the round');
    await expect(tv.locator('.tv-table .is-winner-card')).toContainText('My own words');
});

// Long enough for a phone to answer even when many browsers share the machine, short enough to wait out.
test.describe('with a 45 s answer timer that runs out in under 7 s', () => {
    test.use({ timing: { ...E2E_TIMING, secondMs: 150 } });

    test('Auto-play on timeout: a random card is played for a player who did not answer', async ({
        openHost,
        openPhone,
        hostSettings,
    }) => {
        const tv = await openHost();
        const phones = await seat(openPhone, ['Ana', 'Bo', 'Cy']);
        const [ana, bo, cy] = ['Ana', 'Bo', 'Cy'].map((name) => phoneOf(phones, name)) as [Page, Page, Page];
        await hostSettings({ autoPlay: true, submitSeconds: 45, judgeSeconds: 0 });
        await expect(tv.locator('.lobby-settings')).toContainText('Auto-play');
        await ana.getByRole('button', { name: 'Start game' }).click();
        expect(await czarOfRound(tv, 1)).toBe('Ana');

        await answer(bo, 1);
        // Judging starts only when the answer timer runs out.
        await expect(cy.locator('.watch-judging-screen')).toBeVisible({ timeout: 15_000 });
        await expect(cy.getByText('Time ran out, so a random card was played for you.')).toBeVisible();
        await expect(bo.getByText('Time ran out', { exact: false })).toHaveCount(0);
        await expect(ana.locator('.submission-button')).toHaveCount(2);
        await shot(cy, 'phone-390-auto-played');
    });
});

const EVERY_RULE = {
    rebootTheUniverse: true,
    randoCardrissian: true,
    happyEnding: true,
    neverHaveIEver: true,
    blankCards: 3,
    autoPlay: true,
};

for (const viewport of PHONE_VIEWPORTS) {
    test(`every house rule on: the VIP's settings fit a ${viewport.width}px phone`, async ({
        openPhone,
        hostSettings,
    }) => {
        const [vip] = (await seat(openPhone, ['Vip'], viewport)).values();
        await hostSettings(EVERY_RULE);
        await vip!.getByRole('button', { name: 'Game settings' }).click();
        await expect(vip!.locator('.house-rules .switch-input:checked')).toHaveCount(5);
        await expect(vip!.locator('#setting-blankCards-3')).toBeChecked();
        await expectNoHorizontalScroll(vip!);
        await shot(vip!, `phone-${viewport.width}-house-rules`);
    });
}

test('every house rule on: the TV lobby names them all beside twelve players, and the laptop panel lists them', async ({
    server,
    openHost,
    hostSettings,
}) => {
    const tv = await openHost();
    const game = await socketPhones(server, [
        'Ana',
        'Bo',
        'Cy',
        'Dee',
        'Eli',
        'Flo',
        'Gus',
        'Hal',
        'Ida',
        'Jo',
        'Kit',
        'Lu',
    ]);
    await hostSettings(EVERY_RULE);
    await expect(tv.locator('.player-tile')).toHaveCount(12);
    await expect(tv.locator('.lobby-settings')).toContainText(
        'Reboot, Rando, Happy Ending, Never Have I Ever, 3 blanks, Auto-play',
    );
    await shot(tv, 'tv-lobby-house-rules');
    const box = async (selector: string) => (await tv.locator(selector).first().boundingBox())!;
    const [join, strip, bar] = [await box('.join-card'), await box('.lobby-settings'), await box('.admin-bar')];
    expect(join.y + join.height, 'the join card runs into the settings').toBeLessThanOrEqual(strip.y);
    expect(strip.y + strip.height, 'the settings run into the host controls').toBeLessThanOrEqual(bar.y);
    expect(await tv.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    game.close();

    await tv.getByRole('button', { name: 'Settings' }).click();
    const rules = tv.getByRole('dialog').locator('.house-rules');
    await rules.scrollIntoViewIfNeeded();
    await expect(rules.locator('.switch-input:checked')).toHaveCount(5);
    await tv.screenshot({ path: `${SHOTS}/tv-settings-house-rules.png`, animations: 'disabled' });
});

test('table talk fits beside twelve players on the TV', async ({ server, openHost, hostSettings }) => {
    const tv = await openHost();
    const names = ['Ana', 'Bo', 'Cy', 'Dee', 'Eli', 'Flo', 'Gus', 'Hal', 'Ida', 'Jo', 'Kit', 'Lu'];
    const game = await socketPhones(server, names);
    await hostSettings({ neverHaveIEver: true });
    await game.vip.socket.emitWithAck('startGame');
    await expect(tv.locator('#app[data-phase="SUBMITTING"]')).toBeVisible();
    const czarId = game.vip.view().round!.czarId;
    const confessors = game.phones.filter((phone) => phone.id !== czarId).slice(0, 4);
    for (const phone of confessors) {
        await viewUntil(phone, (view) => view.phase === 'SUBMITTING');
        const card = phone.view().hand.reduce((longest, c) => (c.text.length > longest.text.length ? c : longest));
        await phone.socket.emitWithAck('discardCard', { cardId: card.id });
    }
    await expect(tv.locator('.tv-talk')).toHaveCount(3);
    await expect(tv.locator('.tv-spotlight')).toBeVisible();
    await shot(tv, 'tv-spotlight-12');
    await expect(tv.locator('.tv-spotlight')).toHaveCount(0, { timeout: 8_000 });
    await shot(tv, 'tv-table-talk-12');
    const fits = await tv.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
    expect(fits).toBe(true);
    // The newest line is always on screen, whole, inside the log's own box.
    const log = (await tv.locator('.tv-table-talk').boundingBox())!;
    const newest = (await tv.locator('.tv-talk').first().boundingBox())!;
    expect(newest.y + newest.height).toBeLessThanOrEqual(log.y + log.height + 1);
    expect(newest.x + newest.width).toBeLessThanOrEqual(log.x + log.width + 1);
    game.close();
});
