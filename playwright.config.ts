import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: true,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: { trace: 'retain-on-failure' },
    projects: [
        { name: 'web', testIgnore: /electron\.spec\.ts/ },
        { name: 'electron', testMatch: /electron\.spec\.ts/ },
    ],
});
