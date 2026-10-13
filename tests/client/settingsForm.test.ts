// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import { packPicker } from '../../src/client/ui/settings/packPicker.js';
import { settingsForm } from '../../src/client/ui/settings/settingsForm.js';
import type { PackSummary } from '../../src/shared/packs.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings.js';
import type { DeckSummary } from '../../src/shared/views.js';

setLanguage('en');

const DECK: DeckSummary = { white: 4351, black: 951, problem: null };

function form(settings: Partial<Settings> = {}, deck = DECK) {
    const onChange = vi.fn();
    const onOpenPacks = vi.fn();
    const node = settingsForm({ ...DEFAULT_SETTINGS, ...settings }, deck, { onChange, onOpenPacks });
    document.body.replaceChildren(node);
    return { node, onChange, onOpenPacks };
}

function radio(node: HTMLElement, id: string): HTMLInputElement {
    const input = node.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`no #${id}`);
    return input;
}

describe('settingsForm', () => {
    it('offers the game mode first, and the writing time only for Custom Fever', () => {
        const classic = form().node;
        expect(classic.querySelector('fieldset legend')?.textContent).toBe('Game mode');
        expect(classic.querySelector<HTMLInputElement>('#setting-gameMode-classic')?.checked).toBe(true);
        expect(classic.querySelector('#setting-writingMinutes-5')).toBeNull();

        const { node, onChange } = form({ gameMode: 'customFever', writingMinutes: 5 });
        expect(node.textContent).toContain('Everyone writes their own cards first');
        expect(node.querySelector<HTMLInputElement>('#setting-writingMinutes-5')?.checked).toBe(true);
        node.querySelector<HTMLInputElement>('#setting-writingMinutes-none')!.click();
        expect(onChange).toHaveBeenCalledWith({ writingMinutes: null });
        node.querySelector<HTMLInputElement>('#setting-gameMode-classic')!.click();
        expect(onChange).toHaveBeenCalledWith({ gameMode: 'classic' });
    });

    it('shows the current settings as checked choices', () => {
        const { node } = form({ handSize: 8 });
        expect(radio(node, 'setting-pointsToWin-7').checked).toBe(true);
        expect(radio(node, 'setting-handSize-8').checked).toBe(true);
        expect(radio(node, 'setting-language-en').checked).toBe(true);
    });

    it('sends one change per choice', () => {
        const { node, onChange } = form();
        radio(node, 'setting-pointsToWin-10').click();
        radio(node, 'setting-submitSeconds-0').click();
        radio(node, 'setting-language-ro').click();
        expect(onChange.mock.calls).toEqual([[{ pointsToWin: 10 }], [{ submitSeconds: 0 }], [{ language: 'ro' }]]);
    });

    it('asks for a round limit only when points are unlimited', () => {
        expect(form().node.querySelector('#setting-roundLimit-15')).toBeNull();
        const { node, onChange } = form({ pointsToWin: null });
        expect(radio(node, 'setting-pointsToWin-none').checked).toBe(true);
        radio(node, 'setting-roundLimit-none').click();
        expect(onChange).toHaveBeenCalledWith({ roundLimit: null });
    });

    it('sends unlimited points as null', () => {
        const { node, onChange } = form();
        radio(node, 'setting-pointsToWin-none').click();
        expect(onChange).toHaveBeenCalledWith({ pointsToWin: null });
    });

    it('lists every house rule as a switch with its explanation, off by default', () => {
        const { node } = form();
        const rules = ['rebootTheUniverse', 'randoCardrissian', 'happyEnding', 'neverHaveIEver', 'autoPlay'];
        for (const rule of rules) {
            const input = radio(node, `setting-${rule}`);
            expect(input.type).toBe('checkbox');
            expect(input.getAttribute('role')).toBe('switch');
            expect(input.checked).toBe(false);
            const help = node.querySelector(`#${input.getAttribute('aria-describedby')}`);
            expect(help?.textContent?.length).toBeGreaterThan(20);
        }
        expect(node.querySelector('.house-rules legend')?.textContent).toBe('House rules');
        expect(node.querySelector('#setting-autoPlay-help')?.textContent).toMatch(/^Needs the answer timer/);
        expect(radio(node, 'setting-blankCards-0').checked).toBe(true);
    });

    it('sends one house rule at a time', () => {
        const { node, onChange } = form({ happyEnding: true });
        expect(radio(node, 'setting-happyEnding').checked).toBe(true);
        radio(node, 'setting-happyEnding').click();
        radio(node, 'setting-randoCardrissian').click();
        radio(node, 'setting-blankCards-2').click();
        expect(onChange.mock.calls).toEqual([
            [{ happyEnding: false }],
            [{ randoCardrissian: true }],
            [{ blankCards: 2 }],
        ]);
    });

    it('sums up the packs, says what is missing, and opens the pack picker', () => {
        const { node, onOpenPacks } = form({ packIds: [] }, { white: 0, black: 0, problem: 'NOT_ENOUGH_WHITE_CARDS' });
        expect(node.textContent).toContain('0 packs: 0 white, 0 black cards');
        expect(node.textContent).toContain('Not enough white cards');
        node.querySelector<HTMLButtonElement>('.settings-packs button')!.click();
        expect(onOpenPacks).toHaveBeenCalledOnce();
    });
});

const pack = (id: string, kind: PackSummary['kind'], name = id): PackSummary => ({
    id,
    name,
    kind,
    white: 1269,
    black: 278,
});
const CATALOG = [pack('cah-base-set', 'base'), pack('xmas', 'themed'), pack('fan-a', 'fan', '<b>Fan</b> & co')];

function picker(selected: string[], openGroups: PackSummary['kind'][] = ['base']) {
    const onChange = vi.fn();
    const onToggleGroup = vi.fn();
    const node = packPicker(CATALOG, selected, DECK, { openGroups: new Set(openGroups) }, { onChange, onToggleGroup });
    document.body.replaceChildren(node);
    return { node, onChange, onToggleGroup };
}

describe('packPicker', () => {
    it('ticks the selected packs and shows each pack’s card counts', () => {
        const { node } = picker(['xmas']);
        expect(node.querySelector<HTMLInputElement>('#pack-xmas')?.checked).toBe(true);
        expect(node.querySelector<HTMLInputElement>('#pack-cah-base-set')?.checked).toBe(false);
        expect(node.querySelector('label[for="pack-xmas"]')?.textContent).toContain('1,269 white, 278 black');
    });

    it('sends the new selection, in library order, when a pack is ticked', () => {
        const { node, onChange } = picker(['xmas']);
        node.querySelector<HTMLInputElement>('#pack-cah-base-set')!.click();
        expect(onChange).toHaveBeenCalledWith(['cah-base-set', 'xmas']);
    });

    it('has quick choices for every official pack and for the base set alone', () => {
        const { node, onChange } = picker(['fan-a']);
        const buttons = [...node.querySelectorAll<HTMLButtonElement>('.pack-quick button')];
        expect(buttons.map((button) => button.textContent)).toEqual(['Official only', 'Base only']);
        buttons[0]!.click();
        buttons[1]!.click();
        expect(onChange.mock.calls).toEqual([[['cah-base-set', 'xmas']], [['cah-base-set']]]);
    });

    it('with custom decks, heads the list with "Your decks" and offers them alone', () => {
        const onChange = vi.fn();
        const catalog = [pack('custom-0000000a', 'custom', 'Office'), ...CATALOG];
        const node = packPicker(catalog, [], DECK, { openGroups: new Set() }, { onChange, onToggleGroup: vi.fn() });
        const buttons = [...node.querySelectorAll<HTMLButtonElement>('.pack-quick button')];
        expect(buttons.map((button) => button.textContent)).toEqual(['Official only', 'Base only', 'Your decks only']);
        buttons[2]!.click();
        expect(onChange).toHaveBeenCalledWith(['custom-0000000a']);
        const first = node.querySelector('details')!;
        expect(first.dataset.kind).toBe('custom');
        expect(first.querySelector('summary')?.textContent).toContain('Your decks');
    });

    it('shows each kind of pack as a group that is folded away unless it was opened', () => {
        const groups = [...picker([], ['base', 'fan']).node.querySelectorAll('details')];
        expect(groups.map((group) => group.dataset.kind)).toEqual(['base', 'themed', 'fan']);
        expect(groups.map((group) => group.open)).toEqual([true, false, true]);
    });

    it('turns a whole group on or off', () => {
        const { node, onChange } = picker(['cah-base-set'], ['fan']);
        const fan = node.querySelector('details[data-kind="fan"]')!;
        [...fan.querySelectorAll<HTMLButtonElement>('.pack-group-toggles button')].forEach((button) => button.click());
        expect(onChange.mock.calls).toEqual([[['cah-base-set', 'fan-a']], [['cah-base-set']]]);
    });

    it('shows pack names as text, never as markup', () => {
        const { node } = picker([]);
        expect(node.querySelector('label[for="pack-fan-a"] b')).toBeNull();
        expect(node.querySelector('label[for="pack-fan-a"]')?.textContent).toContain('<b>Fan</b> & co');
    });

    it('counts how many packs of each group are on', () => {
        const { node } = picker(['xmas', 'fan-a']);
        expect(node.querySelector('details[data-kind="themed"] summary')?.textContent).toContain('1 of 1 on');
        expect(node.querySelector('details[data-kind="base"] summary')?.textContent).toContain('0 of 1 on');
    });
});

describe('focus after a re-render', () => {
    it('every control in the pack picker has an id, so focus comes back to it', () => {
        const { node } = picker([], ['base', 'fan']);
        const controls = [...node.querySelectorAll<HTMLElement>('button, summary, input')];
        expect(controls.length).toBeGreaterThan(0);
        expect(controls.filter((control) => !control.id)).toEqual([]);
        expect(new Set(controls.map((control) => control.id)).size).toBe(controls.length);
    });
});
