import { secondsLeft } from './clock.js';
import { el, svgEl } from './dom.js';

const ENDS_AT = 'data-ends-at';
const TOTAL_MS = 'data-total-ms';
const URGENT_SECONDS = 10;
/** From here up, the time shows as minutes and seconds (Custom Fever's writing time is minutes long). */
const MINUTES_FROM = 100;

/** "45", or "4:56" for a long timer. */
function timeText(seconds: number): string {
    if (seconds < MINUTES_FROM) return String(seconds);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function ringCircle(className: string): SVGCircleElement {
    return svgEl('circle', { cx: '22', cy: '22', r: '19', pathLength: '100', class: className });
}

function ring(): SVGSVGElement {
    return svgEl('svg', { viewBox: '0 0 44 44', class: 'countdown-ring', 'aria-hidden': 'true' }, [
        ringCircle('countdown-track'),
        ringCircle('countdown-left'),
    ]);
}

/** Updates the number, the ring (time left out of the full length) and the last-seconds urgency. */
function update(node: HTMLElement, now: number): void {
    const endsAt = Number(node.getAttribute(ENDS_AT));
    const seconds = secondsLeft(endsAt, now);
    const value = node.querySelector('.countdown-value') ?? node;
    value.textContent = timeText(seconds);
    node.toggleAttribute('data-long', seconds >= MINUTES_FROM);
    const total = Number(node.getAttribute(TOTAL_MS));
    if (total > 0) {
        node.style.setProperty('--left', String(Math.min(1, Math.max(0, (endsAt - now) / total))));
        node.toggleAttribute('data-urgent', seconds <= URGENT_SECONDS);
    }
}

/**
 * A seconds-left label for a server deadline, with a ring when the timer's full length is known.
 * tickCountdowns keeps it current without re-rendering the screen.
 */
export function countdown(endsAt: number | null, now: number, totalMs: number | null = null): HTMLElement | null {
    if (endsAt === null) return null;
    const attrs: Record<string, string> = { role: 'timer', [ENDS_AT]: String(endsAt) };
    if (totalMs) attrs[TOTAL_MS] = String(totalMs);
    const node = el(
        'span',
        { class: totalMs ? 'countdown has-ring' : 'countdown', attrs },
        totalMs ? [ring(), el('span', { class: 'countdown-value' })] : [],
    );
    update(node, now);
    return node;
}

export function tickCountdowns(root: ParentNode, now: number): void {
    for (const node of root.querySelectorAll<HTMLElement>(`[${ENDS_AT}]`)) update(node, now);
}
