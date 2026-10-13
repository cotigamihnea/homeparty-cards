import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { DECK_FORMAT } from '../../src/server/cards/customDeckFile.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../../src/shared/events.js';
import { E2E_TIMING, PHONE_VIEWPORTS, expect, expectNoHorizontalScroll, test } from './fixtures.js';
import { phoneOf, seat } from './play.js';

test.use({ timing: E2E_TIMING });

const SHOTS = 'test-results/screens';

function shot(page: Page, name: string): Promise<Buffer> {
    return page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled', fullPage: true });
}

/** Every visible button and field on the phone can be hit with a thumb. */
async function expectThumbSized(page: Page): Promise<void> {
    const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#app button, #app input, #app textarea, #app label.btn')]
            .filter((node) => node.offsetParent !== null && !node.classList.contains('sr-only'))
            .map((node) => ({ text: node.textContent || node.id, height: node.getBoundingClientRect().height }))
            .filter((node) => node.height < 47.5),
    );
    expect(small).toEqual([]);
}

async function openDecks(phone: Page): Promise<void> {
    await phone.getByRole('button', { name: 'Custom decks' }).click();
    await expect(phone.locator('h1')).toHaveText('Custom decks');
}

async function createDeck(phone: Page, name: string): Promise<void> {
    await phone.locator('#deck-new-name').fill(name);
    await phone.locator('#deck-create').click();
    await expect(phone.locator('h1')).toHaveText('Edit deck');
    await expect(phone.locator('#deck-name')).toHaveValue(name);
}

/** Writes a card and waits for it in the list (a black card's blanks show as lines, so pass words to find it by). */
async function writeCard(page: Page, text: string, shown = text): Promise<void> {
    await page.locator('#deck-card-text').fill(text);
    await page.locator('#deck-add-card').click();
    await expect(page.locator('.deck-card-text', { hasText: shown })).toBeVisible();
    await expect(page.locator('#deck-card-text')).toHaveValue('');
}

function cardRow(page: Page, text: string) {
    return page.locator('.deck-card', { has: page.locator('.deck-card-text', { hasText: text }) });
}

/** A deck file as the game exports it, with numbered cards. */
function deckFile(name: string, white: number, black: number): string {
    return JSON.stringify({
        format: DECK_FORMAT,
        version: 1,
        name,
        white: Array.from({ length: white }, (_, i) => `Custom answer ${i}.`),
        black: Array.from({ length: black }, (_, i) => ({ text: `Custom prompt ${i}: _.`, pick: 1 })),
    });
}

for (const viewport of PHONE_VIEWPORTS) {
    test(`the VIP builds a deck on a ${viewport.width}px phone: blanks, edits and removals`, async ({ openPhone }) => {
        const phones = await seat(openPhone, ['Ana', 'Bogdan'], viewport);
        const ana = phoneOf(phones, 'Ana');
        await expect(phoneOf(phones, 'Bogdan').getByRole('button', { name: 'Custom decks' })).toHaveCount(0);
        await openDecks(ana);
        await expect(ana.getByText('No decks yet.')).toBeVisible();
        await expectNoHorizontalScroll(ana);
        await createDeck(ana, 'Office Party');

        await ana.locator('#deck-tab-black').click();
        await expect(ana.locator('#deck-tab-black')).toHaveAttribute('aria-pressed', 'true');
        await ana.locator('#deck-card-text').fill('What did HR find in ');
        await ana.locator('#deck-add-blank').click();
        await expect(ana.locator('#deck-card-text')).toBeFocused();
        await ana.locator('#deck-card-text').pressSequentially('?');
        await expect(ana.locator('#deck-card-text')).toHaveValue('What did HR find in _____?');
        await ana.locator('#deck-add-card').click();
        await expect(cardRow(ana, 'What did HR find in')).toBeVisible();
        await expect(cardRow(ana, 'What did HR find in').locator('.blank')).toHaveCount(1);
        await writeCard(ana, '_ meets _.', 'meets');
        await expect(cardRow(ana, 'meets').locator('.pick-badge')).toHaveText('Pick 2');
        await expectNoHorizontalScroll(ana);
        await expectThumbSized(ana);
        await shot(ana, `phone-${viewport.width}-deck-black`);

        await ana.locator('#deck-tab-white').click();
        await writeCard(ana, 'A stapler.');
        await writeCard(ana, 'Free cake.');
        await writeCard(ana, 'The quarterly review.');
        await cardRow(ana, 'A stapler.').getByRole('button', { name: 'Edit' }).click();
        await ana.locator('#deck-edit-text').fill('A stapler with feelings.');
        await shot(ana, `phone-${viewport.width}-deck-edit`);
        await ana.locator('#deck-edit-save').click();
        await expect(ana.locator('.deck-card-text', { hasText: 'A stapler with feelings.' })).toBeVisible();
        await cardRow(ana, 'Free cake.').getByRole('button', { name: 'Remove' }).click();
        await expect(cardRow(ana, 'Free cake.')).toHaveCount(0);
        await expect(ana.locator('#deck-tab-white')).toHaveText('White cards (2)');
        await expect(ana.locator('#deck-tab-black')).toHaveText('Black cards (2)');
        await expectNoHorizontalScroll(ana);
        await expectThumbSized(ana);
        await shot(ana, `phone-${viewport.width}-deck-white`);

        // A new name typed but not confirmed is saved by the one tap on Back.
        await ana.locator('#deck-name').fill('Office Party 2');
        await ana.getByRole('button', { name: 'Back to decks' }).click();
        const row = ana.locator('.deck-row', { hasText: 'Office Party 2' });
        await expect(row).toContainText('2 white, 2 black');
        await expectThumbSized(ana);
        await shot(ana, `phone-${viewport.width}-decks`);
        await row.getByRole('button', { name: 'Delete' }).click();
        await expect(row).toContainText('Delete “Office Party 2”? This can’t be undone.');
        await shot(ana, `phone-${viewport.width}-deck-delete`);
        await row.getByRole('button', { name: 'Cancel' }).click();
        await expect(row).toContainText('2 white, 2 black');
    });
}

test('a game played with only a custom deck', async ({ openHost, openPhone, server }) => {
    const laptop: Socket<ServerToClientEvents, ClientToServerEvents> = io(`http://127.0.0.1:${server.port}`, {
        forceNew: true,
        transports: ['websocket'],
    });
    try {
        expect((await laptop.emitWithAck('hostHello')).admin).toBe(true);
        const imported = await laptop.emitWithAck('importDeck', { json: deckFile('Office', 39, 10) });
        expect(imported).toMatchObject({ ok: true, imported: 49 });
    } finally {
        laptop.disconnect();
    }
    const tv = await openHost();
    const phones = await seat(openPhone, ['Ana', 'Bogdan', 'Cara']);
    const ana = phoneOf(phones, 'Ana');
    await ana.getByRole('button', { name: 'Game settings' }).click();
    await ana.getByRole('button', { name: 'Choose packs' }).click();
    await ana.getByRole('button', { name: 'Your decks only' }).click();
    await expect(ana.locator('.pack-total')).toHaveText('1 pack: 39 white, 10 black cards');
    await expect(ana.locator('details[data-kind="custom"] summary')).toContainText('Your decks');
    await expect(tv.locator('.lobby-settings')).toContainText('1 pack: 39 white, 10 black cards');
    await ana.getByRole('button', { name: 'Done' }).click();
    await ana.getByRole('button', { name: 'Done' }).click();
    await ana.getByRole('button', { name: 'Start game' }).click();
    await expect(tv.locator('#app[data-phase="SUBMITTING"] .card-black .card-text')).toContainText(
        /^Custom prompt \d+:/,
    );
    const hand = await phoneOf(phones, 'Bogdan').locator('.hand-card .card-text').allTextContents();
    expect(hand.length).toBeGreaterThan(0);
    for (const card of hand) expect(card).toMatch(/^Custom answer \d+\.$/);
});

test('a deck exported from the phone imports back as a copy, and a deleted deck leaves the packs', async ({
    openPhone,
}) => {
    const ana = phoneOf(await seat(openPhone, ['Ana']), 'Ana');
    await openDecks(ana);
    await createDeck(ana, 'Office Party');
    await writeCard(ana, 'A stapler.');
    await ana.locator('#deck-tab-black').click();
    await writeCard(ana, 'Who took my _?', 'Who took my');
    await ana.getByRole('button', { name: 'Back to decks' }).click();

    const row = ana.locator('.deck-row', { hasText: 'Office Party' });
    const [download] = await Promise.all([
        ana.waitForEvent('download'),
        row.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('Office Party.cah-deck.json');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cah-export-'));
    const file = path.join(folder, download.suggestedFilename());
    await download.saveAs(file);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ format: DECK_FORMAT, name: 'Office Party' });

    await ana.locator('#deck-import').setInputFiles(file);
    await expect(ana.getByRole('status')).toHaveText('Imported 2 cards into “Office Party (2)”.');
    const copy = ana.locator('.deck-row', { hasText: 'Office Party (2)' });
    await expect(copy).toContainText('1 white, 1 black');
    fs.rmSync(folder, { recursive: true, force: true });

    await copy.getByRole('button', { name: 'Delete' }).click();
    await copy.getByRole('button', { name: 'Delete' }).click();
    await expect(ana.locator('.deck-row')).toHaveCount(1);
    await row.getByRole('button', { name: 'Delete' }).click();
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(ana.getByText('No decks yet.')).toBeVisible();
    await ana.getByRole('button', { name: 'Done' }).click();
    await ana.getByRole('button', { name: 'Game settings' }).click();
    await ana.getByRole('button', { name: 'Choose packs' }).click();
    await expect(ana.locator('details[data-kind="base"]')).toBeVisible();
    await expect(ana.locator('details[data-kind="custom"]')).toHaveCount(0);
    await expect(ana.getByRole('button', { name: 'Your decks only' })).toHaveCount(0);
});

test('the laptop keeps the same decks, says where they are saved, and the phone sees its edits', async ({
    openHost,
    openPhone,
    server,
}) => {
    const tv = await openHost();
    const ana = phoneOf(await seat(openPhone, ['Ana']), 'Ana');
    await openDecks(ana);
    await createDeck(ana, 'Office Party');
    await writeCard(ana, 'A stapler.');

    await tv.locator('#admin-decks').click();
    const dialog = tv.getByRole('dialog', { name: 'Custom decks' });
    await expect(dialog.locator('.deck-row', { hasText: 'Office Party' })).toContainText('1 white, 0 black');
    await expect(dialog.locator('.deck-folder')).toHaveText(`Saved on this laptop in ${server.decks.folder}`);
    await shot(tv, 'tv-decks');
    await dialog.getByRole('button', { name: 'Edit' }).click();
    await expect(tv.getByRole('dialog', { name: 'Edit deck' })).toBeVisible();
    await writeCard(tv, 'Free cake.');
    await shot(tv, 'tv-deck-edit');

    // The phone's open editor fetches the deck again when the pack list version moves.
    await expect(ana.locator('.deck-card-text', { hasText: 'Free cake.' })).toBeVisible();
    await expect(ana.locator('#deck-tab-white')).toHaveText('White cards (2)');

    await tv.keyboard.press('Escape');
    await expect(tv.getByRole('dialog')).toHaveCount(0);
    await expect(tv.locator('#admin-decks')).toBeFocused();
});

test('a card being typed survives the screen changing under it: same field, keyboard and text', async ({
    openPhone,
    server,
}) => {
    const ana = phoneOf(await seat(openPhone, ['Ana']), 'Ana');
    await openDecks(ana);
    await createDeck(ana, 'Office Party');
    const box = ana.locator('#deck-card-text');
    await box.pressSequentially('Half a sen');
    await box.evaluate((node) => Object.assign(node, { typedHere: true }));

    const laptop: Socket<ServerToClientEvents, ClientToServerEvents> = io(`http://127.0.0.1:${server.port}`, {
        forceNew: true,
        transports: ['websocket'],
    });
    try {
        await laptop.emitWithAck('hostHello');
        const [deck] = (await laptop.emitWithAck('listPacks')).filter((pack) => pack.kind === 'custom');
        expect(
            await laptop.emitWithAck('addDeckCard', { deckId: deck!.id, color: 'white', text: 'From the laptop.' }),
        ).toEqual({ ok: true });
    } finally {
        laptop.disconnect();
    }
    await expect(ana.locator('.deck-card-text', { hasText: 'From the laptop.' })).toBeVisible();

    expect(await box.evaluate((node) => 'typedHere' in node && document.activeElement === node)).toBe(true);
    await expect(box).toHaveValue('Half a sen');
    await box.pressSequentially('tence.');
    await box.press('Enter');
    await expect(ana.locator('.deck-card-text', { hasText: 'Half a sentence.' })).toBeVisible();
    await expect(box).toHaveValue('');
    await expect(ana.locator('#deck-tab-white')).toHaveText('White cards (2)');
});
