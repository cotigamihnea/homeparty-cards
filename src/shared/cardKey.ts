/** Two cards are the same card when their text matches ignoring case, curly quotes, spacing and one final period. */
export function cardKey(text: string): string {
    return text
        .normalize('NFC')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\.$/, '')
        .toLocaleLowerCase('en');
}
