import { describe, expect, it } from 'vitest';
import { soundCues } from '../../src/client/host/soundCues.js';
import { RANDO_ID } from '../../src/shared/constants.js';
import type { HostView } from '../../src/shared/views.js';
import { hostView, player } from './views.js';

const NOW = 100_000;
/** The cues of the game's moments (joins are listed in every phase, by design). */
const moments = (view: HostView, now = NOW) => soundCues(view, now).filter((cue) => cue.sound !== 'join');
const sounds = (view: HostView, now = NOW) => moments(view, now).map((cue) => cue.sound);
const keys = (view: HostView, now = NOW) => soundCues(view, now).map((cue) => cue.key);

const players = [player('ana'), player('bo', { hasSubmitted: true }), player('czar', { isCzar: true })];
const base = hostView({ players, game: 2 });
const round = base.round!;

describe('soundCues', () => {
    it('pops for every player at the table, once per player whatever the game', () => {
        const lobby = hostView({ phase: 'LOBBY', round: null, players: [player('ana'), player('bo')], game: 2 });
        expect(soundCues(lobby, NOW)).toEqual([
            { key: 'join-ana', sound: 'join' },
            { key: 'join-bo', sound: 'join' },
        ]);
        expect(keys({ ...lobby, game: 3 })).toEqual(keys(lobby));
    });

    it('ticks a card down for each player who has answered, keyed by game and round', () => {
        expect(soundCues(base, NOW)).toContainEqual({ key: 'g2-r1-answered-bo', sound: 'answered' });
        expect(keys(base).filter((key) => key.includes('answered'))).toHaveLength(1);
    });

    it('ticks the last five seconds of a running timer, once per second', () => {
        expect(sounds({ ...base, phaseEndsAt: NOW + 6_000 })).not.toContain('tick');
        expect(soundCues({ ...base, phaseEndsAt: NOW + 4_200 }, NOW)).toContainEqual({
            key: 'g2-r1-SUBMITTING-tick-5',
            sound: 'tick',
        });
        expect(keys({ ...base, phaseEndsAt: NOW + 400 })).toContain('g2-r1-SUBMITTING-tick-1');
        expect(sounds({ ...base, phaseEndsAt: NOW - 1 })).not.toContain('tick');
        expect(sounds({ ...base, phaseEndsAt: NOW + 3_000, paused: true })).not.toContain('tick');
    });

    it('shames a confession and powers up a reboot', () => {
        const talk = {
            ...base,
            round: {
                ...round,
                announcements: [
                    { kind: 'confession' as const, playerId: 'ana', text: 'x', at: 1 },
                    { kind: 'reboot' as const, playerId: 'bo', at: 2 },
                ],
            },
        };
        expect(soundCues(talk, NOW)).toEqual(
            expect.arrayContaining([
                { key: 'g2-r1-talk-0', sound: 'shame' },
                { key: 'g2-r1-talk-1', sound: 'reboot' },
            ]),
        );
    });

    it('deals each answer in with a swish while the TV reads them out, and only then', () => {
        const submissions = [1, 2, 3].map((n) => ({ id: `s${n}`, cards: [{ id: `w${n}`, text: 'a' }] }));
        const judging = {
            ...base,
            phase: 'JUDGING' as const,
            players: players.map((p) => ({ ...p, hasSubmitted: false })),
            judging: {
                submissions,
                revealStartedAt: NOW,
                revealEndsAt: NOW + 3_000,
                revealed: false,
                highlightedId: null,
            },
        };
        expect(moments(judging, NOW + 1_500)).toEqual([{ key: 'g2-r1-deal-1', sound: 'deal' }]);
        expect(sounds({ ...judging, judging: { ...judging.judging, revealed: true } }, NOW + 4_000)).toEqual([]);
    });

    it('celebrates a winner, shames a Rando win, and sighs at a skipped round', () => {
        const result = (winnerId: string) =>
            hostView({
                ...base,
                phase: 'ROUND_RESULT',
                players: [player('ana')],
                result: { kind: 'winner', winnerId, submissionId: 's1', submissions: [] },
            });
        expect(moments(result('ana'))).toEqual([{ key: 'g2-r1-result', sound: 'win' }]);
        expect(sounds(result(RANDO_ID))).toEqual(['shame']);
        const skipped = hostView({
            ...base,
            phase: 'ROUND_RESULT',
            players: [player('ana')],
            result: { kind: 'void', reason: 'CZAR_TIMEOUT' },
        });
        expect(sounds(skipped)).toEqual(['skipped']);
    });

    it('plays the finale when the game is over (a Rando win is a shame)', () => {
        const over = (winnerIds: string[]) =>
            hostView({
                ...base,
                phase: 'GAME_OVER',
                round: null,
                players: [player('ana')],
                gameOver: { winnerIds, standings: [], bestOf: [], fever: null },
            });
        expect(moments(over(['ana']))).toEqual([{ key: 'g2-over', sound: 'gameOver' }]);
        expect(sounds(over([RANDO_ID]))).toEqual(['shame']);
    });
});
