import { createHash, randomBytes } from 'node:crypto';
import nodeFs from 'node:fs';
import path from 'node:path';
import {
    blackPick,
    checkCardText,
    checkDeckName,
    CUSTOM_DECK_LIMITS,
    deckFileName,
    normalizeCardText,
    normalizeDeckName,
    type CardColor,
    type CustomDeck,
    type CustomDeckCards,
} from '../../shared/customCards.js';
import { sameName } from '../../shared/names.js';
import type { Answer, ImportedDeck } from '../../shared/events.js';
import type { Reason } from '../../shared/reasons.js';
import { deckFileJson, readDeckFile } from './customDeckFile.js';
import { byDeckName } from './customLibrary.js';
import { cardKey } from './library.js';

export type DeckFs = Pick<
    typeof nodeFs,
    'existsSync' | 'mkdirSync' | 'readdirSync' | 'readFileSync' | 'writeFileSync' | 'renameSync' | 'unlinkSync'
>;

/** The laptop's own decks (GAME_DESIGN §12), one JSON file each; every change is on disk before it counts. */
export interface DeckStore {
    readonly folder: string;
    /** Goes up on every change, so the card library and open screens know to refresh. */
    readonly version: number;
    /** By name, ignoring case. */
    list(): readonly CustomDeck[];
    get(deckId: string): CustomDeck | undefined;
    create(name: string): Answer<{ deckId: string }>;
    rename(deckId: string, name: string): Answer;
    addCard(deckId: string, color: CardColor, text: string): Answer;
    /** Cards are named by their text: duplicates are refused, so the text finds exactly one card. */
    editCard(deckId: string, color: CardColor, oldText: string, text: string): Answer;
    removeCard(deckId: string, color: CardColor, text: string): Answer;
    remove(deckId: string): Answer;
    exportDeck(deckId: string): Answer<{ fileName: string; json: string }>;
    importDeck(json: string): Answer<ImportedDeck>;
    /** A new deck from cards made elsewhere (Custom Fever); a taken name gets " (2)". */
    saveDeck(name: string, cards: CustomDeckCards): Answer<{ deckId: string; name: string }>;
}

/** `npm run dev` / `npm run serve`: next to the card data in the repo (git-ignored). Electron uses its app data. */
export function defaultCustomDecksDir(): string {
    return path.join(import.meta.dirname, '..', '..', '..', 'custom-decks');
}

const STORE_FILE = /^custom-[0-9a-f]{8}\.json$/;
const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 6;
const RENAME_WAIT_MS = 20;

interface Entry {
    deck: CustomDeck;
    /** The file in the folder: `<id>.json`, or the name of a file someone dropped in. */
    file: string;
}

/** JSON text as Windows tools save it too: Notepad and PowerShell may start the file with a byte order mark. */
function parseJson(text: string): unknown {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
}

const refuse = (reason: Reason): { ok: false; reason: Reason } => ({ ok: false, reason });
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code;

function pause(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cardsOf(deck: CustomDeck, color: CardColor): string[] {
    return color === 'white' ? deck.white : deck.black.map((card) => card.text);
}

/** The deck with one colour's cards replaced by these texts (black cards get their Pick from their blanks). */
function withCards(deck: CustomDeck, color: CardColor, texts: string[]): CustomDeck {
    if (color === 'white') return { ...deck, white: texts };
    return { ...deck, black: texts.map((text) => ({ text, pick: blackPick(text) })) };
}

/** A saved deck keeps the id in its file name; a file someone dropped in gets one from its name, stable across runs. */
function idForFile(file: string): string {
    if (STORE_FILE.test(file)) return file.slice(0, -'.json'.length);
    return `custom-${createHash('sha256').update(file).digest('hex').slice(0, 8)}`;
}

export function openDeckStore(
    folder: string,
    fs: DeckFs = nodeFs,
    log: (message: string) => void = console.warn,
): DeckStore {
    const entries = new Map<string, Entry>();
    let version = 0;

    function nameTaken(name: string, exceptId?: string): boolean {
        return [...entries.values()].some(({ deck }) => deck.id !== exceptId && sameName(deck.name, name));
    }

    /** "Name", or "Name (2)", "Name (3)"… for imports and saves, which must not fail over a name. */
    function freeName(name: string): string {
        let candidate = name;
        for (let n = 2; nameTaken(candidate); n++) candidate = `${name} (${n})`;
        return candidate;
    }

    function newId(): string {
        let id: string;
        do id = `custom-${randomBytes(4).toString('hex')}`;
        while (entries.has(id));
        return id;
    }

    function renameWithRetries(from: string, to: string): void {
        for (let attempt = 1; ; attempt++) {
            try {
                fs.renameSync(from, to);
                return;
            } catch (error) {
                // Antivirus and indexers lock fresh files on Windows for a moment.
                if (attempt >= RENAME_ATTEMPTS || !LOCK_CODES.has(errorCode(error) ?? '')) throw error;
                pause(RENAME_WAIT_MS);
            }
        }
    }

    /** Writes a whole file next to the old one, then swaps it in, so a crash never leaves half a deck. */
    function write(file: string, deck: CustomDeck): boolean {
        const target = path.join(folder, file);
        const temporary = `${target}.tmp`;
        try {
            fs.mkdirSync(folder, { recursive: true });
            fs.writeFileSync(temporary, deckFileJson(deck), 'utf8');
            renameWithRetries(temporary, target);
            return true;
        } catch (error) {
            log(`[decks] could not save ${target}: ${String(error)}`);
            try {
                fs.unlinkSync(temporary);
            } catch {
                // Nothing was written, or it is already gone.
            }
            return false;
        }
    }

    /** Saves first; only a deck that reached the disk replaces the one in memory. */
    function store(entry: Entry): Answer {
        if (!write(entry.file, entry.deck)) return refuse('DECK_SAVE_FAILED');
        entries.set(entry.deck.id, entry);
        version++;
        return { ok: true };
    }

    function change(deckId: string, edit: (deck: CustomDeck) => CustomDeck | Reason): Answer {
        const entry = entries.get(deckId);
        if (!entry) return refuse('DECK_NOT_FOUND');
        const next = edit(entry.deck);
        return typeof next === 'string' ? refuse(next) : store({ ...entry, deck: next });
    }

    /** A file's JSON, or null when it can't be read or parsed (it is then skipped as not a deck). */
    function readJsonFile(file: string): unknown {
        try {
            return parseJson(fs.readFileSync(path.join(folder, file), 'utf8'));
        } catch {
            return null;
        }
    }

    /** The deck files in the folder; none when there is no folder, or it can't be read (the game still starts). */
    function deckFiles(): string[] {
        if (!fs.existsSync(folder)) return [];
        try {
            return fs
                .readdirSync(folder)
                .filter((name) => name.endsWith('.json'))
                .sort();
        } catch (error) {
            log(`[decks] could not read ${folder}: ${String(error)}`);
            return [];
        }
    }

    function load(): void {
        const files = deckFiles();
        for (const file of files) {
            const read = readDeckFile(readJsonFile(file));
            if (read === 'NOT_A_DECK') {
                log(`[decks] skipped ${file}: not a deck`);
                continue;
            }
            const id = idForFile(file);
            if (entries.has(id)) {
                log(`[decks] skipped ${file}: its id clashes with another deck`);
                continue;
            }
            if (read.skipped > 0) log(`[decks] ${file}: left out ${read.skipped} cards that break the rules`);
            entries.set(id, { deck: { id, name: freeName(read.name), ...read.cards }, file });
        }
    }

    function addDeck(name: string, cards: CustomDeckCards): Answer<{ deckId: string }> {
        if (entries.size >= CUSTOM_DECK_LIMITS.decks) return refuse('DECK_LIMIT');
        const id = newId();
        const saved = store({ deck: { id, name, ...cards }, file: `${id}.json` });
        return saved.ok ? { ok: true, deckId: id } : saved;
    }

    function saveDeck(rawName: string, cards: CustomDeckCards): Answer<{ deckId: string; name: string }> {
        const problem = checkDeckName(rawName);
        if (problem) return refuse(problem);
        const name = freeName(normalizeDeckName(rawName));
        const added = addDeck(name, {
            white: cards.white.slice(0, CUSTOM_DECK_LIMITS.white),
            black: cards.black.slice(0, CUSTOM_DECK_LIMITS.black),
        });
        return added.ok ? { ...added, name } : added;
    }

    load();

    return {
        folder,
        get version() {
            return version;
        },
        list: () => [...entries.values()].map((entry) => entry.deck).sort(byDeckName),
        get: (deckId) => entries.get(deckId)?.deck,
        create(name) {
            const problem = checkDeckName(name);
            if (problem) return refuse(problem);
            const clean = normalizeDeckName(name);
            if (nameTaken(clean)) return refuse('DECK_NAME_TAKEN');
            return addDeck(clean, { white: [], black: [] });
        },
        rename(deckId, name) {
            return change(deckId, (deck) => {
                const problem = checkDeckName(name);
                if (problem) return problem;
                const clean = normalizeDeckName(name);
                return nameTaken(clean, deckId) ? 'DECK_NAME_TAKEN' : { ...deck, name: clean };
            });
        },
        addCard(deckId, color, text) {
            return change(deckId, (deck) => {
                const problem = checkCardText(color, text);
                if (problem) return problem;
                const texts = cardsOf(deck, color);
                if (texts.length >= CUSTOM_DECK_LIMITS[color]) return 'DECK_FULL';
                const clean = normalizeCardText(text);
                if (texts.some((existing) => cardKey(existing) === cardKey(clean))) return 'CARD_DUPLICATE';
                return withCards(deck, color, [...texts, clean]);
            });
        },
        editCard(deckId, color, oldText, text) {
            return change(deckId, (deck) => {
                const texts = cardsOf(deck, color);
                const index = texts.findIndex((existing) => cardKey(existing) === cardKey(oldText));
                if (index < 0) return 'CARD_NOT_FOUND';
                const problem = checkCardText(color, text);
                if (problem) return problem;
                const clean = normalizeCardText(text);
                const clash = texts.some((existing, i) => i !== index && cardKey(existing) === cardKey(clean));
                return clash ? 'CARD_DUPLICATE' : withCards(deck, color, texts.with(index, clean));
            });
        },
        removeCard(deckId, color, text) {
            return change(deckId, (deck) => {
                const texts = cardsOf(deck, color);
                const index = texts.findIndex((existing) => cardKey(existing) === cardKey(text));
                return index < 0 ? 'CARD_NOT_FOUND' : withCards(deck, color, texts.toSpliced(index, 1));
            });
        },
        remove(deckId) {
            const entry = entries.get(deckId);
            if (!entry) return refuse('DECK_NOT_FOUND');
            try {
                fs.unlinkSync(path.join(folder, entry.file));
            } catch (error) {
                if (errorCode(error) !== 'ENOENT') return refuse('DECK_SAVE_FAILED');
            }
            entries.delete(deckId);
            version++;
            return { ok: true };
        },
        exportDeck(deckId) {
            const deck = entries.get(deckId)?.deck;
            if (!deck) return refuse('DECK_NOT_FOUND');
            return { ok: true, fileName: deckFileName(deck.name), json: deckFileJson(deck) };
        },
        importDeck(json) {
            let parsed: unknown;
            try {
                parsed = parseJson(json);
            } catch {
                return refuse('NOT_A_DECK');
            }
            const read = readDeckFile(parsed);
            if (read === 'NOT_A_DECK') return refuse('NOT_A_DECK');
            const saved = saveDeck(read.name, read.cards);
            if (!saved.ok) return saved;
            const imported = read.cards.white.length + read.cards.black.length;
            return { ...saved, imported, skipped: read.skipped };
        },
        saveDeck,
    };
}
