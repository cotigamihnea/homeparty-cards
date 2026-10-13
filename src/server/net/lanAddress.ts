import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import type { HostSystem, NetworkWarning } from '../../shared/views.js';

export type InterfaceMap = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

export interface LanCandidate {
    name: string;
    address: string;
    score: number;
    virtual: boolean;
}

/** What the OS tells us besides the interface list; gathered by readHostNetworkFacts(). */
export interface HostNetworkFacts {
    isWsl: boolean;
    /** Output of `wslinfo --networking-mode` ("nat", "mirrored", …); null when unavailable. */
    wslNetworkingMode: string | null;
    defaultRouteInterface: string | null;
}

export interface LanSelection {
    address: string;
    candidates: LanCandidate[];
    isWsl: boolean;
    wslMode: 'mirrored' | 'nat' | null;
    warning: NetworkWarning | null;
}

// The mafia game's blocklist, plus the Linux/macOS virtual interfaces and VPNs it never met.
const VIRTUAL_ADAPTER =
    /vmware|virtualbox|vbox|hyper-v|vethernet|virtual|docker|wsl|tailscale|zerotier|hamachi|radmin|^br-|^veth|^virbr|^vmnet|^bridge\d|^utun|^tun|^tap|^cni|^flannel|^lxc|^lxd/i;
const WIRELESS = /wi-?fi|wlan|wireless|^wl/i;
const WIRED = /ethernet|^eth\d|^en/i;
const DEFAULT_ROUTE_BONUS = 50;

export function detectWsl(platform: NodeJS.Platform, procVersion: string | null, env: NodeJS.ProcessEnv): boolean {
    if (platform !== 'linux') return false;
    return Boolean(env.WSL_DISTRO_NAME) || /microsoft/i.test(procVersion ?? '');
}

export function pickLanAddress(interfaces: InterfaceMap, facts: HostNetworkFacts): LanSelection {
    const ipv4 = Object.entries(interfaces).flatMap(([name, infos]) =>
        (infos ?? []).filter((info) => info.family === 'IPv4').map((info) => ({ name, ...info })),
    );
    const candidates = ipv4
        .filter((info) => !info.internal && !info.address.startsWith('169.254.') && !info.address.startsWith('127.'))
        .map((info) => scoreCandidate(info.name, info.address, facts))
        .sort((a, b) => b.score - a.score);
    const real = candidates.filter((candidate) => !candidate.virtual);
    const best = real[0] ?? candidates[0];
    const wslMode = detectWslMode(facts);
    const warning = networkWarning(wslMode, real.length > 0);
    return { address: best?.address ?? '127.0.0.1', candidates, isWsl: facts.isWsl, wslMode, warning };
}

// Only mirrored mode puts WSL on the real LAN; NAT, VirtioProxy and pre-mirrored WSL (no wslinfo) do not.
function detectWslMode(facts: HostNetworkFacts): LanSelection['wslMode'] {
    if (!facts.isWsl) return null;
    return facts.wslNetworkingMode === 'mirrored' ? 'mirrored' : 'nat';
}

function networkWarning(wslMode: LanSelection['wslMode'], hasRealLan: boolean): NetworkWarning | null {
    if (wslMode === 'nat') return 'WSL_NAT';
    if (!hasRealLan) return 'NO_LAN';
    return null;
}

function scoreCandidate(name: string, address: string, facts: HostNetworkFacts): LanCandidate {
    let score = name === facts.defaultRouteInterface ? DEFAULT_ROUTE_BONUS : 0;
    if (WIRELESS.test(name)) score += 30;
    else if (WIRED.test(name)) score += 20;
    if (address.startsWith('192.168.')) score += 10;
    else if (address.startsWith('10.')) score += 5;
    else if (isPrivate172(address) && facts.isWsl) score -= 10;
    return { name, address, score, virtual: VIRTUAL_ADAPTER.test(name) };
}

function isPrivate172(address: string): boolean {
    const second = Number(address.split('.')[1]);
    return address.startsWith('172.') && second >= 16 && second <= 31;
}

/** Reads /proc/net/route and returns the interface of the default route with the lowest metric. */
export function parseDefaultRouteInterface(routeTable: string): string | null {
    let best: { iface: string; metric: number } | null = null;
    for (const line of routeTable.split('\n').slice(1)) {
        const [iface, destination, , , , , metric] = line.trim().split(/\s+/);
        if (!iface || destination !== '00000000') continue;
        const value = Number(metric);
        if (!best || value < best.metric) best = { iface, metric: value };
    }
    return best?.iface ?? null;
}

export function readLanSelection(): LanSelection {
    return pickLanAddress(os.networkInterfaces(), readHostNetworkFacts());
}

function readHostNetworkFacts(): HostNetworkFacts {
    const isWsl = detectWsl(process.platform, readText('/proc/version'), process.env);
    const routeTable = process.platform === 'linux' ? readText('/proc/net/route') : null;
    return {
        isWsl,
        wslNetworkingMode: isWsl ? readWslNetworkingMode() : null,
        defaultRouteInterface: routeTable ? parseDefaultRouteInterface(routeTable) : null,
    };
}

function readWslNetworkingMode(): string | null {
    try {
        const output = execFileSync('wslinfo', ['--networking-mode'], {
            encoding: 'utf8',
            timeout: 2000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return output.trim().toLowerCase() || null;
    } catch {
        return null;
    }
}

function readText(path: string): string | null {
    try {
        return readFileSync(path, 'utf8');
    } catch {
        return null;
    }
}

/** Which connection help the TV shows for this laptop (WSL's fix depends on its networking mode). */
export function hostSystem(platform: string, wslMode: LanSelection['wslMode']): HostSystem {
    if (platform === 'win32') return 'windows';
    if (wslMode === 'nat') return 'wsl-nat';
    return wslMode === 'mirrored' ? 'wsl-mirrored' : 'other';
}
