import type { Page } from '@playwright/test';
import type { Settings } from '../../src/shared/settings.js';
import { E2E_TIMING, PHONE_VIEWPORTS, expect, expectNoHorizontalScroll, test } from './fixtures.js';
import { phoneOf, seat } from './play.js';

test.use({ timing: E2E_TIMING });

const SHOTS = 'test-results/screens';
/** Hand size 7 keeps the writing short: 10 white and 4 black cards each for three players. */
const FEVER: Partial<Settings> = { gameMode: 'customFever', handSize: 7, writingMinutes: 5 };

function shot(page: Page, name: string): Promise<Buffer> {
    return page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled', fullPage: true });
}

/** Three phones (Cy on the small one), Custom Fever on, started by the VIP: everyone is on the writing screen. */
async function feverTable(
    openPhone: (viewport?: (typeof PHONE_VIEWPORTS)[number]) => Promise<Page>,
    hostSettings: (patch: Partial<Settings>) => Promise<void>,
    settings: Partial<Settings> = {},
) {
    const phones = await seat(openPhone, ['Ana', 'Bo']);
    const cy = await seat(openPhone, ['Cy'], PHONE_VIEWPORTS[1]);
    phones.set('Cy', phoneOf(cy, 'Cy'));
    await hostSettings({ ...FEVER, ...settings });
    const ana = phoneOf(phones, 'Ana');
    await ana.getByRole('button', { name: 'Start game' }).click();
    for (const phone of phones.values()) await expect(phone.locator('#app[data-phase="WRITING"]')).toBeVisible();
    return phones;
}

/** Writes cards through the writing screen, checking the progress line after each one. */
async function writeCards(phone: Page, name: string, white: number, black: number): Promise<void> {
    if (white > 0) await phone.locator('#fever-tab-white').click();
    for (let i = 0; i < white; i++) {
        await phone.locator('#fever-card-text').fill(`${name} answer ${i}.`);
        await phone.locator('#fever-add-card').click();
        await expect(phone.locator('#fever-progress')).toContainText(`${i + 1} of 10 white`);
    }
    if (black > 0) await phone.locator('#fever-tab-black').click();
    for (let i = 0; i < black; i++) {
        await phone.locator('#fever-card-text').fill(`${name} prompt ${i}: _.`);
        await phone.locator('#fever-add-card').click();
        await expect(phone.locator('#fever-progress')).toContainText(`${i + 1} of 4 black`);
    }
}

test('three phones write the whole deck, and round 1 is played with their cards', async ({
    openHost,
    openPhone,
    hostSettings,
}) => {
    test.setTimeout(90_000);
    const tv = await openHost();
    const phones = await feverTable(openPhone, hostSettings);
    await expect(tv.locator('.tv-title')).toHaveText('Everyone writes the deck');
    await expect(tv.locator('.tv-writing-screen .card-black')).toContainText('deck is written by');

    const [ana, bo, cy] = ['Ana', 'Bo', 'Cy'].map((name) => phoneOf(phones, name)) as [Page, Page, Page];
    await writeCards(ana, 'Ana', 10, 2);
    await shot(ana, 'phone-390-fever-black');
    await expectNoHorizontalScroll(ana);
    await writeCards(ana, 'Ana', 0, 0);
    await ana.locator('#fever-tab-black').click();
    for (let i = 2; i < 4; i++) {
        await ana.locator('#fever-card-text').fill(`Ana prompt ${i}: _.`);
        await ana.locator('#fever-add-card').click();
    }
    await expect(ana.locator('.fever-done')).toContainText("You're done!");
    await expect(ana.locator('#fever-full')).toHaveText('All 4 black cards are written.');
    await shot(ana, 'phone-390-fever-done');
    await expect(tv.locator('.tv-player', { hasText: 'Ana' })).toContainText('Done');
    await expect(tv.locator('.tv-player', { hasText: 'Bo' })).toContainText('0 of 14 cards');
    await shot(tv, 'tv-fever-writing');

    await writeCards(bo, 'Bo', 10, 4);
    await writeCards(cy, 'Cy', 5, 0);
    await shot(cy, 'phone-360-fever-white');
    await expectNoHorizontalScroll(cy);
    for (let i = 5; i < 10; i++) {
        await cy.locator('#fever-card-text').fill(`Cy answer ${i}.`);
        await cy.locator('#fever-add-card').click();
    }
    await cy.locator('#fever-tab-black').click();
    for (let i = 0; i < 4; i++) {
        await cy.locator('#fever-card-text').fill(`Cy prompt ${i}: _.`);
        await cy.locator('#fever-add-card').click();
    }

    await expect(tv.locator('#app[data-phase="SUBMITTING"] .card-black .card-text')).toContainText(
        /^(Ana|Bo|Cy) prompt \d: /,
    );
    for (const phone of [ana, bo, cy]) {
        const hand = await phone.locator('.hand-card .card-text').allTextContents();
        for (const card of hand) expect(card).toMatch(/^(Ana|Bo|Cy) answer \d\.$/);
    }
});

test('the VIP starts before everyone is done: a question first, then packs fill the gaps', async ({
    openHost,
    openPhone,
    hostSettings,
}) => {
    const tv = await openHost();
    const phones = await feverTable(openPhone, hostSettings);
    const ana = phoneOf(phones, 'Ana');
    await writeCards(ana, 'Ana', 2, 0);
    await ana.locator('#fever-start-now').click();
    await expect(ana.getByRole('alert')).toHaveText(
        "3 players haven't finished. Their missing cards will come from the packs.",
    );
    await shot(ana, 'phone-390-fever-start-now');
    await ana.getByRole('button', { name: 'Start now' }).click();
    await expect(tv.locator('#app[data-phase="SUBMITTING"]')).toBeVisible();
    const hand = await phoneOf(phones, 'Bo').locator('.hand-card .card-text').allTextContents();
    expect(hand.some((card) => !/^Ana answer/.test(card))).toBe(true);
});

test('a card being typed survives the others writing, and a reload brings back what was written', async ({
    openPhone,
    hostSettings,
}) => {
    const phones = await feverTable(openPhone, hostSettings);
    const bo = phoneOf(phones, 'Bo');
    const cy = phoneOf(phones, 'Cy');
    const box = bo.locator('#fever-card-text');
    await box.pressSequentially('Half a sen');
    await box.evaluate((node) => Object.assign(node, { typedHere: true }));
    await writeCards(cy, 'Cy', 3, 0);
    expect(await box.evaluate((node) => 'typedHere' in node && document.activeElement === node)).toBe(true);
    await expect(box).toHaveValue('Half a sen');
    await box.pressSequentially('tence.');
    await box.press('Enter');
    await expect(bo.locator('.deck-card-text', { hasText: 'Half a sentence.' })).toBeVisible();

    await cy.reload();
    await expect(cy.locator('#fever-progress')).toHaveText('3 of 10 white, 0 of 4 black');
    await expect(cy.locator('.deck-card-text')).toHaveCount(3);
});

test('without a time limit the TV says so, and there is no countdown', async ({
    openHost,
    openPhone,
    hostSettings,
}) => {
    const tv = await openHost();
    await feverTable(openPhone, hostSettings, { writingMinutes: null });
    await expect(tv.locator('.tv-writing-hint')).toHaveText(
        'Write your cards on your phone. The game starts when everyone is done.',
    );
    await expect(tv.locator('.tv-header .countdown')).toHaveCount(0);
});

test('at the game over the VIP saves the cards as a deck; leaving unsaved asks first', async ({
    openHost,
    openPhone,
    hostSettings,
}) => {
    const tv = await openHost();
    const phones = await feverTable(openPhone, hostSettings);
    const ana = phoneOf(phones, 'Ana');
    await writeCards(ana, 'Ana', 2, 1);
    await tv.getByRole('button', { name: 'End game' }).click();
    await tv.getByRole('button', { name: 'End it now' }).click();
    await expect(ana.locator('#app[data-phase="GAME_OVER"]')).toBeVisible();

    // Any month: British English writes September as "Sept".
    await expect(tv.locator('#admin-fever-name')).toHaveValue(/^Custom Fever \d{1,2} \S+$/);
    await shot(tv, 'tv-fever-game-over-bar');
    await ana.getByRole('button', { name: 'Play again' }).click();
    await expect(ana.getByRole('alert')).toHaveText('These cards will be lost.');
    await ana.getByRole('button', { name: 'Cancel' }).click();

    await expect(ana.locator('#fever-save-name')).toHaveValue(/^Custom Fever /);
    await expect(phoneOf(phones, 'Cy').getByText('Ana can save these cards as a deck.')).toBeVisible();
    await shot(phoneOf(phones, 'Cy'), 'phone-360-fever-game-over');
    await ana.locator('#fever-save-name').fill('Party night');
    await shot(ana, 'phone-390-fever-save');
    await ana.locator('#fever-save').click();
    for (const phone of phones.values()) {
        await expect(phone.locator('.fever-saved')).toHaveText('Saved as the deck “Party night”');
    }
    await expect(tv.locator('.tv-fever-saved')).toHaveText('Saved as the deck “Party night”');
    await expect(tv.locator('#admin-fever-name')).toHaveCount(0);

    await ana.getByRole('button', { name: 'Back to lobby' }).click();
    await ana.getByRole('button', { name: 'Custom decks' }).click();
    await expect(ana.locator('.deck-row', { hasText: 'Party night' })).toContainText('2 white, 1 black');
});
