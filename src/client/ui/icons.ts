import { svgEl } from './dom.js';

function icon(className: string, pathData: string): SVGSVGElement {
    return svgEl('svg', { viewBox: '0 0 24 24', class: className, 'aria-hidden': 'true' }, [
        svgEl('path', { d: pathData }),
    ]);
}

export function crownIcon(): SVGSVGElement {
    return icon('icon-crown', 'M2.5 8 7 12.5 12 4l5 8.5L21.5 8 20 19.5H4z');
}

export function closeIcon(): SVGSVGElement {
    return icon('icon-close', 'M6 6l12 12M18 6 6 18');
}

export function checkIcon(): SVGSVGElement {
    return icon('icon-check', 'M4.5 12.5 9.5 17.5 19.5 6.5');
}

/** A speaker, with sound waves when on and a cross when off. */
export function soundIcon(on: boolean): SVGSVGElement {
    return icon(
        'icon-sound',
        on
            ? 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'
            : 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
    );
}

/** Rando Cardrissian's badge: a die showing five, drawn in the text colour. */
export function dieIcon(): SVGSVGElement {
    const pips = [
        [8, 8],
        [16, 8],
        [12, 12],
        [8, 16],
        [16, 16],
    ];
    return svgEl('svg', { viewBox: '0 0 24 24', class: 'icon-die', 'aria-hidden': 'true' }, [
        svgEl('rect', { x: '3', y: '3', width: '18', height: '18', rx: '4', class: 'icon-die-face' }),
        ...pips.map(([cx, cy]) => svgEl('circle', { cx: String(cx), cy: String(cy), r: '1.7', class: 'icon-die-pip' })),
    ]);
}

/** The game's own mark for card corners: two stacked cards, drawn in the card's text colour. */
export function cardMarkIcon(): SVGSVGElement {
    return svgEl('svg', { viewBox: '0 0 24 24', class: 'card-mark', 'aria-hidden': 'true' }, [
        svgEl('rect', {
            x: '9',
            y: '3',
            width: '12',
            height: '16',
            rx: '2.5',
            transform: 'rotate(10 15 11)',
            class: 'card-mark-back',
        }),
        svgEl('rect', {
            x: '3',
            y: '6',
            width: '12',
            height: '16',
            rx: '2.5',
            transform: 'rotate(-6 9 14)',
            class: 'card-mark-front',
        }),
    ]);
}
