type Child = Node | string | null | undefined | false;

export interface ElementProps {
    class?: string;
    text?: string;
    attrs?: Record<string, string>;
}

/** Creates an element. Strings become text nodes, so player and card text can never be parsed as HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: ElementProps = {},
    children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (props.class) node.className = props.class;
    if (props.text !== undefined) node.textContent = props.text;
    for (const [name, value] of Object.entries(props.attrs ?? {})) node.setAttribute(name, value);
    for (const child of children) {
        if (child !== null && child !== undefined && child !== false) node.append(child);
    }
    return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Creates an SVG element (icons, the countdown ring) with its attributes and children. */
export function svgEl<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string>,
    children: readonly SVGElement[] = [],
): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.append(...children);
    return node;
}

/** The class names that apply, space-separated: `classNames('tile', isNew && 'is-new')`. */
export function classNames(...names: readonly (string | false | undefined)[]): string {
    return names.filter(Boolean).join(' ');
}

export function requireElement(id: string): HTMLElement {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing #${id} in the page`);
    return node;
}
