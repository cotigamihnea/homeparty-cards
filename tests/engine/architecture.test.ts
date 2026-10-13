import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_DIR = path.join('src', 'server', 'engine');

describe('engine purity', () => {
    it.each(readdirSync(ENGINE_DIR).filter((file) => file.endsWith('.ts')))(
        '%s imports nothing with I/O (no node built-ins, no card loader, no sockets)',
        (file) => {
            const source = readFileSync(path.join(ENGINE_DIR, file), 'utf8');
            const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
            expect(
                imports.filter(
                    (spec) =>
                        spec?.startsWith('node:') ||
                        spec?.includes('/cards/') ||
                        spec?.includes('/net/') ||
                        spec === 'socket.io',
                ),
            ).toEqual([]);
        },
    );
});
