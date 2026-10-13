import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/server/engine/reduce.js';
import { checkAction } from '../../src/server/engine/rules.js';
import type { GameState } from '../../src/server/engine/state.js';
import { toHostView } from '../../src/server/engine/views.js';
import type { Settings } from '../../src/shared/settings.js';
import { NETWORK, T0, TEXTS, expire, playRound, seat, startedGame, submitFirst, withScores } from './helpers.js';

const REBOOT = { rebootTheUniverse: true } satisfies Partial<Settings>;

/** Round 2 is open for answers; Cara (p3) won round 1, so she has a point. The Czar is Bogdan (p2). */
function secondRound(settings: Partial<Settings> = REBOOT): GameState {
    return expire(expire(playRound(startedGame({ settings }), 'p3')));
}

const reboot = (playerId: string, now = T0 + 50_000) => ({ type: 'REBOOT_HAND' as const, playerId, now });

describe('Rebooting the Universe', () => {
    it('is refused while the house rule is off', () => {
        expect(checkAction(secondRound({}), reboot('p3'))).toBe('RULE_OFF');
    });

    it('is only for players answering this round, with a point to spend, once a round', () => {
        const round = secondRound();
        expect(round.phase).toBe('SUBMITTING');
        expect(round.round?.czarId).toBe('p2');
        expect(checkAction(expire(playRound(startedGame({ settings: REBOOT }), 'p3')), reboot('p3'))).toBe(
            'WRONG_PHASE',
        );
        expect(checkAction(round, reboot('p2'))).toBe('CZAR_CANNOT_SUBMIT');
        expect(checkAction(round, reboot('p4'))).toBe('NO_POINTS');
        expect(checkAction(round, reboot('ghost'))).toBe('UNKNOWN_PLAYER');
        const late = reduce(round, { type: 'PLAYER_JOINED', playerId: 'p9', name: 'Late', now: T0 });
        expect(checkAction(late, reboot('p9'))).toBe('NOT_IN_ROUND');

        const rich = withScores(round, { p3: 3 });
        const once = reduce(rich, reboot('p3'));
        expect(checkAction(once, reboot('p3'))).toBe('ALREADY_USED');
    });

    it('costs a point and swaps every card in the hand for new ones, discarding the old ones', () => {
        const before = secondRound();
        const oldHand = seat(before, 'p3').hand;
        const after = reduce(before, reboot('p3', T0 + 51_000));
        const player = seat(after, 'p3');
        expect(player.score).toBe(0);
        expect(player.hand).toHaveLength(oldHand.length);
        expect(player.hand.filter((id) => oldHand.includes(id))).toEqual([]);
        expect(after.whiteDiscard.slice(-oldHand.length)).toEqual(oldHand);
        expect(after.round?.announcements).toEqual([{ kind: 'reboot', playerId: 'p3', at: T0 + 51_000 }]);
    });

    it('leaves an answer already sent where it is', () => {
        const sent = submitFirst(secondRound(), 'p3');
        const answer = sent.round!.pending.find((entry) => entry.playerId === 'p3')!.cardIds;
        const after = reduce(sent, reboot('p3'));
        expect(after.round!.pending.find((entry) => entry.playerId === 'p3')!.cardIds).toEqual(answer);
        expect(seat(after, 'p3').hand).toHaveLength(seat(sent, 'p3').hand.length);
    });

    it('is announced on the TV for the rest of the round, and forgotten at the next one', () => {
        const after = reduce(secondRound(), reboot('p3', T0 + 52_000));
        expect(toHostView(after, NETWORK, TEXTS, T0).round?.announcements).toEqual([
            { kind: 'reboot', playerId: 'p3', at: T0 + 52_000 },
        ]);
        const next = expire(playRound(after));
        expect(next.phase).toBe('ROUND_START');
        expect(next.round?.announcements).toEqual([]);
    });

    it('is off in sudden death: the tie is decided by the cards alone', () => {
        const settings = { ...REBOOT, pointsToWin: null, roundLimit: 10 };
        const start = expire(startedGame({ settings }));
        const tenth = withScores({ ...start, round: { ...start.round!, number: 10 } }, { p2: 3, p3: 3 });
        const sudden = expire(expire(playRound(tenth, 'p4')));
        expect(sudden.suddenDeath?.contenderIds).toEqual(['p2', 'p3']);
        expect(sudden.phase).toBe('SUBMITTING');
        expect(checkAction(sudden, reboot('p2'))).toBe('WRONG_PHASE');
    });
});
