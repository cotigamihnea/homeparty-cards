import { E2E_TIMING, expect, expectNoHorizontalScroll, joinAs, test } from './fixtures.js';
import { answer, czarOfRound, everyoneAnswers, judge, phoneOf, sameAnswer, seat } from './play.js';

test.use({ timing: E2E_TIMING });

const RESULT_TITLE = '#app[data-phase="ROUND_RESULT"] .tv-title';

test('four phones play a whole game to 5 points', async ({ openHost, openPhone, hostSettings }) => {
    test.setTimeout(120_000);
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Cara', 'Dan']);
    const ana = phoneOf(phones, 'Ana');
    await hostSettings({ pointsToWin: 5 });
    await ana.getByRole('button', { name: 'Start game' }).click();

    let anaWins = 0;
    for (let round = 1; anaWins < 5; round++) {
        const czar = await czarOfRound(tv, round);
        const answers = await everyoneAnswers(phones, czar, round);
        await judge(phoneOf(phones, czar), czar === 'Ana' ? null : answers.get('Ana')![0]!);
        await expect(tv.locator(RESULT_TITLE)).toHaveText(/ wins the round$/);
        if (czar !== 'Ana') {
            anaWins++;
            await expect(tv.locator(RESULT_TITLE)).toHaveText('Ana wins the round');
            await expect(ana.getByText('You won the round!')).toBeVisible();
        }
        if (anaWins < 5) await ana.getByRole('button', { name: 'Next round' }).click();
    }

    // The last result holds the screen for its own timer first, which runs late on a loaded machine.
    await expect(tv.locator('#app[data-phase="GAME_OVER"] .tv-title')).toHaveText('Ana wins!', { timeout: 15_000 });
    await expect(tv.locator('.tv-standings li').first().locator('.tv-score')).toHaveText('5');
    await expect(ana.getByRole('heading', { name: 'You won!' })).toBeVisible();
    await expect(phoneOf(phones, 'Bogdan').getByRole('heading', { name: 'Ana wins!' })).toBeVisible();
    for (const phone of phones.values()) await expectNoHorizontalScroll(phone);

    await ana.getByRole('button', { name: 'Back to lobby' }).click();
    await expect(tv.locator('#app[data-phase="LOBBY"] .player-tile')).toHaveCount(4);
});

test('a phone that reloads mid-round keeps its hand and its answer', async ({ openHost, openPhone }) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Cara', 'Dan']);
    await phoneOf(phones, 'Ana').getByRole('button', { name: 'Start game' }).click();
    const czar = await czarOfRound(tv, 1);
    const [name, phone] = [...phones].find(([player]) => player !== czar)!;
    await expect(phone.locator('.answer-screen')).toBeVisible();
    const handBefore = await phone.locator('.hand-card .card-text').allTextContents();
    const sent = await answer(phone, 1);

    await phone.reload();
    await expect(phone.locator('.answer-sent-screen')).toBeVisible();
    const shown = (await phone.locator('.answer-sent-screen .answer').first().textContent()) ?? '';
    expect(sameAnswer(shown, sent[0]!)).toBe(true);
    await expect(tv.locator('.tv-player', { hasText: name }).locator('.tv-player-status')).toHaveText('Answered');
    await phone.getByRole('button', { name: 'Change answer' }).click();
    const handAfter = await phone.locator('.hand-card .card-text').allTextContents();
    expect(handAfter.toSorted()).toEqual(handBefore.toSorted());
});

// "Round skipped" stays up long enough for a busy machine to see it.
test.describe('with a longer skipped-round screen', () => {
    test.use({ timing: { ...E2E_TIMING, voidResultMs: 5_000 } });
    // Five phones, a 4 s grace and the skipped round: more than the default budget on a busy machine.
    test.describe.configure({ timeout: 60_000 });

    test('the round is skipped when the Czar’s phone is gone for longer than the grace period', async ({
        openHost,
        openPhone,
    }) => {
        const tv = await openHost();
        const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Cara', 'Dan', 'Eve']);
        await phoneOf(phones, 'Ana').getByRole('button', { name: 'Start game' }).click();
        const czar = await czarOfRound(tv, 1);
        await everyoneAnswers(phones, czar, 1);
        const czarPhone = phoneOf(phones, czar);
        await expect(czarPhone.locator('.judging-screen')).toBeVisible();
        await czarPhone.context().close();
        const away = tv.locator('.tv-away .tv-player', { hasText: czar });
        await expect(away).toContainText('Reconnecting…');
        await expect(away.locator('.kick-button')).toHaveCount(1);

        await expect(tv.locator(RESULT_TITLE)).toHaveText('Round skipped', { timeout: 10_000 });
        await expect(tv.locator('.tv-void-reason')).toHaveText('The Card Czar left. Everyone got their cards back.');
    });
});

test('a Czar whose phone reloads while judging still picks the winner', async ({ openHost, openPhone }) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Cara', 'Dan']);
    await phoneOf(phones, 'Ana').getByRole('button', { name: 'Start game' }).click();
    const czar = await czarOfRound(tv, 1);
    await everyoneAnswers(phones, czar, 1);
    const czarPhone = phoneOf(phones, czar);
    await expect(czarPhone.locator('.judging-screen')).toBeVisible();
    await czarPhone.reload();
    await judge(czarPhone, null);
    await expect(tv.locator(RESULT_TITLE)).toHaveText(/ wins the round$/);
});

test('a player who joins mid-game is dealt in at the next round', async ({ openHost, openPhone }) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Cara']);
    const ana = phoneOf(phones, 'Ana');
    await ana.getByRole('button', { name: 'Start game' }).click();
    const czar = await czarOfRound(tv, 1);
    const eve = await openPhone();
    await joinAs(eve, 'Eve');
    await expect(eve.getByRole('heading', { name: "You're dealt in next round" })).toBeVisible();
    await expect(tv.locator('.tv-player', { hasText: 'Eve' }).locator('.tv-player-status')).toHaveText(
        'Joins next round',
    );

    await everyoneAnswers(phones, czar, 1);
    await judge(phoneOf(phones, czar), null);
    await ana.getByRole('button', { name: 'Next round' }).click();
    await expect(tv.locator('#app[data-phase="SUBMITTING"] .tv-round')).toHaveText('Round 2');
    const eveIsCzar = (await czarOfRound(tv, 2)) === 'Eve';
    if (eveIsCzar) return await expect(eve.locator('.czar-waiting-screen')).toBeVisible();
    await expect(eve.locator('.answer-screen')).toBeVisible();
    // A Pick 3 card deals two extra cards first ("Draw 2, Pick 3").
    const badges = await eve.locator('.answer-screen .pick-badge').allTextContents();
    const drawTwo = badges.includes('Pick 3') ? 2 : 0;
    await expect(eve.locator('.answer-screen .hand-card')).toHaveCount(10 + drawTwo);
});

test('the host laptop removes a player; their phone says so and can join again', async ({ openHost, openPhone }) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan']);
    await expect(tv.getByRole('navigation', { name: 'Host controls' })).toBeVisible();
    await tv.getByRole('button', { name: 'Remove Bogdan' }).click();
    const bogdan = phoneOf(phones, 'Bogdan');
    await expect(bogdan.getByRole('heading', { name: 'You were removed from the game' })).toBeVisible();
    await expect(tv.locator('.player-tile .player-name')).toHaveText(['Ana']);
    await bogdan.getByRole('button', { name: 'Join again' }).click();
    await expect(bogdan.getByLabel('Your name')).toHaveValue('Bogdan');
    await expect(tv.locator('.player-tile .player-name')).toHaveText(['Ana']);
});

test('opening your seat in a second tab moves it there, and back on request', async ({ openPhone }) => {
    const phones = await seat(openPhone, ['Ana']);
    const first = phoneOf(phones, 'Ana');
    const second = await first.context().newPage();
    await second.goto(first.url());
    await expect(second.getByText('You have the crown')).toBeVisible();
    await expect(first.getByRole('heading', { name: 'Playing on another screen' })).toBeVisible();
    await first.getByRole('button', { name: 'Play on this screen' }).click();
    await expect(first.getByText('You have the crown')).toBeVisible();
    await expect(second.getByRole('heading', { name: 'Playing on another screen' })).toBeVisible();
});

test('the host laptop starts a game, and it pauses while fewer than 3 players are connected', async ({
    openHost,
    openPhone,
}) => {
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Cara']);
    await tv.getByRole('button', { name: 'Start game' }).click();
    await czarOfRound(tv, 1);
    await phoneOf(phones, 'Cara').context().close();
    await expect(tv.getByText('Cara is away. The game carries on when 3 players are connected.')).toBeVisible();
    await expect(phoneOf(phones, 'Ana').getByText('Paused until 3 players are connected again')).toBeVisible();
});
