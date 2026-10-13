import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/server/engine/actions.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import { createInitialState, type GameState } from '../../src/server/engine/state.js';
import { toHostView, toPlayerView } from '../../src/server/engine/views.js';
import { feverCardsToSave, writtenBy } from '../../src/server/engine/writing.js';
import { DEFAULT_TIMING } from '../../src/shared/constants.js';
import type { CardColor } from '../../src/shared/customCards.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings.js';
import { HOST, NETWORK, T0, TEXTS, allWhiteCards, apply, as, expire, lobbyWith, makeDeck, seat } from './helpers.js';

const FEVER: Partial<Settings> = { gameMode: 'customFever', writingMinutes: 5 };
const TWELVE_BLACK = Array.from({ length: 12 }, () => 1);

function feverLobby(names = ['Ana', 'Bogdan', 'Cara'], settings: Partial<Settings> = {}): GameState {
    const lobby = lobbyWith(names, createInitialState(DEFAULT_SETTINGS, DEFAULT_TIMING));
    return reduce(lobby, { type: 'UPDATE_SETTINGS', by: HOST, settings: { ...FEVER, ...settings } });
}

const start = (state: GameState, deck = makeDeck(), seed = 7): Action => ({
    type: 'START_GAME',
    by: HOST,
    deck,
    seed,
    now: T0,
});

function writing(names?: string[], settings?: Partial<Settings>, deck = makeDeck()): GameState {
    const lobby = feverLobby(names, settings);
    return reduce(lobby, start(lobby, deck));
}

const writeCard = (playerId: string, color: CardColor, text: string, now = T0): Action => ({
    type: 'WRITE_CARD',
    playerId,
    color,
    text,
    now,
});

const write = (state: GameState, playerId: string, color: CardColor, text: string) =>
    reduce(state, writeCard(playerId, color, text));

/** Writes this player's whole quota. */
function writeAll(state: GameState, playerId: string): GameState {
    const quota = state.fever!.quota;
    let next = state;
    for (let i = 0; i < quota.white; i++) next = write(next, playerId, 'white', `${playerId} answer ${i}.`);
    for (let i = 0; i < quota.black; i++) next = write(next, playerId, 'black', `${playerId} prompt ${i}: _.`);
    return next;
}

const isWritten = (id: string) => id.startsWith('fever-');
const blackCount = (state: GameState) => state.blackDraw.length + state.blackDiscard.length + (state.round ? 1 : 0);

describe('starting Custom Fever', () => {
    it('opens the writing phase with the writing time, the quotas and a fresh game', () => {
        const state = writing();
        expect(state.phase).toBe('WRITING');
        expect(state.phaseEndsAt).toBe(T0 + 5 * 60_000);
        expect(state.round).toBeNull();
        expect(state.gameNumber).toBe(1);
        expect(state.fever?.quota).toEqual({ white: 13, black: 4 });
        expect(state.players.every((player) => player.score === 0 && player.hand.length === 0)).toBe(true);
        expect(writing(undefined, { writingMinutes: null }).phaseEndsAt).toBeNull();
    });

    it('needs packs that could fill every quota if nobody wrote anything', () => {
        const lobby = feverLobby();
        expect(checkAction(lobby, start(lobby, makeDeck(38, TWELVE_BLACK)))).toBe('NOT_ENOUGH_WHITE_CARDS');
        expect(checkAction(lobby, start(lobby, makeDeck(39, TWELVE_BLACK.slice(1))))).toBe('NOT_ENOUGH_BLACK_CARDS');
        expect(checkAction(lobby, start(lobby, makeDeck(39, TWELVE_BLACK)))).toBeNull();
        const classic = reduce(lobby, { type: 'UPDATE_SETTINGS', by: HOST, settings: { gameMode: 'classic' } });
        expect(checkAction(classic, start(classic, makeDeck(39, TWELVE_BLACK)))).toBe('NOT_ENOUGH_WHITE_CARDS');
    });

    it('the lobby shows the same deck problem before Start', () => {
        const lobby = feverLobby();
        const small = { ...TEXTS, deckSize: () => ({ white: 38, black: 12 }) };
        expect(toHostView(lobby, NETWORK, small, T0).deck.problem).toBe('NOT_ENOUGH_WHITE_CARDS');
    });
});

describe('writing cards', () => {
    it('keeps each card for its author: the others see only how many', () => {
        const state = write(write(writing(), 'p1', 'white', '  A stapler.  '), 'p1', 'black', 'Why _ and _?');
        const [white, black] = writtenBy(state, 'p1');
        expect(white).toMatch(/^fever-[0-9a-z]{8}$/);
        expect(toPlayerView(state, 'p1', TEXTS, T0)?.myWritten).toEqual([
            { id: white, color: 'white', text: 'A stapler.', pick: 1 },
            { id: black, color: 'black', text: 'Why _ and _?', pick: 2 },
        ]);
        const bogdan = toPlayerView(state, 'p2', TEXTS, T0)!;
        expect(bogdan.myWritten).toEqual([]);
        const tv = toHostView(state, NETWORK, TEXTS, T0);
        for (const json of [JSON.stringify(bogdan), JSON.stringify(tv)]) {
            expect(json).not.toContain('stapler');
            expect(json).not.toContain(white);
        }
        expect(tv.writing).toEqual({
            quota: { white: 13, black: 4 },
            progress: [
                { playerId: 'p1', white: 1, black: 1, done: false },
                { playerId: 'p2', white: 0, black: 0, done: false },
                { playerId: 'p3', white: 0, black: 0, done: false },
            ],
        });
    });

    it('checks every card: text rules, own duplicates, the quota and the phase', () => {
        const state = write(writing(), 'p1', 'white', 'A stapler.');
        expect(checkAction(state, writeCard('p1', 'black', '_ _ _ _'))).toBe('CARD_TOO_MANY_BLANKS');
        expect(checkAction(state, writeCard('p1', 'white', ' '))).toBe('CARD_EMPTY');
        expect(checkAction(state, writeCard('p1', 'white', 'x'.repeat(81)))).toBe('CARD_TOO_LONG');
        expect(checkAction(state, writeCard('p1', 'white', 'a stapler'))).toBe('CARD_DUPLICATE');
        expect(checkAction(state, writeCard('p2', 'white', 'A stapler.'))).toBeNull();
        expect(checkAction(state, writeCard('nobody', 'white', 'A.'))).toBe('UNKNOWN_PLAYER');
        let full = state;
        for (let i = 1; i < 13; i++) full = write(full, 'p1', 'white', `Card ${i}.`);
        expect(writtenBy(full, 'p1')).toHaveLength(13);
        expect(checkAction(full, writeCard('p1', 'white', 'One too many.'))).toBe('QUOTA_FULL');
        expect(checkAction(full, writeCard('p1', 'black', 'Still room for _.'))).toBeNull();
        expect(checkAction(feverLobby(), writeCard('p1', 'white', 'A.'))).toBe('WRONG_PHASE');
    });

    it('lets only the author edit or remove a card, and a removed card frees its place', () => {
        let state = write(write(writing(), 'p1', 'white', 'A stapler.'), 'p1', 'white', 'Free cake.');
        const [stapler, cake] = writtenBy(state, 'p1');
        const edit = (playerId: string, cardId: string, text: string): Action => ({
            type: 'EDIT_WRITTEN_CARD',
            playerId,
            cardId,
            text,
        });
        expect(checkAction(state, edit('p2', stapler!, 'Mine now.'))).toBe('NOT_YOUR_CARD');
        expect(checkAction(state, edit('p1', 'fever-unknown1', 'X.'))).toBe('NOT_YOUR_CARD');
        expect(checkAction(state, edit('p1', stapler!, 'free cake'))).toBe('CARD_DUPLICATE');
        expect(checkAction(state, edit('p1', stapler!, ''))).toBe('CARD_EMPTY');
        state = reduce(state, edit('p1', stapler!, 'A stapler with feelings.'));
        expect(toPlayerView(state, 'p1', TEXTS, T0)?.myWritten[0]?.text).toBe('A stapler with feelings.');

        const remove = (playerId: string, cardId: string): Action => ({
            type: 'REMOVE_WRITTEN_CARD',
            playerId,
            cardId,
        });
        expect(checkAction(state, remove('p2', cake!))).toBe('NOT_YOUR_CARD');
        state = reduce(state, remove('p1', cake!));
        expect(writtenBy(state, 'p1')).toEqual([stapler]);
        expect(toHostView(state, NETWORK, TEXTS, T0).writing?.progress[0]).toMatchObject({ white: 1 });
    });
});

describe('the end of writing', () => {
    it('comes as soon as every connected player is done, and the game is dealt from their cards', () => {
        const state = ['p1', 'p2', 'p3'].reduce(writeAll, writing());
        expect(state.phase).toBe('ROUND_START');
        expect(state.round?.number).toBe(1);
        expect(isWritten(state.round!.black.id)).toBe(true);
        for (const player of state.players) {
            expect(player.hand).toHaveLength(10);
            expect(player.hand.every(isWritten)).toBe(true);
        }
        expect(allWhiteCards(state)).toHaveLength(39);
        expect(toHostView(state, NETWORK, TEXTS, T0).round?.black.text).toMatch(/^p\d prompt \d: _\.$/);
        expect(toPlayerView(state, 'p1', TEXTS, T0)?.hand[0]?.text).toMatch(/^p\d answer \d+\.$/);
    });

    it('does not wait for a player whose phone is away; their missing cards come from the packs', () => {
        let state = writing(['Ana', 'Bogdan', 'Cara', 'Dan']);
        expect(state.fever?.quota).toEqual({ white: 13, black: 3 });
        state = apply(state, { type: 'PLAYER_DISCONNECTED', playerId: 'p4', now: T0 });
        state = ['p1', 'p2', 'p3'].reduce(writeAll, state);
        expect(state.phase).toBe('ROUND_START');
        expect(allWhiteCards(state)).toHaveLength(4 * 13);
        expect(allWhiteCards(state).filter((id) => !isWritten(id))).toHaveLength(13);
        expect(blackCount(state)).toBe(4 * 3);
    });

    it('waits while the game is paused, even when everyone still here is done', () => {
        let state = apply(writing(), { type: 'PLAYER_DISCONNECTED', playerId: 'p3', now: T0 });
        expect(state.paused).toBe(true);
        state = ['p1', 'p2'].reduce(writeAll, state);
        expect(state.phase).toBe('WRITING');
    });

    it('comes when the time is up, filling every missing card from the packs', () => {
        let state = write(write(writing(), 'p1', 'white', 'A stapler.'), 'p2', 'black', 'Why _?');
        state = expire(state);
        expect(state.phase).toBe('ROUND_START');
        expect(allWhiteCards(state)).toHaveLength(3 * 13);
        expect(allWhiteCards(state).filter(isWritten)).toHaveLength(1);
        expect(blackCount(state)).toBe(3 * 4);
    });

    it('freezes the writing time in a pause and gives it back afterwards', () => {
        let state = apply(writing(), { type: 'PLAYER_DISCONNECTED', playerId: 'p3', now: T0 + 1_000 });
        state = reduce(state, { type: 'TICK', now: T0 + 400_000 });
        expect(state.phase).toBe('WRITING');
        state = reduce(state, { type: 'PLAYER_RECONNECTED', playerId: 'p3', now: T0 + 500_000 });
        expect(state.paused).toBe(false);
        expect(state.phaseEndsAt).toBe(T0 + 500_000 + 299_000);
    });

    it('comes when the VIP or the laptop says Start now', () => {
        const state = write(writing(), 'p1', 'white', 'A stapler.');
        const startNow = (by = HOST): Action => ({ type: 'START_NOW', by, now: T0 + 10 });
        expect(checkAction(state, startNow(as('p2')))).toBe('NOT_VIP');
        expect(checkAction(feverLobby(), startNow())).toBe('WRONG_PHASE');
        expect(reduce(state, startNow(as('p1'))).phase).toBe('ROUND_START');
        expect(allWhiteCards(reduce(state, startNow())).filter(isWritten)).toHaveLength(1);
    });

    it('gives a player who joins while writing is open the same quota, and fills it if they write nothing', () => {
        let state = apply(writing(), { type: 'PLAYER_JOINED', playerId: 'p4', name: 'Dan', now: T0 });
        state = writeAll(state, 'p4');
        expect(writtenBy(state, 'p4')).toHaveLength(17);
        expect(checkAction(state, writeCard('p4', 'white', 'Over the top.'))).toBe('QUOTA_FULL');
        const joined = apply(writing(), { type: 'PLAYER_JOINED', playerId: 'p4', name: 'Dan', now: T0 });
        const started = reduce(joined, { type: 'START_NOW', by: HOST, now: T0 });
        expect(allWhiteCards(started)).toHaveLength(4 * 13);
        expect(seat(started, 'p4').hand).toHaveLength(10);
    });

    it("keeps a kicked player's cards in the deck, and fills nothing for them", () => {
        let state = writing(['Ana', 'Bogdan', 'Cara', 'Dan']);
        state = write(write(state, 'p2', 'white', 'Bo one.'), 'p2', 'white', 'Bo two.');
        const boCards = writtenBy(state, 'p2');
        state = apply(state, { type: 'KICK_PLAYER', by: HOST, playerId: 'p2', now: T0 });
        state = reduce(state, { type: 'START_NOW', by: HOST, now: T0 });
        expect(allWhiteCards(state)).toEqual(expect.arrayContaining(boCards));
        expect(allWhiteCards(state)).toHaveLength(3 * 13 + 2);
    });

    it('still starts when the packs run short after players joined during writing', () => {
        let state = writing(undefined, {}, makeDeck(39, TWELVE_BLACK));
        state = apply(
            state,
            { type: 'PLAYER_JOINED', playerId: 'p4', name: 'Dan', now: T0 },
            { type: 'PLAYER_JOINED', playerId: 'p5', name: 'Eli', now: T0 },
            { type: 'START_NOW', by: HOST, now: T0 },
        );
        expect(state.phase).toBe('ROUND_START');
        expect(allWhiteCards(state)).toHaveLength(39);
        expect(blackCount(state)).toBe(12);
    });

    it('keeps the Happy Ending haiku out of the fillers, for the end', () => {
        const haiku = { id: 'haiku', pick: 3 };
        const state = reduce(writing(undefined, { happyEnding: true }, { ...makeDeck(), haiku }), {
            type: 'START_NOW',
            by: HOST,
            now: T0,
        });
        expect(state.haiku).toEqual(haiku);
        expect(state.blackDraw.some((card) => card.id === 'haiku')).toBe(false);
    });
});

describe('after writing', () => {
    it('forgets who wrote what, and drops the leftover pack cards', () => {
        const state = reduce(write(writing(), 'p1', 'white', 'A.'), { type: 'START_NOW', by: HOST, now: T0 });
        expect(state.fever?.authors).toBeNull();
        expect(state.fever?.fillers).toBeNull();
        expect(Object.values(state.fever!.cards)).toEqual([{ color: 'white', text: 'A.', pick: 1 }]);
    });

    it('keeps the written cards in an order that has nothing to do with who wrote them, or when', () => {
        let state = writing();
        const order = ['p1', 'p2', 'p1', 'p3', 'p2', 'p3', 'p3', 'p3'];
        order.forEach((playerId, i) => (state = write(state, playerId, 'white', `${playerId} card ${i}.`)));
        const written = Object.keys(state.fever!.cards);
        for (const finish of [
            reduce(state, { type: 'START_NOW', by: HOST, now: T0 }),
            apply(state, { type: 'END_GAME', by: HOST, now: T0 }),
        ]) {
            const kept = Object.keys(finish.fever!.cards);
            expect(kept).toEqual([...written].sort());
            expect(feverCardsToSave(finish).white).toEqual(kept.map((cardId) => finish.fever!.cards[cardId]!.text));
        }
        expect([...written].sort()).not.toEqual(written);
    });

    it('End game while writing goes to the game over, where the written cards can be saved', () => {
        const state = apply(write(write(writing(), 'p1', 'white', 'A.'), 'p2', 'black', 'Why _?'), {
            type: 'END_GAME',
            by: HOST,
            now: T0,
        });
        expect(state.phase).toBe('GAME_OVER');
        expect(state.fever?.authors).toBeNull();
        expect(toHostView(state, NETWORK, TEXTS, T0).gameOver?.fever).toEqual({ white: 1, black: 1, savedAs: null });
    });

    it('Back to lobby drops the cards; Play again starts writing afresh', () => {
        const over = apply(write(writing(), 'p1', 'white', 'A.'), { type: 'END_GAME', by: HOST, now: T0 });
        expect(reduce(over, { type: 'BACK_TO_LOBBY', by: HOST }).fever).toBeNull();
        const again = reduce(over, { type: 'PLAY_AGAIN', by: HOST, deck: makeDeck(), seed: 8, now: T0 + 5 });
        expect(again.phase).toBe('WRITING');
        expect(again.fever?.cards).toEqual({});
        expect(again.gameNumber).toBe(2);
    });

    it('a classic game has no fever at all', () => {
        const lobby = lobbyWith(['Ana', 'Bogdan', 'Cara']);
        const classic = reduce(lobby, start(lobby));
        expect(classic.fever).toBeNull();
        expect(toHostView(classic, NETWORK, TEXTS, T0).writing).toBeNull();
    });
});

describe('saving the written cards', () => {
    const over = () =>
        apply(write(write(write(writing(), 'p1', 'white', 'Bees.'), 'p2', 'white', 'bees'), 'p3', 'black', 'Why _?'), {
            type: 'END_GAME',
            by: HOST,
            now: T0,
        });

    it('gives the written cards only, each once', () => {
        const saved = feverCardsToSave(over());
        // "Bees." and "bees" are one card; which spelling stays depends on the random card order.
        expect(saved.white).toHaveLength(1);
        expect(['Bees.', 'bees']).toContain(saved.white[0]);
        expect(saved.black).toEqual([{ text: 'Why _?', pick: 1 }]);
        const played = reduce(write(writing(), 'p1', 'white', 'Mine.'), { type: 'START_NOW', by: HOST, now: T0 });
        expect(feverCardsToSave(played)).toEqual({ white: ['Mine.'], black: [] });
    });

    it('is marked once, by the VIP or the laptop, at the game over of a Custom Fever game', () => {
        const saved = reduce(over(), { type: 'FEVER_SAVED', by: HOST, name: 'Party night' });
        expect(toHostView(saved, NETWORK, TEXTS, T0).gameOver?.fever?.savedAs).toBe('Party night');
        expect(checkAction(saved, { type: 'FEVER_SAVED', by: HOST, name: 'Again' })).toBe('ALREADY_SAVED');
        expect(checkAction(over(), { type: 'FEVER_SAVED', by: as('p2'), name: 'X' })).toBe('NOT_VIP');
        expect(checkAction(writing(), { type: 'FEVER_SAVED', by: HOST, name: 'X' })).toBe('WRONG_PHASE');
        const lobby = lobbyWith(['Ana', 'Bogdan', 'Cara']);
        const classicOver = apply(reduce(lobby, start(lobby)), { type: 'END_GAME', by: HOST, now: T0 });
        expect(checkAction(classicOver, { type: 'FEVER_SAVED', by: HOST, name: 'X' })).toBe('WRONG_PHASE');
    });
});
