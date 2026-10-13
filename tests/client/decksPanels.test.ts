// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { adminBar, type AdminActions, type AdminState } from '../../src/client/host/adminBar.js';
import { decksDialog } from '../../src/client/host/decksDialog.js';
import { decksScreen } from '../../src/client/phone/decksScreen.js';
import { lobbyPanel } from '../../src/client/phone/play.js';
import { waitingScreen } from '../../src/client/phone/waitingScreen.js';
import { packCatalog } from '../../src/client/ui/catalog.js';
import { emptyDeckEditorState, type DeckActions } from '../../src/client/ui/decks/deckEditor.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import type { PackSummary } from '../../src/shared/packs.js';
import { hostView, player, playerView } from './views.js';

setLanguage('en');

/** Every action a spy, made on first use. */
function spies<T>(): T {
    return new Proxy({}, { get: (target: Record<string, unknown>, key: string) => (target[key] ??= vi.fn()) }) as T;
}

const OFFICE: PackSummary = { id: 'custom-0000000a', name: 'Office', kind: 'custom', white: 3, black: 1 };
const BASE: PackSummary = { id: 'cah-base-set', name: 'CAH Base Set', kind: 'base', white: 1269, black: 278 };

async function loadedCatalog() {
    const catalog = packCatalog(async () => [OFFICE, BASE]);
    catalog.load(() => {});
    await Promise.resolve();
    await Promise.resolve();
    return catalog;
}

const button = (root: HTMLElement, name: string) =>
    [...root.querySelectorAll('button')].find((node) => node.textContent === name);

describe('custom decks on the VIP phone', () => {
    const lobby = (isVip: boolean) =>
        playerView({ phase: 'LOBBY', round: null, players: [player('me', { isVip }), player('other')] });
    const waiting = (isVip: boolean) => {
        const onOpenPanel = vi.fn();
        const node = waitingScreen(lobby(isVip), {
            dealIn: false,
            notice: null,
            pending: false,
            onStart: vi.fn(),
            onOpenPanel,
            onChooseAvatar: vi.fn(),
        });
        return { node, onOpenPanel };
    };

    it('the VIP has a Custom decks button next to Settings; other players do not', () => {
        const { node, onOpenPanel } = waiting(true);
        button(node, 'Custom decks')!.click();
        expect(onOpenPanel).toHaveBeenCalledWith('decks');
        expect(button(waiting(false).node, 'Custom decks')).toBeUndefined();
    });

    it('the decks panel stays open only for the VIP in the lobby', () => {
        expect(lobbyPanel(lobby(true), 'decks')).toBe('decks');
        expect(lobbyPanel(lobby(false), 'decks')).toBeNull();
    });

    it('lists only the custom decks, and Done closes the panel', async () => {
        const close = vi.fn();
        const node = decksScreen({
            catalog: await loadedCatalog(),
            deck: { state: emptyDeckEditorState(), pending: false, act: spies<DeckActions>() },
            notice: null,
            close,
            retryCatalog: vi.fn(),
        });
        expect(node.querySelector('h1')!.textContent).toBe('Custom decks');
        expect([...node.querySelectorAll('.deck-row-name')].map((row) => row.textContent)).toEqual(['Office']);
        button(node, 'Done')!.click();
        expect(close).toHaveBeenCalled();
    });

    it('with a deck open, shows the editor and goes back to the list', async () => {
        const act = spies<DeckActions>();
        const open = { id: OFFICE.id, name: 'Office', white: ['A.'], black: [] };
        const node = decksScreen({
            catalog: await loadedCatalog(),
            deck: { state: { ...emptyDeckEditorState(), open }, pending: false, act },
            notice: 'That card is already in this deck.',
            close: vi.fn(),
            retryCatalog: vi.fn(),
        });
        expect(node.querySelector('h1')!.textContent).toBe('Edit deck');
        expect(node.querySelector('#deck-card-text')).not.toBeNull();
        expect(node.textContent).toContain('That card is already in this deck.');
        button(node, 'Back to decks')!.click();
        expect(act.close).toHaveBeenCalled();
    });
});

describe('custom decks on the laptop', () => {
    it('the host controls open them from the lobby', () => {
        const act = spies<AdminActions>();
        const state: AdminState = {
            pending: false,
            notice: null,
            confirmEnd: false,
            confirmStart: false,
            confirmLeave: null,
            feverName: null,
            sound: { muted: false, volume: 1 },
        };
        const node = adminBar(hostView({ phase: 'LOBBY', round: null }), state, act);
        const decks = node.querySelector<HTMLButtonElement>('#admin-decks')!;
        expect(decks.textContent).toBe('Custom decks');
        decks.click();
        expect(act.openDecks).toHaveBeenCalled();
    });

    it('the panel says where the decks are saved, as plain text', async () => {
        const node = decksDialog({
            catalog: await loadedCatalog(),
            deck: { state: emptyDeckEditorState(), pending: false, act: spies<DeckActions>() },
            notice: null,
            close: vi.fn(),
            retryCatalog: vi.fn(),
            folder: 'C:\\Users\\Ana\\AppData\\Roaming\\Homeparty Cards\\custom-decks',
        });
        expect(node.querySelector('[role="dialog"]')).not.toBeNull();
        expect(node.querySelector('.dialog-foot')!.textContent).toContain(
            'Saved on this laptop in C:\\Users\\Ana\\AppData\\Roaming\\Homeparty Cards\\custom-decks',
        );
        expect(node.querySelectorAll('.deck-row')).toHaveLength(1);
    });
});
