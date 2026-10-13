import { IMPORT_MAX_BYTES } from '../../../shared/customCards.js';
import { el } from '../dom.js';

/** Saves text as a file: Downloads on a phone, a save dialog in the laptop's window. */
export function downloadText(fileName: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = el('a', { attrs: { href: url, download: fileName } });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A picked deck file's text; a file bigger than any deck is refused before it is read. */
export async function readTextFile(file: File): Promise<string | 'TOO_BIG'> {
    return file.size > IMPORT_MAX_BYTES ? 'TOO_BIG' : file.text();
}
