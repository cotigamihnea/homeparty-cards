import { APP_NAME } from '../shared/constants.js';
import { buildDeck, defaultPackIds, officialPackIds } from './cards/deck.js';
import type { CardLibrary } from './cards/library.js';
import type { RunningServer } from './index.js';

export function printBanner(server: RunningServer): void {
    console.log(`\n  ${APP_NAME}`);
    console.log(`  TV / host screen:  ${server.urls.host}`);
    console.log(`  Phones join at:    ${server.urls.join}`);
    console.log(`  ${cardStats(server.cards)}\n`);
    if (server.lan.warning === 'WSL_NAT') {
        console.warn(
            [
                '  ! Running inside WSL with NAT networking: phones probably cannot reach this address.',
                '    Fix (Windows 11 22H2+): put this in %USERPROFILE%\\.wslconfig, then run `wsl --shutdown`:',
                '        [wsl2]',
                '        networkingMode=mirrored',
                `    Or forward the port (admin PowerShell): netsh interface portproxy add v4tov4 listenport=${server.port} listenaddress=0.0.0.0 connectport=${server.port} connectaddress=${server.lan.address}`,
                '',
            ].join('\n'),
        );
    }
    if (server.lan.warning === 'NO_LAN') {
        console.warn('  ! No Wi-Fi or Ethernet network found. Connect to the same Wi-Fi as the phones.\n');
    }
}

function cardStats(library: CardLibrary): string {
    const deck = buildDeck(library, defaultPackIds(library));
    const official = officialPackIds(library).length;
    return `Cards: ${library.packs.length} packs (${official} official); default deck ${deck.white.length} white / ${deck.black.length} black`;
}
