export interface StoredSession {
    /** The seat's secret token from the server; null before joining or after being kicked. */
    token: string | null;
    name: string | null;
}

const KEY = 'cah.session';
const EMPTY: StoredSession = { token: null, name: null };

/** localStorage, or null where the browser blocks it (private modes, some in-app browsers). */
function browserStorage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

export function loadSession(storage: Storage | null = browserStorage()): StoredSession {
    try {
        const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null');
        if (typeof parsed !== 'object' || parsed === null) return EMPTY;
        const record = parsed as Record<string, unknown>;
        return { token: stringOrNull(record.token), name: stringOrNull(record.name) };
    } catch {
        return EMPTY;
    }
}

export function saveSession(session: StoredSession, storage: Storage | null = browserStorage()): void {
    try {
        storage?.setItem(KEY, JSON.stringify(session));
    } catch {
        // Without storage the phone still plays; it just rejoins by name after a reload.
    }
}

export function forgetToken(storage: Storage | null = browserStorage()): void {
    saveSession({ ...loadSession(storage), token: null }, storage);
}
