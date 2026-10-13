import { networkInterfaces } from 'node:os';

const IPV4_MAPPED = '::ffff:';

function unmapped(address: string): string {
    return address.startsWith(IPV4_MAPPED) ? address.slice(IPV4_MAPPED.length) : address;
}

function isLoopback(address: string): boolean {
    return address === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address);
}

/** Host admin rights come only from the laptop running the game: loopback or one of its own addresses. */
export function isLaptopAddress(address: string, ownAddresses: readonly string[]): boolean {
    const plain = unmapped(address);
    return isLoopback(plain) || (plain !== '' && ownAddresses.includes(plain));
}

export function ownAddresses(): string[] {
    return Object.values(networkInterfaces()).flatMap((entries) => (entries ?? []).map((entry) => entry.address));
}
