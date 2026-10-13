import { describe, expect, it } from 'vitest';
import { forgetToken, loadSession, saveSession } from '../../src/client/phone/session.js';

function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => void data.set(key, value),
        removeItem: (key) => void data.delete(key),
        clear: () => data.clear(),
        key: () => null,
        get length() {
            return data.size;
        },
    };
}

const broken = {
    getItem: () => {
        throw new Error('storage blocked');
    },
    setItem: () => {
        throw new Error('storage blocked');
    },
    removeItem: () => {
        throw new Error('storage blocked');
    },
} as unknown as Storage;

describe('phone session storage', () => {
    it('remembers the seat token and name, and can forget just the token', () => {
        const storage = memoryStorage();
        expect(loadSession(storage)).toEqual({ token: null, name: null });
        saveSession({ token: 'secret', name: 'Ana' }, storage);
        expect(loadSession(storage)).toEqual({ token: 'secret', name: 'Ana' });
        forgetToken(storage);
        expect(loadSession(storage)).toEqual({ token: null, name: 'Ana' });
    });

    it('treats blocked or missing storage as empty and never throws', () => {
        expect(() => saveSession({ token: 't', name: 'Ana' }, broken)).not.toThrow();
        expect(() => forgetToken(broken)).not.toThrow();
        expect(loadSession(broken)).toEqual({ token: null, name: null });
        expect(loadSession(null)).toEqual({ token: null, name: null });
    });

    it('ignores corrupt or wrongly shaped data', () => {
        const storage = memoryStorage();
        for (const raw of ['{not json', '42', '{"token":7,"name":["x"]}']) {
            storage.setItem('cah.session', raw);
            expect(loadSession(storage)).toEqual({ token: null, name: null });
        }
    });
});
