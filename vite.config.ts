import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(projectRoot, 'src', 'client');
const { version } = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as { version: string };

export default defineConfig({
    root: clientRoot,
    publicDir: false,
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: {
        outDir: path.join(projectRoot, 'dist', 'client'),
        emptyOutDir: true,
        rolldownOptions: {
            input: {
                phone: path.join(clientRoot, 'phone', 'index.html'),
                host: path.join(clientRoot, 'host', 'index.html'),
            },
        },
    },
});
