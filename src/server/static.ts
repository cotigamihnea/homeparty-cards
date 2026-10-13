import express from 'express';
import path from 'node:path';
import type { ClientMount } from './index.js';

export function builtClientDir(): string {
    return path.join(import.meta.dirname, '..', 'client');
}

export function serveBuiltClient(clientDir: string): ClientMount {
    return (app) => {
        app.get('/', (_req, res) => res.sendFile(path.join(clientDir, 'phone', 'index.html')));
        app.get('/host', (_req, res) => res.sendFile(path.join(clientDir, 'host', 'index.html')));
        app.use(express.static(clientDir, { index: false }));
    };
}
