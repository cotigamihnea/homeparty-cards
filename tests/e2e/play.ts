import type { Page } from '@playwright/test';
import { expect, joinAs, type PhoneViewport } from './fixtures.js';

export async function seat(
    openPhone: (viewport?: PhoneViewport) => Promise<Page>,
    names: readonly string[],
    viewport?: PhoneViewport,
): Promise<Map<string, Page>> {
    const phones = new Map<string, Page>();
    for (const name of names) {
        const phone = await openPhone(viewport);
        await joinAs(phone, name);
        await expect(phone.getByText("You're in!")).toBeVisible();
        phones.set(name, phone);
    }
    return phones;
}

function roundTitle(round: number): RegExp {
    return new RegExp(`^Round ${round}$`);
}

/** Waits until answers are open for this round on the TV and returns the Card Czar's name. */
export async function czarOfRound(tv: Page, round: number): Promise<string> {
    await expect(tv.locator('#app[data-phase="SUBMITTING"] .tv-round')).toHaveText(roundTitle(round));
    const title = (await tv.locator('.tv-title').textContent()) ?? '';
    return title.replace(/ is the Card Czar$/, '');
}

/** Taps hand cards until the answer is complete, sends it, and returns the texts of the cards sent. */
export async function answer(phone: Page, round: number): Promise<string[]> {
    const screen = phone
        .locator('.answer-screen')
        .filter({ has: phone.locator('.game-round', { hasText: roundTitle(round) }) });
    await expect(screen).toBeVisible();
    const send = phone.getByRole('button', { name: 'Send answer' });
    const texts: string[] = [];
    for (let i = 0; await send.isDisabled(); i++) {
        const card = phone.locator('.hand-card').nth(i);
        texts.push((await card.locator('.card-text').textContent()) ?? '');
        await card.click();
    }
    await send.click();
    // The last answer in moves the round straight on to judging.
    await expect(phone.locator('.answer-sent-screen, .watch-judging-screen')).toBeVisible();
    return texts;
}

/** Card text as it appears inside a filled blank can lose a period (also inside quotes or before ®) and gain a capital. */
export function sameAnswer(shown: string, card: string): boolean {
    const letters = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    return letters(shown) === letters(card);
}

/** The Czar looks at an answer (the one starting with `favourite`, else the first) and picks it. */
export async function judge(czar: Page, favourite: string | null): Promise<void> {
    await expect(czar.locator('.judging-screen')).toBeVisible();
    const buttons = czar.locator('.submission-button');
    const firstAnswers = await buttons.evaluateAll((nodes) =>
        nodes.map((node) => node.querySelector('.card-answer .card-text')?.textContent ?? ''),
    );
    const index = favourite ? firstAnswers.findIndex((shown) => sameAnswer(shown, favourite)) : 0;
    expect(index).toBeGreaterThanOrEqual(0);
    await buttons.nth(index).click();
    await expect(buttons.nth(index)).toHaveAttribute('aria-pressed', 'true');
    await czar.getByRole('button', { name: 'Pick this answer' }).click();
    const pick = czar.getByRole('button', { name: 'Yes, this one wins' });
    await expect(pick).toBeEnabled();
    await pick.click();
    try {
        await expect(czar.locator('#app[data-phase="JUDGING"]')).toHaveCount(0);
    } catch (error) {
        // Seen once in ~280 runs and not reproduced: say whether the tap was lost or the pick was refused.
        const notices = await czar.locator('[role="alert"]').allTextContents();
        const disabled = await pick.isDisabled().catch(() => 'gone');
        throw new Error(
            `the Czar's pick did not go through; phone says ${JSON.stringify(notices)}, Pick disabled: ${disabled}`,
            {
                cause: error,
            },
        );
    }
}

/** Every phone but the Czar's answers this round; returns each player's cards. */
export async function everyoneAnswers(
    phones: ReadonlyMap<string, Page>,
    czar: string,
    round: number,
): Promise<Map<string, string[]>> {
    const answers = new Map<string, string[]>();
    for (const [name, phone] of phones) {
        if (name !== czar) answers.set(name, await answer(phone, round));
    }
    return answers;
}

export function phoneOf(phones: ReadonlyMap<string, Page>, name: string): Page {
    const phone = phones.get(name);
    if (!phone) throw new Error(`no phone for ${name}`);
    return phone;
}
