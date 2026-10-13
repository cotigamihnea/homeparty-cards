import type { JoinAck } from '../../shared/events.js';
import type { JoinFailure } from './rejoin.js';
import type { StoredSession } from './session.js';

export type SeatResult = Extract<JoinAck, { ok: true }> | { ok: false; reason: JoinFailure };

export interface SeatApi {
    resume(token: string, done: (result: SeatResult) => void): void;
    join(name: string, done: (result: SeatResult) => void): void;
}

/**
 * Gets this phone its seat back: by token first. If the server no longer knows the token (it restarted), joining
 * by name is the fallback; after a kick it is not, so a kicked phone can't slip back in by itself.
 */
export function reclaimSeat(api: SeatApi, session: StoredSession, done: (result: SeatResult) => void): void {
    function byName(): void {
        if (session.name) api.join(session.name, done);
        else done({ ok: false, reason: 'UNKNOWN_SESSION' });
    }
    if (!session.token) return byName();
    api.resume(session.token, (result) => {
        if (!result.ok && result.reason === 'UNKNOWN_SESSION') byName();
        else done(result);
    });
}
