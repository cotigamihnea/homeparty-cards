import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { printBanner } from './banner.js';
import { startServer, type ClientMount } from './index.js';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const clientRoot = path.join(projectRoot, 'src', 'client');
const PAGES = { '/': 'phone/index.html', '/host': 'host/index.html' } as const;

const mountViteClient: ClientMount = async (app, httpServer) => {
    const vite = await createViteServer({
        configFile: path.join(projectRoot, 'vite.config.ts'),
        appType: 'custom',
        server: { middlewareMode: true, hmr: { server: httpServer } },
    });
    for (const [route, file] of Object.entries(PAGES)) {
        app.get(route, async (req, res, next) => {
            try {
                const html = await readFile(path.join(clientRoot, file), 'utf8');
                res.type('html').send(await vite.transformIndexHtml(req.originalUrl, html));
            } catch (error) {
                next(error);
            }
        });
    }
    app.use(vite.middlewares);
};

const server = await startServer({ port: Number(process.env.PORT) || undefined, mountClient: mountViteClient });
printBanner(server);
