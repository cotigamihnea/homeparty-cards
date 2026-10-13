import { describe, expect, it } from 'vitest';
import { reclaimSeat, type SeatApi, type SeatResult } from '../../src/client/phone/reclaim.js';

function api(answers: { resume?: SeatResult; join?: SeatResult }) {
    const calls: string[] = [];
    const seatApi: SeatApi = {
        resume: (token, done) => {
            calls.push(`resume:${token}`);
            done(answers.resume!);
        },
        join: (name, done) => {
            calls.push(`join:${name}`);
            done(answers.join!);
        },
    };
    return { seatApi, calls };
}

const SEATED: SeatResult = { ok: true, playerId: 'p1', sessionToken: 'tok' };

describe('reclaimSeat', () => {
    it('uses the token when there is one', () => {
        const { seatApi, calls } = api({ resume: SEATED });
        let result: SeatResult | null = null;
        reclaimSeat(seatApi, { token: 'tok', name: 'Ana' }, (r) => (result = r));
        expect(calls).toEqual(['resume:tok']);
        expect(result).toEqual(SEATED);
    });

    it('falls back to the name when the server no longer knows the token (it restarted)', () => {
        const { seatApi, calls } = api({ resume: { ok: false, reason: 'UNKNOWN_SESSION' }, join: SEATED });
        let result: SeatResult | null = null;
        reclaimSeat(seatApi, { token: 'old', name: 'Ana' }, (r) => (result = r));
        expect(calls).toEqual(['resume:old', 'join:Ana']);
        expect(result).toEqual(SEATED);
    });

    it('does not sneak back in by name after being kicked', () => {
        const { seatApi, calls } = api({ resume: { ok: false, reason: 'KICKED' } });
        let result: SeatResult | null = null;
        reclaimSeat(seatApi, { token: 'old', name: 'Ana' }, (r) => (result = r));
        expect(calls).toEqual(['resume:old']);
        expect(result).toEqual({ ok: false, reason: 'KICKED' });
    });

    it('joins by name when there is no token', () => {
        const { seatApi, calls } = api({ join: SEATED });
        reclaimSeat(seatApi, { token: null, name: 'Ana' }, () => {});
        expect(calls).toEqual(['join:Ana']);
    });
});
