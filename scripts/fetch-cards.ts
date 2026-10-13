import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCardData, sha256 } from '../src/server/cards/loader.js';

const REPOSITORY = 'crhallberg/json-against-humanity';
const REF = 'latest';
const FILE = 'cah-all-compact.json';
const DATA_DIR = path.join(import.meta.dirname, '..', 'data');
const HEADERS = { 'User-Agent': 'homeparty-cards fetch-cards', Accept: 'application/vnd.github+json' };

async function fetchOk(url: string): Promise<Response> {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`${url} answered ${response.status} ${response.statusText}`);
    return response;
}

/** Writes every file next to its target first, then renames them all, so a failed run never leaves a mismatched pair. */
async function writeAllAtomically(files: Record<string, Uint8Array | string>): Promise<void> {
    const entries = Object.entries(files);
    for (const [file, contents] of entries) await writeFile(`${file}.download`, contents);
    for (const [file] of entries) await rename(`${file}.download`, file);
}

async function main(): Promise<void> {
    const commitResponse = await fetchOk(`https://api.github.com/repos/${REPOSITORY}/commits/${REF}`);
    const commit = (await commitResponse.json()) as { sha: string };
    const url = `https://raw.githubusercontent.com/${REPOSITORY}/${commit.sha}/${FILE}`;
    const fileResponse = await fetchOk(url);
    const bytes = new Uint8Array(await fileResponse.arrayBuffer());
    const data = parseCardData(JSON.parse(new TextDecoder().decode(bytes)));
    const source = {
        repository: `https://github.com/${REPOSITORY}`,
        ref: REF,
        commit: commit.sha,
        url,
        fetchedAt: new Date().toISOString(),
        license: 'CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/)',
        sha256: sha256(bytes),
        counts: {
            white: data.white.length,
            black: data.black.length,
            packs: data.packs.length,
            officialPacks: data.packs.filter((pack) => pack.official).length,
        },
    };
    await mkdir(DATA_DIR, { recursive: true });
    await writeAllAtomically({
        [path.join(DATA_DIR, FILE)]: bytes,
        [path.join(DATA_DIR, 'cah-all-compact.source.json')]: `${JSON.stringify(source, null, 2)}\n`,
    });
    console.log(`Saved ${FILE} from ${REPOSITORY}@${commit.sha.slice(0, 7)}:`, source.counts);
}

main().catch((error: unknown) => {
    console.error(`fetch-cards failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
