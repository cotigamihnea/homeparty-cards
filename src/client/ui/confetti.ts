import { AVATAR_COLORS } from './avatars.js';
import { el } from './dom.js';

export interface ConfettiPiece {
    /** Start position across the screen, in percent. */
    x: number;
    /** Sideways drift while falling, in percent of the screen width. */
    drift: number;
    delay: number;
    duration: number;
    spin: number;
    color: string;
    wide: boolean;
}

const BURST_PIECES = 70;
const PALETTE: readonly string[] = ['#ffffff', '#ffd23f', ...AVATAR_COLORS.map((colour) => colour.hex)];

/** A small seeded generator, so a burst looks the same on every re-render of the same moment. */
function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function confettiPieces(seed: number, count: number, colors: readonly string[]): ConfettiPiece[] {
    const next = random(seed);
    return Array.from({ length: count }, () => ({
        x: Math.round(next() * 1000) / 10,
        drift: Math.round((next() - 0.5) * 300) / 10,
        delay: Math.round(next() * 600),
        duration: 1800 + Math.round(next() * 1400),
        spin: Math.round((next() - 0.5) * 1440),
        color: colors[Math.floor(next() * colors.length)] ?? colors[0]!,
        wide: next() > 0.5,
    }));
}

/** One burst of paper confetti over the screen; decoration only (hidden from screen readers and reduced motion). */
export function confetti(seed: number): HTMLElement {
    return el(
        'div',
        { class: 'confetti', attrs: { 'aria-hidden': 'true' } },
        confettiPieces(seed, BURST_PIECES, PALETTE).map((piece) =>
            el('span', {
                class: piece.wide ? 'confetti-piece is-wide' : 'confetti-piece',
                attrs: {
                    style: [
                        `--x: ${piece.x}%`,
                        `--drift: ${piece.drift}vw`,
                        `--delay: ${piece.delay}ms`,
                        `--duration: ${piece.duration}ms`,
                        `--spin: ${piece.spin}deg`,
                        `--color: ${piece.color}`,
                    ].join('; '),
                },
            }),
        ),
    );
}

const BURST_LIFETIME_MS = 4000;

/**
 * Throws one burst over the whole page, outside the screen that is re-rendered on every update, so a new
 * view can't cut it short or restart it; it removes itself when done. Call it once per moment (see motion.ts).
 */
export function celebrate(seed: number): void {
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const burst = confetti(seed);
    document.body.append(burst);
    setTimeout(() => burst.remove(), BURST_LIFETIME_MS);
}
