import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/server/engine/reduce.js';
import { nextRandom } from '../../src/server/engine/rng.js';
import { createInitialState, type GameState } from '../../src/server/engine/state.js';
import { writtenBy } from '../../src/server/engine/writing.js';
import { toHostView, toPlayerView, type CardLookup } from '../../src/server/engine/views.js';
import { HOST, NETWORK, T0, makeDeck } from './helpers.js';
import { ALL_HOUSE_RULES, playRandomGame } from './randomGame.js';

const texts: CardLookup = {
    whiteText: (id) => `#${id}#`,
    blackText: (id) => `#${id}#`,
    deckSize: () => ({ white: 500, black: 50 }),
    catalogVersion: () => 0,
};

/** Card ids that appear as values in a view: deck cards and blank cards. */
function cardIdsIn(json: string): Set<string> {
    return new Set([...json.matchAll(/"(w\d+|blank-[0-9a-z]{8})"/g)].map((match) => match[1]!));
}

function submissionObjects(value: unknown, found: object[] = []): object[] {
    if (Array.isArray(value)) value.forEach((item) => submissionObjects(item, found));
    else if (value && typeof value === 'object') {
        if ('cards' in value && 'id' in value) found.push(value);
        Object.values(value).forEach((child) => submissionObjects(child, found));
    }
    return found;
}

function checkViews(state: GameState): void {
    const host = JSON.stringify(toHostView(state, NETWORK, texts, 0));
    const allHandCards = new Set(state.players.flatMap((p) => p.hand));
    const beforeResult = state.phase === 'SUBMITTING' || state.phase === 'JUDGING';

    for (const id of cardIdsIn(host)) expect(allHandCards.has(id), `TV shows hand card ${id}`).toBe(false);
    if (beforeResult) expect(host).not.toContain('authorId');

    for (const viewer of state.players) {
        const view = toPlayerView(state, viewer.id, texts, 0)!;
        const json = JSON.stringify(view);
        const othersHands = new Set(state.players.filter((p) => p.id !== viewer.id).flatMap((p) => p.hand));
        for (const id of cardIdsIn(json))
            expect(othersHands.has(id), `${viewer.id} sees another hand's ${id}`).toBe(false);
        if (beforeResult) {
            expect(json).not.toContain('authorId');
            for (const submission of submissionObjects(view))
                expect(Object.keys(submission).sort()).toEqual(['cards', 'id']);
        }
        if (state.phase === 'JUDGING' && viewer.id !== state.round?.czarId) expect(view.judging).toBeNull();
    }

    // Ids are random, never derived from players. (Test ids like "p1" are too short to rule out by chance.)
    for (const submission of state.round?.submissions ?? []) {
        const derived = state.players.some(
            (p) => submission.id === p.id || (p.id.length >= 4 && submission.id.includes(p.id)),
        );
        expect(derived, `submission id ${submission.id} looks derived from a player id`).toBe(false);
    }
}

describe('hidden information over random games', () => {
    it.each(Array.from({ length: 40 }, (_, i) => i + 1))('seed %i: no view leaks a hand or an author', (seed) => {
        playRandomGame({ seed, steps: 250, chaos: 0.08 }, (state) => checkViews(state));
    });

    it.each(Array.from({ length: 30 }, (_, i) => 300 + i))(
        'seed %i with every house rule on: no view leaks a hand, an author or a blank card',
        (seed) => {
            playRandomGame({ seed, steps: 250, chaos: 0.08, settings: ALL_HOUSE_RULES }, (state) => checkViews(state));
        },
    );
});

describe('hidden information while Custom Fever cards are written', () => {
    const PLAYERS = ['seat-ana', 'seat-bogdan', 'seat-cara'];

    /** A seeded walk of writes, edits and removals by three players; every text names its author and number. */
    function writingWalk(seed: number, check: (state: GameState, texts: Map<string, string>) => void): GameState {
        let state = PLAYERS.reduce(
            (lobby, playerId, i) => reduce(lobby, { type: 'PLAYER_JOINED', playerId, name: `P${i}`, now: T0 }),
            createInitialState(),
        );
        state = reduce(state, { type: 'UPDATE_SETTINGS', by: HOST, settings: { gameMode: 'customFever' } });
        state = reduce(state, { type: 'START_GAME', by: HOST, deck: makeDeck(), seed, now: T0 });
        let rng = seed;
        const random = (n: number) => {
            const [value, next] = nextRandom(rng);
            rng = next;
            return Math.floor(value * n);
        };
        const authorOf = new Map<string, string>();
        for (let step = 0; step < 60 && state.phase === 'WRITING'; step++) {
            const playerId = PLAYERS[random(PLAYERS.length)]!;
            const own = writtenBy(state, playerId);
            const move = random(10);
            if (move < 7 || own.length === 0) {
                const color = random(4) === 0 ? 'black' : 'white';
                state = reduce(state, {
                    type: 'WRITE_CARD',
                    playerId,
                    color,
                    text: `${playerId} card ${step} _`,
                    now: T0,
                });
            } else if (move < 9) {
                const cardId = own[random(own.length)]!;
                state = reduce(state, {
                    type: 'EDIT_WRITTEN_CARD',
                    playerId,
                    cardId,
                    text: `${playerId} edit ${step}`,
                });
            } else {
                state = reduce(state, { type: 'REMOVE_WRITTEN_CARD', playerId, cardId: own[random(own.length)]! });
            }
            for (const id of PLAYERS) for (const cardId of writtenBy(state, id)) authorOf.set(cardId, id);
            check(state, authorOf);
        }
        return reduce(state, { type: 'START_NOW', by: HOST, now: T0 + 1 });
    }

    it.each(Array.from({ length: 50 }, (_, i) => 700 + i))(
        'seed %i: only the author sees a card; nothing links cards to players afterwards',
        (seed) => {
            const after = writingWalk(seed, (state) => {
                const tv = JSON.stringify(toHostView(state, NETWORK, texts, 0));
                expect(tv).not.toMatch(/seat-\w+ (card|edit)/);
                for (const viewer of PLAYERS) {
                    const json = JSON.stringify(toPlayerView(state, viewer, texts, 0));
                    for (const other of PLAYERS.filter((id) => id !== viewer)) {
                        expect(json, `${viewer} sees ${other}'s card`).not.toContain(`${other} card`);
                        expect(json, `${viewer} sees ${other}'s edit`).not.toContain(`${other} edit`);
                    }
                }
                expect(tv).not.toContain('authors');
            });
            expect(after.fever?.authors).toBeNull();
            const cards = JSON.stringify(after.fever);
            for (const playerId of PLAYERS) expect(cards).not.toContain(`"${playerId}"`);
            for (const cardId of Object.keys(after.fever!.cards)) {
                expect(PLAYERS.some((playerId) => cardId.includes(playerId))).toBe(false);
            }
        },
    );
});
