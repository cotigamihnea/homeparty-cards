import { describe, expect, it } from 'vitest';
import { Sessions } from '../../src/server/net/sessions.js';

describe('Sessions', () => {
    it('issues one secret token per seat, unlike the public player id', () => {
        const sessions = new Sessions();
        const token = sessions.issue('p1');
        expect(token).toMatch(/^[A-Za-z0-9_-]{24,}$/);
        expect(token).not.toContain('p1');
        expect(sessions.issue('p1')).toBe(token);
        expect(sessions.issue('p2')).not.toBe(token);
        expect(sessions.playerFor(token)).toBe('p1');
        expect(sessions.playerFor('made-up')).toBeNull();
    });

    it('keeps track of the seat’s current connection; attaching another returns the one it replaces', () => {
        const sessions = new Sessions();
        expect(sessions.attach('p1', 'socket-a')).toBeNull();
        expect(sessions.attach('p1', 'socket-a')).toBeNull();
        expect(sessions.attach('p1', 'socket-b')).toBe('socket-a');
        expect(sessions.socketOf('p1')).toBe('socket-b');
    });

    it('only the current connection going away counts as the seat going away', () => {
        const sessions = new Sessions();
        sessions.attach('p1', 'socket-a');
        sessions.attach('p1', 'socket-b');
        expect(sessions.detach('p1', 'socket-a')).toBe(false);
        expect(sessions.detach('p1', 'socket-b')).toBe(true);
        expect(sessions.socketOf('p1')).toBeNull();
        expect(sessions.detach('p1', 'socket-b')).toBe(false);
    });

    it('revoking a kicked seat forgets its token but remembers it was revoked', () => {
        const sessions = new Sessions();
        const token = sessions.issue('p1');
        sessions.attach('p1', 'socket-a');
        expect(sessions.revoke('p1')).toBe('socket-a');
        expect(sessions.playerFor(token)).toBeNull();
        expect(sessions.wasRevoked(token)).toBe(true);
        expect(sessions.wasRevoked('made-up')).toBe(false);
        expect(sessions.socketOf('p1')).toBeNull();
        expect(sessions.issue('p1')).not.toBe(token);
    });
});
