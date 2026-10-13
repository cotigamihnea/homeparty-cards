// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminBar, type AdminActions, type AdminState } from '../../src/client/host/adminBar.js';
import { gameOverScreen as tvGameOver } from '../../src/client/host/resultScreens.js';
import type { PhoneActions } from '../../src/client/phone/parts.js';
import { gameOverScreen } from '../../src/client/phone/resultScreens.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import type { GameOverView } from '../../src/shared/views.js';
import { phoneContext } from './phoneContext.js';
import { hostView, player, playerView } from './views.js';

setLanguage('en');

beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-13T20:00:00'), toFake: ['Date'] });
});
afterEach(() => {
    vi.useRealTimers();
});

const players = [player('me', { name: 'Ana', isVip: true }), player('bo', { name: 'Bo' })];
const over = (fever: GameOverView['fever']): GameOverView => ({
    winnerIds: ['me'],
    standings: [
        { playerId: 'me', score: 2, rank: 1 },
        { playerId: 'bo', score: 1, rank: 2 },
    ],
    bestOf: [],
    fever,
});
const UNSAVED = { white: 9, black: 3, savedAs: null };
const SAVED = { white: 9, black: 3, savedAs: 'Party night' };

function spies<T>(): T {
    return new Proxy({}, { get: (t: Record<string, unknown>, k: string) => (t[k] ??= vi.fn()) }) as unknown as T;
}

function phone(fever: GameOverView['fever'], options: { vip?: boolean; confirmLeave?: 'playAgain' | null } = {}) {
    const act = spies<PhoneActions>();
    const view = playerView({
        phase: 'GAME_OVER',
        round: null,
        players: players.map((p) =>
            p.id === 'me' ? { ...p, isVip: options.vip ?? true } : { ...p, isVip: !(options.vip ?? true) },
        ),
        gameOver: over(fever),
    });
    const node = gameOverScreen(view, phoneContext({ act, confirmLeave: options.confirmLeave ?? null }));
    document.body.replaceChildren(node);
    return { node, act };
}

const button = (root: HTMLElement, name: string) =>
    [...root.querySelectorAll('button')].find((node) => node.textContent === name);

describe('the game over of a Custom Fever game, on the phone', () => {
    it('lets the VIP save the cards, with a name ready', () => {
        const { node, act } = phone(UNSAVED);
        expect(node.querySelector<HTMLInputElement>('#fever-save-name')?.value).toBe('Custom Fever 13 Oct');
        expect(node.textContent).toContain('9 white and 3 black cards');
        node.querySelector<HTMLButtonElement>('#fever-save')!.click();
        expect(act.saveFever).toHaveBeenCalled();
    });

    it('tells the others the VIP can save them', () => {
        const { node } = phone(UNSAVED, { vip: false });
        expect(node.querySelector('#fever-save-name')).toBeNull();
        expect(node.textContent).toContain('can save these cards as a deck');
    });

    it('shows everyone the deck they were saved as', () => {
        for (const vip of [true, false]) {
            const { node } = phone(SAVED, { vip });
            expect(node.querySelector('.fever-saved')?.textContent).toBe('Saved as the deck “Party night”');
            expect(node.querySelector('#fever-save-name')).toBeNull();
        }
    });

    it('asks before Play again or Back to lobby throws unsaved cards away', () => {
        const { node, act } = phone(UNSAVED);
        button(node, 'Play again')!.click();
        expect(act.askLeave).toHaveBeenCalledWith('playAgain');
        expect(act.playAgain).not.toHaveBeenCalled();
        button(node, 'Back to lobby')!.click();
        expect(act.askLeave).toHaveBeenCalledWith('backToLobby');

        const asking = phone(UNSAVED, { confirmLeave: 'playAgain' });
        expect(asking.node.textContent).toContain('These cards will be lost.');
        button(asking.node, 'Play again')!.click();
        expect(asking.act.playAgain).toHaveBeenCalled();
        button(asking.node, 'Cancel')!.click();
        expect(asking.act.askLeave).toHaveBeenCalledWith(null);
    });

    it('goes straight on once the cards are saved, and a classic game has none of this', () => {
        const saved = phone(SAVED);
        button(saved.node, 'Play again')!.click();
        expect(saved.act.playAgain).toHaveBeenCalled();
        const classic = phone(null);
        expect(classic.node.querySelector('#fever-save-name, .fever-saved')).toBeNull();
        button(classic.node, 'Back to lobby')!.click();
        expect(classic.act.backToLobby).toHaveBeenCalled();
    });
});

describe('the game over of a Custom Fever game, on the laptop and the TV', () => {
    function bar(fever: GameOverView['fever'], confirmLeave: AdminState['confirmLeave'] = null) {
        const act = spies<AdminActions>();
        const state: AdminState = {
            pending: false,
            notice: null,
            confirmEnd: false,
            confirmStart: false,
            confirmLeave,
            feverName: { text: 'Custom Fever 13 Oct', start: 0, end: 0 },
            sound: { muted: false, volume: 1 },
        };
        const node = adminBar(
            hostView({ phase: 'GAME_OVER', round: null, players, gameOver: over(fever) }),
            state,
            act,
        );
        return { node, act };
    }

    it('the host controls can save the cards, and ask before leaving them unsaved', () => {
        const { node, act } = bar(UNSAVED);
        expect(node.querySelector<HTMLInputElement>('#admin-fever-name')?.value).toBe('Custom Fever 13 Oct');
        node.querySelector<HTMLButtonElement>('#admin-fever-save')!.click();
        expect(act.saveFever).toHaveBeenCalled();
        button(node, 'Play again')!.click();
        expect(act.askLeave).toHaveBeenCalledWith('playAgain');
        expect(bar(UNSAVED, 'backToLobby').node.textContent).toContain('These cards will be lost.');
        const saved = bar(SAVED);
        expect(saved.node.querySelector('#admin-fever-name')).toBeNull();
        button(saved.node, 'Back to lobby')!.click();
        expect(saved.act.backToLobby).toHaveBeenCalled();
    });

    it('the TV podium says which deck the cards became', () => {
        const view = hostView({ phase: 'GAME_OVER', round: null, players, gameOver: over(SAVED) });
        expect(tvGameOver(view, { kind: 'podium', cycle: 1 }).textContent).toContain('Saved as the deck “Party night”');
        const classic = hostView({ phase: 'GAME_OVER', round: null, players, gameOver: over(null) });
        expect(tvGameOver(classic, { kind: 'podium', cycle: 1 }).textContent).not.toContain('Saved as');
    });
});
