const TEXT_ENTRY = new Set(['text', 'search', 'email', 'url', 'tel', 'number', 'password']);

function isTextEntry(node: Element): node is HTMLTextAreaElement | HTMLInputElement {
    return node instanceof HTMLTextAreaElement || (node instanceof HTMLInputElement && TEXT_ENTRY.has(node.type));
}

/**
 * Swaps a screen for its freshly rendered version without losing the player's place: the focused control
 * (matched by id) and the scroll position of every `data-scroll-key` panel survive the swap.
 *
 * A text field being typed in is never replaced: it stays where it is, with the elements around it, and only
 * what surrounds it is swapped. Replacing it would drop the phone's keyboard and break a word mid-composition.
 */
export function replaceContent(root: HTMLElement, ...nodes: (Node | string)[]): void {
    if (pressing) {
        held.set(root, nodes);
        return;
    }
    held.delete(root);
    swap(root, nodes);
}

/**
 * A press in progress (a finger or the mouse is down): swapping the screen now would take the pressed button away
 * between down and up, and the browser would drop the tap. Updates wait for the press to end, then the newest one
 * shows, unless the tap itself has drawn a newer screen by then.
 */
let pressing = false;
const held = new Map<HTMLElement, (Node | string)[]>();
/** A press longer than this (a long-press, a lost pointerup) stops holding the screen back. */
const LONGEST_PRESS_MS = 2_000;
let pressTimer: ReturnType<typeof setTimeout> | null = null;

function release(): void {
    if (!pressing) return;
    pressing = false;
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    // After the click that ends the tap has run on the screen it was pressed on.
    setTimeout(() => {
        for (const [root, nodes] of held) swap(root, nodes);
        held.clear();
    }, 0);
}

if (typeof document !== 'undefined') {
    document.addEventListener(
        'pointerdown',
        () => {
            pressing = true;
            if (pressTimer) clearTimeout(pressTimer);
            pressTimer = setTimeout(release, LONGEST_PRESS_MS);
        },
        true,
    );
    for (const end of ['pointerup', 'pointercancel']) document.addEventListener(end, release, true);
    window.addEventListener('blur', release);
}

function swap(root: HTMLElement, nodes: readonly (Node | string)[]): void {
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && root.contains(active) ? active : null;
    const scrolls = new Map<string, number>();
    for (const panel of scrollPanels(root)) scrolls.set(panel.dataset.scrollKey ?? '', panel.scrollTop);
    const fresh = nodes.map((node) => (typeof node === 'string' ? document.createTextNode(node) : node));
    const kept = focused?.id && isTextEntry(focused) ? swapAround(root, fresh, focused) : false;
    if (!kept) root.replaceChildren(...fresh);
    for (const panel of scrollPanels(root)) {
        const top = scrolls.get(panel.dataset.scrollKey ?? '');
        if (top !== undefined && panel.scrollTop !== top) panel.scrollTop = top;
    }
    if (!kept && focused?.id) document.getElementById(focused.id)?.focus({ preventScroll: true });
}

function scrollPanels(root: HTMLElement): NodeListOf<HTMLElement> {
    return root.querySelectorAll<HTMLElement>('[data-scroll-key]');
}

function holds(node: Node, id: string): node is Element {
    return node instanceof Element && (node.id === id || node.querySelector(`[id="${id}"]`) !== null);
}

/**
 * Replaces `parent`'s children with `fresh`, except along the path down to `keep`: the elements on that path
 * stay (taking the new version's attributes), and their other children are swapped. Changes nothing and answers
 * false when the new screen has no matching path, so the caller rebuilds as usual.
 */
function swapAround(parent: Element, fresh: readonly Node[], keep: HTMLElement): boolean {
    const index = fresh.findIndex((node) => holds(node, keep.id));
    const old = [...parent.children].find((child) => child === keep || child.contains(keep));
    const twin = fresh[index];
    if (!old || !(twin instanceof Element) || twin.tagName !== old.tagName) return false;
    if (twin.id === keep.id) {
        if (old !== keep) return false;
        adoptField(keep as HTMLInputElement | HTMLTextAreaElement, twin as HTMLInputElement | HTMLTextAreaElement);
    } else {
        if (old === keep || !swapAround(old, [...twin.childNodes], keep)) return false;
        copyAttributes(old, twin);
    }
    for (const child of [...parent.childNodes]) if (child !== old) child.remove();
    old.before(...fresh.slice(0, index));
    old.after(...fresh.slice(index + 1));
    return true;
}

/** The field keeps what is typed in it, unless the screen set something else on purpose (a cleared box). */
function adoptField(field: HTMLInputElement | HTMLTextAreaElement, twin: HTMLInputElement | HTMLTextAreaElement): void {
    copyAttributes(field, twin);
    if (field.value === twin.value) return;
    field.value = twin.value;
    const end = twin.value.length;
    field.setSelectionRange(twin.selectionStart ?? end, twin.selectionEnd ?? end);
}

function copyAttributes(target: Element, source: Element): void {
    for (const { name } of [...target.attributes]) if (!source.hasAttribute(name)) target.removeAttribute(name);
    for (const { name, value } of [...source.attributes]) {
        if (target.getAttribute(name) !== value) target.setAttribute(name, value);
    }
}
