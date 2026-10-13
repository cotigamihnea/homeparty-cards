import type { Server } from 'node:http';

export async function listenWithFallback(
    server: Server,
    firstPort: number,
    host: string,
    attempts: number,
): Promise<number> {
    for (let attempt = 0; ; attempt++) {
        const port = firstPort === 0 ? 0 : firstPort + attempt;
        try {
            await listenOnce(server, port, host);
            const address = server.address();
            return typeof address === 'object' && address ? address.port : port;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'EADDRINUSE' || attempt >= attempts) throw error;
        }
    }
}

function listenOnce(server: Server, port: number, host: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const onError = (error: Error) => {
            server.off('listening', onListening);
            reject(error);
        };
        const onListening = () => {
            server.off('error', onError);
            resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
    });
}
