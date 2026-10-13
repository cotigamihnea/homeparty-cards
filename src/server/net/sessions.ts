import { randomBytes } from 'node:crypto';

/**
 * Who holds which seat. A seat has one secret token (kept in the phone's localStorage, never in a view) and at
 * most one live connection; the newest connection wins.
 */
export class Sessions {
    private readonly playerByToken = new Map<string, string>();
    private readonly tokenByPlayer = new Map<string, string>();
    private readonly socketByPlayer = new Map<string, string>();
    private readonly revoked = new Set<string>();

    /** The seat's token, created on first use. */
    issue(playerId: string): string {
        const existing = this.tokenByPlayer.get(playerId);
        if (existing) return existing;
        const token = randomBytes(18).toString('base64url');
        this.playerByToken.set(token, playerId);
        this.tokenByPlayer.set(playerId, token);
        return token;
    }

    playerFor(token: string): string | null {
        return this.playerByToken.get(token) ?? null;
    }

    wasRevoked(token: string): boolean {
        return this.revoked.has(token);
    }

    /** Makes this connection the seat's current one; returns the connection it replaces, if any. */
    attach(playerId: string, socketId: string): string | null {
        const previous = this.socketByPlayer.get(playerId) ?? null;
        this.socketByPlayer.set(playerId, socketId);
        return previous === socketId ? null : previous;
    }

    /** True when this was the seat's current connection, so the seat is now away. */
    detach(playerId: string, socketId: string): boolean {
        if (this.socketByPlayer.get(playerId) !== socketId) return false;
        this.socketByPlayer.delete(playerId);
        return true;
    }

    socketOf(playerId: string): string | null {
        return this.socketByPlayer.get(playerId) ?? null;
    }

    /** Forgets a kicked seat; returns its connection so it can be told and closed. */
    revoke(playerId: string): string | null {
        const token = this.tokenByPlayer.get(playerId);
        if (token) {
            this.playerByToken.delete(token);
            this.revoked.add(token);
        }
        this.tokenByPlayer.delete(playerId);
        const socketId = this.socketOf(playerId);
        this.socketByPlayer.delete(playerId);
        return socketId;
    }
}
