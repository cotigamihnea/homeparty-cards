import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface RawPack {
    name: string;
    official: boolean;
    white: number[];
    black: number[];
}

export interface RawBlackCard {
    text: string;
    pick: number;
}

export interface RawCardData {
    white: string[];
    black: RawBlackCard[];
    packs: RawPack[];
}

/** Same depth from src/server/cards and dist/server/cards, so this works in dev, tests and app.asar. */
export function defaultCardDataPath(): string {
    return path.join(import.meta.dirname, '..', '..', '..', 'data', 'cah-all-compact.json');
}

export function loadCardData(file = defaultCardDataPath()): RawCardData {
    return parseCardData(JSON.parse(readFileSync(file, 'utf8')));
}

export function sha256(bytes: Uint8Array | string): string {
    return createHash('sha256').update(bytes).digest('hex');
}

/** Validates the JSON Against Humanity "compact" format and keeps only the fields the game uses. */
export function parseCardData(json: unknown): RawCardData {
    const root = asRecord(json, 'root');
    const white = asList(root.white, 'white').map((text, i) => asString(text, `white[${i}]`));
    const black = asList(root.black, 'black').map((value, i) => {
        const card = asRecord(value, `black[${i}]`);
        return { text: asString(card.text, `black[${i}].text`), pick: asPick(card.pick, `black[${i}].pick`) };
    });
    const packs = asList(root.packs, 'packs').map((value, i) => {
        const pack = asRecord(value, `packs[${i}]`);
        return {
            name: asString(pack.name, `packs[${i}].name`),
            official: asBoolean(pack.official, `packs[${i}].official`),
            white: asIndices(pack.white, white.length, `packs[${i}].white`),
            black: asIndices(pack.black, black.length, `packs[${i}].black`),
        };
    });
    return { white, black, packs };
}

function invalid(where: string, expected: string): Error {
    return new Error(`Invalid card data at ${where}: expected ${expected}`);
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid(where, 'an object');
    return value as Record<string, unknown>;
}

function asList(value: unknown, where: string): unknown[] {
    if (!Array.isArray(value)) throw invalid(where, 'a list');
    return value;
}

function asString(value: unknown, where: string): string {
    if (typeof value !== 'string') throw invalid(where, 'a string');
    return value;
}

function asBoolean(value: unknown, where: string): boolean {
    if (typeof value !== 'boolean') throw invalid(where, 'true or false');
    return value;
}

function asPick(value: unknown, where: string): number {
    if (!isInteger(value) || value < 1) throw invalid(where, 'a whole number of at least 1');
    return value;
}

function asIndices(value: unknown, size: number, where: string): number[] {
    return asList(value, where).map((index, i) => {
        if (!isInteger(index) || index < 0 || index >= size) {
            throw invalid(`${where}[${i}]`, `a card index between 0 and ${size - 1}`);
        }
        return index;
    });
}

function isInteger(value: unknown): value is number {
    return Number.isInteger(value);
}
