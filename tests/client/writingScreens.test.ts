// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { adminBar, type AdminActions, type AdminState } from '../../src/client/host/adminBar.js';
import { soundCues } from '../../src/client/host/soundCues.js';
import { writingScreen as tvWritingScreen } from '../../src/client/host/writingScreen.js';
import { createFeverWriter, type FeverWriterActions } from '../../src/client/phone/feverWriter.js';
import { phoneScreen } from '../../src/client/phone/play.js';
import { writingScreen } from '../../src/client/phone/writingScreen.js';
import { emptyDraft } from '../../src/client/ui/decks/cardWriter.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import type { Commands, GameSocket } from '../../src/client/ui/socket.js';
import type { WritingView, WrittenCardView } from '../../src/shared/views.js';
import { phoneContext } from './phoneContext.js';
import { hostView, player, playerView } from './views.js';

setLanguage('en');

const QUOTA = { white: 2, black: 1 };
const players = [
    player('me', { name: 'Ana', isVip: true }),
    player('bo', { name: 'Bo' }),
    player('cy', { name: 'Cy' }),
];
const writing = (progress: Partial<Record<string, [number, number]>> = {}): WritingView => ({
    quota: QUOTA,
    progress: players.map((p) => {
        const [white, black] = progress[p.id] ?? [0, 0];
        return { playerId: p.id, white, black, done: white >= QUOTA.white && black >= QUOTA.black };
    }),
});
const card = (id: string, color: 'white' | 'black', text: string): WrittenCardView => ({
    id,
    color,
    text,
    pick: 1,
});

function phone(myWritten: WrittenCardView[], progress = writing(), options: { vip?: boolean; confirm?: boolean } = {}) {
    const mine: [number, number] = [
        myWritten.filter((c) => c.color === 'white').length,
        myWritten.filter((c) => c.color === 'black').length,
    ];
    const view = playerView({
        phase: 'WRITING',
        round: null,
        players: players.map((p) => (p.id === 'me' ? { ...p, isVip: options.vip ?? true } : p)),
        writing: {
            ...progress,
            progress: progress.progress.map((p) =>
                p.playerId === 'me' ? { ...p, white: mine[0], black: mine[1], done: mine[0] >= 2 && mine[1] >= 1 } : p,
            ),
        },
        myWritten,
    });
    const act = new Proxy(
        {},
        { get: (t: Record<string, unknown>, k: string) => (t[k] ??= vi.fn()) },
    ) as unknown as FeverWriterActions;
    const state = { tab: 'white' as const, card: emptyDraft(), editing: null, confirmStart: options.confirm ?? false };
    const node = writingScreen(view, phoneContext(), { state, pending: false, act });
    document.body.replaceChildren(node);
    return { node, act };
}

describe('the phone while everyone writes', () => {
    it('is its own screen', () => {
        expect(phoneScreen(playerView({ phase: 'WRITING', round: null }), false)).toBe('writing');
    });

    it('shows how far this player is, and the box for the tab they are on', () => {
        const { node } = phone([card('f1', 'white', 'A stapler.')]);
        expect(node.querySelector('#fever-progress')?.textContent).toBe('1 of 2 white, 0 of 1 black');
        expect(node.querySelector('#fever-tab-white')?.textContent).toBe('White cards');
        expect(node.querySelector('#fever-card-text')).not.toBeNull();
        expect(node.querySelector('.deck-card-text')?.textContent).toBe('A stapler.');
    });

    it('swaps the box for a line once a colour is done, and says so when everything is', () => {
        const white = [card('f1', 'white', 'A.'), card('f2', 'white', 'B.')];
        const { node } = phone(white);
        expect(node.querySelector('#fever-card-text')).toBeNull();
        expect(node.querySelector('#fever-full')?.textContent).toBe('All 2 white cards are written.');
        expect(node.querySelector('.fever-done')).toBeNull();
        const all = phone([...white, card('f3', 'black', 'Why _?')]).node;
        expect(all.querySelector('.fever-done')?.textContent).toContain("You're done!");
    });

    it('renders what was written as text', () => {
        const { node } = phone([card('f1', 'white', '<b>bold</b>')]);
        expect(node.querySelector('.deck-card-text b')).toBeNull();
        expect(node.querySelector('.deck-card-text')?.textContent).toBe('<b>bold</b>');
    });

    it('gives the VIP Start now, and asks first while someone here is still writing', () => {
        const { node, act } = phone([]);
        node.querySelector<HTMLButtonElement>('#fever-start-now')!.click();
        expect(act.askStart).toHaveBeenCalledWith(true);
        const asking = phone([], writing(), { confirm: true }).node;
        expect(asking.textContent).toContain(
            "3 players haven't finished. Their missing cards will come from the packs.",
        );
        expect(phone([], writing(), { vip: false }).node.querySelector('#fever-start-now')).toBeNull();
    });

    it('starts at once when everyone else is done', () => {
        const others = writing({ bo: [2, 1], cy: [2, 1] });
        const { node, act } = phone(
            [card('a', 'white', 'A.'), card('b', 'white', 'B.'), card('c', 'black', 'C _.')],
            others,
        );
        node.querySelector<HTMLButtonElement>('#fever-start-now')!.click();
        expect(act.startNow).toHaveBeenCalled();
    });
});

describe('the fever writer', () => {
    function writer(written: WrittenCardView[]) {
        const sent: [string, unknown][] = [];
        const timed = {
            emit(event: string, payload: unknown, callback?: (error: Error | null, response: unknown) => void) {
                const done = typeof payload === 'function' ? payload : callback;
                sent.push([event, typeof payload === 'function' ? undefined : payload]);
                (done as (error: Error | null, response: unknown) => void)(null, { ok: true });
            },
        };
        const commands = {
            send(emit, onOk) {
                emit(timed as never, (error, response) => {
                    if (!error && response.ok) onOk?.();
                });
            },
            admin(event) {
                sent.push([event, undefined]);
            },
        } satisfies Commands;
        return {
            writer: createFeverWriter(
                {} as GameSocket,
                commands,
                () => {},
                () => written,
            ),
            sent,
        };
    }

    it('sends a new card of the tab it is on, and clears the box', () => {
        const { writer: w, sent } = writer([]);
        w.act.setTab('black');
        w.act.setDraft('card', { text: 'Why _?', start: 6, end: 6 });
        w.act.addCard();
        expect(sent).toEqual([['writeCard', { color: 'black', text: 'Why _?' }]]);
        expect(w.state.card.text).toBe('');
    });

    it('edits and removes a card by its id, found from its text', () => {
        const { writer: w, sent } = writer([card('fever-1', 'white', 'A.'), card('fever-2', 'black', 'A.')]);
        w.act.removeCard('black', 'A.');
        w.act.startEdit('white', 'A.');
        w.act.setDraft('edit', { text: 'B.', start: 2, end: 2 });
        w.act.saveEdit();
        expect(sent).toEqual([
            ['removeWrittenCard', { cardId: 'fever-2' }],
            ['editWrittenCard', { cardId: 'fever-1', text: 'B.' }],
        ]);
    });

    it('Start now goes to the server and closes the question', () => {
        const { writer: w, sent } = writer([]);
        w.act.askStart(true);
        expect(w.state.confirmStart).toBe(true);
        w.act.startNow();
        expect(sent).toEqual([['startNow', undefined]]);
        expect(w.state.confirmStart).toBe(false);
    });
});

describe('the TV while everyone writes', () => {
    const view = (progress: Partial<Record<string, [number, number]>>, phaseEndsAt: number | null = 300_000) =>
        hostView({ phase: 'WRITING', round: null, players, writing: writing(progress), phaseEndsAt });

    it('shows each player with how many cards they have written, and who is done, never what', () => {
        const node = tvWritingScreen(view({ me: [1, 0], bo: [2, 1] }), 0, null);
        const tiles = [...node.querySelectorAll('.tv-player')];
        expect(tiles.map((tile) => tile.querySelector('.tv-player-status')?.textContent)).toEqual([
            '1 of 3 cards',
            'Done',
            '0 of 3 cards',
        ]);
        expect(tiles[1]!.classList.contains('has-answered')).toBe(true);
        expect(node.querySelector('.tv-answered')?.textContent).toBe('1 of 3 done');
        expect(node.querySelector('.card-black')?.textContent).toContain('deck is written by');
    });

    it('says when there is no time limit', () => {
        expect(tvWritingScreen(view({}, null), 0, null).textContent).toContain(
            'The game starts when everyone is done.',
        );
        expect(tvWritingScreen(view({}), 0, null).textContent).toContain('or when the time is up');
    });
});

describe('the laptop while everyone writes', () => {
    function bar(confirmStart: boolean, progress: Partial<Record<string, [number, number]>> = {}) {
        const act = new Proxy(
            {},
            { get: (t: Record<string, unknown>, k: string) => (t[k] ??= vi.fn()) },
        ) as unknown as AdminActions;
        const state: AdminState = {
            pending: false,
            notice: null,
            confirmEnd: false,
            confirmStart,
            confirmLeave: null,
            feverName: null,
            sound: { muted: false, volume: 1 },
        };
        const node = adminBar(
            hostView({ phase: 'WRITING', round: null, players, writing: writing(progress) }),
            state,
            act,
        );
        return { node, act };
    }

    it('offers Start now (asking first while someone is writing) and End game', () => {
        const { node, act } = bar(false);
        const names = [...node.querySelectorAll('button')].map((button) => button.textContent);
        expect(names).toEqual(expect.arrayContaining(['Start now', 'End game']));
        [...node.querySelectorAll('button')].find((b) => b.textContent === 'Start now')!.click();
        expect(act.askStartNow).toHaveBeenCalledWith(true);
        expect(bar(true).node.textContent).toContain("3 players haven't finished.");
    });
});

describe('the sound of writing', () => {
    it('clicks when a player finishes, and ticks the last seconds of the writing time', () => {
        const done = hostView({
            phase: 'WRITING',
            round: null,
            players,
            game: 2,
            writing: writing({ bo: [2, 1] }),
            phaseEndsAt: 4_000,
        });
        expect(soundCues(done, 0)).toEqual(
            expect.arrayContaining([
                { key: 'g2-writing-done-bo', sound: 'answered' },
                { key: 'g2-r0-WRITING-tick-4', sound: 'tick' },
            ]),
        );
    });
});

describe('typing the next card while one is on its way', () => {
    function held() {
        const answers: ((response: unknown) => void)[] = [];
        const timed = {
            emit(_event: string, _payload: unknown, callback: (error: Error | null, response: unknown) => void) {
                answers.push((response) => callback(null, response));
            },
        };
        const commands = {
            send(emit, onOk) {
                emit(timed as never, (error, response) => {
                    if (!error && response.ok) onOk?.();
                });
            },
            admin() {},
        } satisfies Commands;
        return { commands, answers };
    }

    it('keeps what was typed after Add when the answer comes back', () => {
        const { commands, answers } = held();
        const w = createFeverWriter(
            {} as GameSocket,
            commands,
            () => {},
            () => [],
        );
        w.act.setDraft('card', { text: 'First.', start: 6, end: 6 });
        w.act.addCard();
        expect(w.state.card.text).toBe('');
        w.act.setDraft('card', { text: 'Sec', start: 3, end: 3 });
        answers[0]!({ ok: true });
        expect(w.state.card.text).toBe('Sec');
    });

    it('gives a refused card back to the box, unless something new was typed meanwhile', () => {
        const { commands, answers } = held();
        const w = createFeverWriter(
            {} as GameSocket,
            commands,
            () => {},
            () => [],
        );
        w.act.setDraft('card', { text: 'Too many.', start: 9, end: 9 });
        w.act.addCard();
        answers[0]!({ ok: false, reason: 'QUOTA_FULL' });
        expect(w.state.card.text).toBe('Too many.');
        w.act.addCard();
        w.act.setDraft('card', { text: 'New', start: 3, end: 3 });
        answers[1]!({ ok: false, reason: 'QUOTA_FULL' });
        expect(w.state.card.text).toBe('New');
    });
});
