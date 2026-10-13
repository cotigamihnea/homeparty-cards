import { describe, expect, it } from 'vitest';
import { isLaptopAddress } from '../../src/server/net/adminAuth.js';

const OWN = ['192.168.1.23', 'fe80::1c2b:3aff:fe4d:5e6f'];

describe('isLaptopAddress', () => {
    it.each(['127.0.0.1', '127.8.9.10', '::1', '::ffff:127.0.0.1', '192.168.1.23', '::ffff:192.168.1.23'])(
        'trusts %s (the laptop itself)',
        (address) => {
            expect(isLaptopAddress(address, OWN)).toBe(true);
        },
    );

    it.each(['192.168.1.42', '::ffff:192.168.1.42', '10.0.0.5', '', 'localhost', '128.0.0.1', '::2'])(
        'does not trust %s',
        (address) => {
            expect(isLaptopAddress(address, OWN)).toBe(false);
        },
    );
});
