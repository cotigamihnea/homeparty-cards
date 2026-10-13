import { nextDeadline } from '../../src/server/engine/deadline.js';
import type { Action } from '../../src/server/engine/actions.js';
import { isBlankId } from '../../src/server/engine/blanks.js';
import { reduce } from '../../src/server/engine/reduce.js';
import { nextRandom } from '../../src/server/engine/rng.js';
import type { GameState } from '../../src/server/engine/state.js';
import { eligibleSubmitters } from '../../src/server/engine/submitters.js';
import { HOST, T0, lobbyWith, makeDeck } from './helpers.js';
import type { Settings } from '../../src/shared/settings.js';

/** "Make a haiku." for the Happy Ending (used only when the rule is on). */
const HAIKU = { id: 'haiku', pick: 3 };

/** Every house rule on, for the property checks. */
export const ALL_HOUSE_RULES: Partial<Settings> = {
    rebootTheUniverse: true,
    randoCardrissian: true,
    happyEnding: true,
    neverHaveIEver: true,
    blankCards: 2,
    autoPlay: true,
};

export interface RandomGameOptions {
    seed: number;
    steps: number;
    /** Chance per step of a disconnect / reconnect / kick / late join. */
    chaos: number;
    settings?: Partial<Settings>;
}

/** Plays a random but legal game and calls `visit` after every step. */
export function playRandomGame(
    options: RandomGameOptions,
    visit: (state: GameState, action: Action) => void,
): GameState {
    let rng = options.seed >>> 0;
    const random = () => {
        const [value, next] = nextRandom(rng);
        rng = next;
        return value;
    };
    const pickOne = <T>(items: readonly T[]): T | undefined => items[Math.floor(random() * items.length)];
    const playerCount = 3 + Math.floor(random() * 6);
    let state = lobbyWith(Array.from({ length: playerCount }, (_, i) => `Player ${i + 1}`));
    if (options.settings) state = reduce(state, { type: 'UPDATE_SETTINGS', by: HOST, settings: options.settings });
    let now = T0;
    let joined = playerCount;
    const run = (action: Action) => {
        state = reduce(state, action);
        visit(state, action);
    };
    const deck = makeDeck(
        400,
        Array.from({ length: 60 }, (_, i) => [1, 1, 1, 2, 3][i % 5]!),
    );
    run({ type: 'START_GAME', by: HOST, deck: { ...deck, haiku: HAIKU }, seed: options.seed, now });

    for (let step = 0; step < options.steps && state.phase !== 'GAME_OVER'; step++) {
        const roll = random();
        if (roll < options.chaos) {
            const connected = state.players.filter((p) => p.connected);
            const away = state.players.filter((p) => !p.connected);
            const kind = random();
            if (kind < 0.4 && connected.length > 0)
                run({ type: 'PLAYER_DISCONNECTED', playerId: pickOne(connected)!.id, now });
            else if (kind < 0.8 && away.length > 0)
                run({ type: 'PLAYER_RECONNECTED', playerId: pickOne(away)!.id, now });
            else if (kind < 0.9 && state.players.length > 3)
                run({ type: 'KICK_PLAYER', by: HOST, playerId: pickOne(state.players)!.id, now });
            else if (state.players.length < 12)
                run({ type: 'PLAYER_JOINED', playerId: `late${++joined}`, name: `Late ${joined}`, now });
            continue;
        }
        const round = state.round;
        const waiting =
            state.phase === 'SUBMITTING'
                ? eligibleSubmitters(state).filter((p) => !round?.pending.some((e) => e.playerId === p.id))
                : [];
        if (waiting.length > 0 && roll < 0.8) {
            const player = pickOne(waiting)!;
            if (roll < options.chaos + 0.06) {
                // House rules while answering (refused, so harmless, when off or used up).
                const card = pickOne(player.hand) ?? '';
                run(
                    random() < 0.5
                        ? { type: 'REBOOT_HAND', playerId: player.id, now }
                        : { type: 'DISCARD_CARD', playerId: player.id, cardId: card, now },
                );
                continue;
            }
            const pick = round?.black.pick ?? 1;
            const cards = [...player.hand].sort(() => random() - 0.5).slice(0, pick);
            const blanks = cards.filter(isBlankId).map((cardId) => ({ cardId, text: `Written in step ${step}` }));
            run({ type: 'SUBMIT_CARDS', playerId: player.id, cardIds: cards, blanks, now });
            continue;
        }
        if (state.phase === 'JUDGING' && round && !state.paused && now >= round.revealEndsAt && roll < 0.7) {
            const choice = pickOne(round.submissions);
            if (choice) {
                run({
                    type: random() < 0.3 ? 'CZAR_HIGHLIGHT' : 'CZAR_PICK',
                    playerId: round.czarId,
                    submissionId: choice.id,
                    now,
                } as Action);
                continue;
            }
        }
        const revealEnd = state.phase === 'JUDGING' ? (round?.revealEndsAt ?? 0) : 0;
        const deadline = nextDeadline(state);
        if (revealEnd > now)
            now = revealEnd; // let the reveal finish so the Czar gets to pick
        else now = deadline !== null && deadline > now ? deadline : now + 1_000;
        run({ type: 'TICK', now });
    }
    return state;
}
