/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVATAR_COLORS } from '../../src/client/ui/avatars.js';

// Read from disk: Vitest stubs CSS imports, even with ?raw.
const tokens = readFileSync('src/client/ui/tokens.css', 'utf8');

function token(name: string): string {
    const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens);
    if (!match) throw new Error(`no --${name}`);
    return match[1]!.trim();
}

/** An sRGB colour (hex, or white with alpha over black) as 0–255 channels. */
function rgb(value: string): [number, number, number] {
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    if (hex) {
        const n = Number.parseInt(hex[1]!, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const alpha = /^rgb\(255 255 255 \/ ([\d.]+)\)$/.exec(value);
    if (alpha) return Array(3).fill(Math.round(255 * Number(alpha[1]))) as [number, number, number];
    throw new Error(`unsupported colour ${value}`);
}

function luminance([r, g, b]: [number, number, number]): number {
    const channel = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
    const [x, y] = [luminance(rgb(a)), luminance(rgb(b))].sort((m, n) => n - m) as [number, number];
    return (x + 0.05) / (y + 0.05);
}

describe('colour contrast (WCAG AA, 4.5:1 for text)', () => {
    it('muted text, the accents and errors are readable on the black background', () => {
        for (const name of ['muted', 'crown', 'warn', 'danger']) {
            expect(contrast(token(name), '#000000'), name).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('black initials are readable on every avatar colour', () => {
        for (const colour of AVATAR_COLORS)
            expect(contrast(colour.hex, '#000000'), colour.hex).toBeGreaterThanOrEqual(4.5);
    });
});
