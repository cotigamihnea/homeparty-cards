import { _electron as electron, expect, test } from '@playwright/test';

test('npm start entry opens the renamed host window with a QR code', async () => {
    const app = await electron.launch({ args: ['.'], env: { ...process.env, PORT: '4344' } });
    try {
        const window = await app.firstWindow();
        await expect(window).toHaveTitle('Homeparty Cards');
        await expect(window.getByRole('img', { name: /QR code for http:\/\/.+:\d+/ })).toBeVisible();
        await expect(window.locator('.join-url')).toContainText(':');
    } finally {
        await app.close();
    }
});
