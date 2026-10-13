export type Plural = { one: string; few?: string; other: string };
export type Entry = string | Plural;
export type Params = Record<string, string | number>;

export function plural(forms: Plural): Plural {
    return forms;
}

export function isPlural(value: unknown): value is Plural {
    return typeof value === 'object' && value !== null && 'one' in value && 'other' in value;
}

export function lookup(dict: object, key: string): Entry {
    let node: unknown = dict;
    for (const part of key.split('.')) {
        node = typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
    }
    return typeof node === 'string' || isPlural(node) ? node : key;
}

export function format(entry: Entry, lang: string, params: Params = {}): string {
    const template = isPlural(entry) ? pickPlural(entry, lang, Number(params.count ?? 0)) : entry;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

function pickPlural(entry: Plural, lang: string, count: number): string {
    const category = new Intl.PluralRules(lang).select(count);
    if (category === 'one') return entry.one;
    if (category === 'few' && entry.few !== undefined) return entry.few;
    return entry.other;
}
