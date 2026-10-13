import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
    detectWsl,
    hostSystem,
    parseDefaultRouteInterface,
    pickLanAddress,
    type HostNetworkFacts,
    type InterfaceMap,
} from '../../src/server/net/lanAddress.js';

const WINDOWS: HostNetworkFacts = { isWsl: false, wslNetworkingMode: null, defaultRouteInterface: null };
const LINUX = (defaultRouteInterface: string | null = null): HostNetworkFacts => ({
    isWsl: false,
    wslNetworkingMode: null,
    defaultRouteInterface,
});
const WSL = (wslNetworkingMode: string | null, defaultRouteInterface: string | null = null): HostNetworkFacts => ({
    isWsl: true,
    wslNetworkingMode,
    defaultRouteInterface,
});

function v4(address: string, internal = false): NetworkInterfaceInfo {
    return {
        address,
        netmask: '255.255.255.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal,
        cidr: `${address}/24`,
    };
}

function v6(address: string): NetworkInterfaceInfo {
    return {
        address,
        netmask: 'ffff:ffff:ffff:ffff::',
        family: 'IPv6',
        mac: '00:00:00:00:00:00',
        internal: false,
        cidr: `${address}/64`,
        scopeid: 0,
    };
}

describe('pickLanAddress on Windows', () => {
    it('ignores Hyper-V, WSL and VirtualBox adapters and prefers Wi-Fi', () => {
        const interfaces: InterfaceMap = {
            'VirtualBox Host-Only Network': [v4('192.168.56.1')],
            'vEthernet (WSL (Hyper-V firewall))': [v4('172.20.80.1')],
            Ethernet: [v6('fe80::1'), v4('169.254.10.20')],
            'Wi-Fi': [v6('fe80::2'), v4('192.168.1.23')],
            'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
        };
        const result = pickLanAddress(interfaces, WINDOWS);
        expect(result.address).toBe('192.168.1.23');
        expect(result.warning).toBeNull();
        expect(result.wslMode).toBeNull();
    });

    it('falls back to a virtual adapter with a NO_LAN warning when nothing else exists', () => {
        const result = pickLanAddress({ 'vEthernet (Default Switch)': [v4('172.29.0.1')] }, WINDOWS);
        expect(result.address).toBe('172.29.0.1');
        expect(result.warning).toBe('NO_LAN');
    });
});

describe('pickLanAddress inside WSL', () => {
    it('NAT mode: still shows the WSL address but warns', () => {
        const result = pickLanAddress({ lo: [v4('127.0.0.1', true)], eth0: [v4('172.27.144.5')] }, WSL('nat', 'eth0'));
        expect(result.address).toBe('172.27.144.5');
        expect(result.wslMode).toBe('nat');
        expect(result.warning).toBe('WSL_NAT');
    });

    it('mirrored mode (real interfaces from the dev machine): picks the LAN IP, no warning', () => {
        const interfaces: InterfaceMap = {
            lo: [v4('127.0.0.1', true), v4('10.255.255.254', true)],
            eth0: [v4('169.254.83.107')],
            eth1: [v4('10.216.8.108')],
            'br-9b2c3300b03d': [v4('172.31.90.1')],
            docker0: [v4('172.17.0.1')],
        };
        const result = pickLanAddress(interfaces, WSL('mirrored', 'eth1'));
        expect(result.address).toBe('10.216.8.108');
        expect(result.wslMode).toBe('mirrored');
        expect(result.warning).toBeNull();
    });

    it('mirrored mode order trap: a Docker bridge listed before the LAN interface', () => {
        const interfaces: InterfaceMap = {
            lo: [v4('127.0.0.1', true), v4('10.255.255.254', true)],
            'br-520e7809033d': [v4('172.18.0.1')],
            eth2: [v4('172.24.48.1')],
            eth1: [v4('192.168.0.40')],
        };
        expect(pickLanAddress(interfaces, WSL('mirrored')).address).toBe('192.168.0.40');
    });

    it('NAT mode with DNS tunnelling (lo also carries 10.255.255.254) is still NAT and warns', () => {
        const interfaces: InterfaceMap = {
            lo: [v4('127.0.0.1', true), v4('10.255.255.254', true)],
            eth0: [v4('172.27.144.5')],
        };
        const result = pickLanAddress(interfaces, WSL('nat', 'eth0'));
        expect(result.wslMode).toBe('nat');
        expect(result.warning).toBe('WSL_NAT');
    });

    it('treats WSL without wslinfo (older releases have no mirrored mode) as NAT', () => {
        const result = pickLanAddress({ eth0: [v4('172.27.144.5')] }, WSL(null));
        expect(result.wslMode).toBe('nat');
        expect(result.warning).toBe('WSL_NAT');
    });

    it('mirrored mode: a VirtualBox host-only adapter mirrored as ethN loses to the default-route interface', () => {
        const interfaces: InterfaceMap = {
            lo: [v4('127.0.0.1', true)],
            eth1: [v4('10.216.8.108')],
            eth2: [v4('192.168.56.1')],
        };
        expect(pickLanAddress(interfaces, WSL('mirrored', 'eth1')).address).toBe('10.216.8.108');
    });
});

describe('pickLanAddress on Linux and macOS', () => {
    it('Linux desktop: Wi-Fi beats docker, libvirt and veth', () => {
        const interfaces: InterfaceMap = {
            lo: [v4('127.0.0.1', true)],
            docker0: [v4('172.17.0.1')],
            virbr0: [v4('192.168.122.1')],
            veth1a2b3c: [v4('172.17.0.5')],
            wlp2s0: [v4('192.168.0.42')],
        };
        expect(pickLanAddress(interfaces, LINUX()).address).toBe('192.168.0.42');
    });

    it('macOS: en0 beats Tailscale (utun) and VM bridges', () => {
        const interfaces: InterfaceMap = {
            lo0: [v4('127.0.0.1', true)],
            utun3: [v4('100.101.102.103')],
            bridge100: [v4('192.168.64.1')],
            en0: [v4('192.168.1.77')],
        };
        expect(pickLanAddress(interfaces, LINUX()).address).toBe('192.168.1.77');
    });

    it('no network at all: localhost with a NO_LAN warning', () => {
        const result = pickLanAddress({ lo: [v4('127.0.0.1', true)] }, LINUX());
        expect(result.address).toBe('127.0.0.1');
        expect(result.warning).toBe('NO_LAN');
    });
});

describe('parseDefaultRouteInterface', () => {
    const HEADER = 'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT';

    it('finds the interface of the default route (destination 00000000)', () => {
        const table = [
            HEADER,
            'docker0\t000011AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
            'eth1\t00000000\t0100D80A\t0003\t0\t0\t25\t00000000\t0\t0\t0',
        ].join('\n');
        expect(parseDefaultRouteInterface(table)).toBe('eth1');
    });

    it('returns null when there is no default route', () => {
        expect(parseDefaultRouteInterface(HEADER)).toBeNull();
    });
});

describe('detectWsl', () => {
    it('detects WSL from /proc/version or WSL_DISTRO_NAME, only on linux', () => {
        expect(detectWsl('linux', 'Linux version 6.6.114.1-microsoft-standard-WSL2', {})).toBe(true);
        expect(detectWsl('linux', null, { WSL_DISTRO_NAME: 'Ubuntu' })).toBe(true);
        expect(detectWsl('linux', 'Linux version 6.8.0-45-generic', {})).toBe(false);
        expect(detectWsl('win32', 'microsoft', { WSL_DISTRO_NAME: 'Ubuntu' })).toBe(false);
    });
});

describe('hostSystem', () => {
    it('tells the TV which help to show: Windows, WSL, or anything else', () => {
        expect(hostSystem('win32', null)).toBe('windows');
        expect(hostSystem('linux', 'nat')).toBe('wsl-nat');
        expect(hostSystem('linux', 'mirrored')).toBe('wsl-mirrored');
        expect(hostSystem('linux', null)).toBe('other');
        expect(hostSystem('darwin', null)).toBe('other');
    });
});
