import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
    define: { __APP_VERSION__: JSON.stringify(version) },
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            include: ['src/server/engine/**'],
            reporter: ['text-summary', 'text'],
            thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
        },
    },
});
