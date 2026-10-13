import path from 'node:path';
import { app, BrowserWindow, dialog, Menu } from 'electron';
import { APP_NAME } from '../shared/constants.js';
import { printBanner } from '../server/banner.js';
import { startServer, type RunningServer } from '../server/index.js';
import { builtClientDir, serveBuiltClient } from '../server/static.js';

let server: RunningServer | null = null;
let hostWindow: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!hostWindow) return;
        if (hostWindow.isMinimized()) hostWindow.restore();
        hostWindow.focus();
    });
    app.on('window-all-closed', () => app.quit());
    app.on('will-quit', () => void server?.close());
    app.whenReady()
        .then(launch)
        .catch((error: unknown) => {
            dialog.showErrorBox('Could not start the game', error instanceof Error ? error.message : String(error));
            app.quit();
        });
}

async function launch(): Promise<void> {
    Menu.setApplicationMenu(null);
    server = await startServer({
        port: Number(process.env.PORT) || undefined,
        mountClient: serveBuiltClient(builtClientDir()),
        // %APPDATA%\Homeparty Cards\custom-decks on Windows: it survives installing a new release.
        customDecksDir: path.join(app.getPath('userData'), 'custom-decks'),
    });
    printBanner(server);
    hostWindow = createHostWindow(server.urls.host);
    await hostWindow.loadURL(server.urls.host);
}

function createHostWindow(hostUrl: string): BrowserWindow {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        show: false,
        title: APP_NAME,
        backgroundColor: '#000000',
        // The TV plays its sounds without waiting for a click on the window.
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            autoplayPolicy: 'no-user-gesture-required',
        },
    });
    win.once('ready-to-show', () => {
        win.maximize();
        win.show();
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
        if (new URL(url).origin !== new URL(hostUrl).origin) event.preventDefault();
    });
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'F11') {
            win.setFullScreen(!win.isFullScreen());
            event.preventDefault();
        }
    });
    return win;
}
