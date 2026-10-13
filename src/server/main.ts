import { printBanner } from './banner.js';
import { startServer } from './index.js';
import { builtClientDir, serveBuiltClient } from './static.js';

const server = await startServer({
    port: Number(process.env.PORT) || undefined,
    mountClient: serveBuiltClient(builtClientDir()),
});
printBanner(server);
