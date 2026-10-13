export interface TextRun {
    kind: 'text';
    text: string;
    strong: boolean;
    em: boolean;
}

export interface BreakRun {
    kind: 'break';
}

export interface BlankRun {
    kind: 'blank';
    index: number;
}

export type CardRun = TextRun | BreakRun | BlankRun;

export interface AnswerRun {
    kind: 'answer';
    index: number;
    runs: CardRun[];
}

export type FilledRun = CardRun | AnswerRun;

export const BLANK_DISPLAY = '____';

/**
 * Card text as runs: never HTML, so it is rendered with textContent only.
 * In black cards every run of `_` is a blank (true for every card in the data); in white cards `_` is literal.
 * `*em*` and `**strong**` follow CommonMark flanking rules without intraword emphasis, so censored words
 * like "F**king" or "s**k n f**k" stay as written.
 */
export function parseCardText(text: string, options: { blanks: boolean }): CardRun[] {
    const runs: CardRun[] = [];
    let blankIndex = 0;
    text.split('\n').forEach((line, lineNumber) => {
        if (lineNumber > 0) runs.push({ kind: 'break' });
        const parts = options.blanks ? line.split(/(_+)/) : [line];
        parts.forEach((part, i) => {
            if (options.blanks && i % 2 === 1) runs.push({ kind: 'blank', index: blankIndex++ });
            else runs.push(...parseEmphasis(part));
        });
    });
    return runs;
}

export function countBlanks(text: string): number {
    return text.match(/_+/g)?.length ?? 0;
}

export function toPlainText(runs: readonly FilledRun[]): string {
    return runs
        .map((run) => {
            switch (run.kind) {
                case 'text':
                    return run.text;
                case 'break':
                    return '\n';
                case 'blank':
                    return BLANK_DISPLAY;
                case 'answer':
                    return toPlainText(run.runs);
            }
        })
        .join('');
}

interface Delimiter {
    start: number;
    length: number;
    canOpen: boolean;
    canClose: boolean;
}

interface Marker {
    position: number;
    length: number;
    style: 'strong' | 'em';
    change: 1 | -1;
}

const WHITESPACE = /\s/u;
const PUNCTUATION = /[\p{P}\p{S}]/u;

function findDelimiters(segment: string): Delimiter[] {
    return [...segment.matchAll(/\*+/g)].map((match) => {
        const start = match.index;
        const length = match[0].length;
        const before = segment[start - 1] ?? ' ';
        const after = segment[start + length] ?? ' ';
        const spaceBefore = WHITESPACE.test(before);
        const spaceAfter = WHITESPACE.test(after);
        const punctBefore = PUNCTUATION.test(before);
        const punctAfter = PUNCTUATION.test(after);
        const leftFlanking = !spaceAfter && (!punctAfter || spaceBefore || punctBefore);
        const rightFlanking = !spaceBefore && (!punctBefore || spaceAfter || punctAfter);
        const usable = length <= 2;
        return {
            start,
            length,
            canOpen: usable && leftFlanking && (!rightFlanking || punctBefore),
            canClose: usable && rightFlanking && (!leftFlanking || punctAfter),
        };
    });
}

function emphasisMarkers(segment: string): Marker[] {
    const openers: Delimiter[] = [];
    const markers: Marker[] = [];
    for (const delimiter of findDelimiters(segment)) {
        const openerIndex = delimiter.canClose ? openers.findLastIndex((o) => o.length === delimiter.length) : -1;
        const opener = openers[openerIndex];
        if (opener) {
            const style = delimiter.length === 2 ? 'strong' : 'em';
            markers.push({ position: opener.start, length: opener.length, style, change: 1 });
            markers.push({ position: delimiter.start, length: delimiter.length, style, change: -1 });
            openers.length = openerIndex;
        } else if (delimiter.canOpen) {
            openers.push(delimiter);
        }
    }
    return markers.sort((a, b) => a.position - b.position);
}

function parseEmphasis(segment: string): TextRun[] {
    const runs: TextRun[] = [];
    const depth = { strong: 0, em: 0 };
    let cursor = 0;
    const pushText = (value: string) => {
        if (!value) return;
        const strong = depth.strong > 0;
        const em = depth.em > 0;
        const last = runs.at(-1);
        if (last && last.strong === strong && last.em === em) last.text += value;
        else runs.push({ kind: 'text', text: value, strong, em });
    };
    for (const marker of emphasisMarkers(segment)) {
        pushText(segment.slice(cursor, marker.position));
        depth[marker.style] += marker.change;
        cursor = marker.position + marker.length;
    }
    pushText(segment.slice(cursor));
    return runs;
}

export interface FilledCard {
    prompt: FilledRun[];
    /** Answers beyond the card's blanks (e.g. Pick 1 questions, "Make a haiku."), shown underneath as written. */
    extraAnswers: AnswerRun[];
}

const OPENING_PUNCTUATION_AT_END = /[ \t"'“‘([{]+$/u;
const SENTENCE_BOUNDARY_AT_END = /(^|[.!?\n])$/u;
// Closing quotes/brackets and trademark marks may follow the final punctuation: `"Tweeting."`, `Relish.®`.
const TERMINAL_PUNCTUATION_AT_END = /[.!?…]["'”’»)\]®™]*$/u;
const SINGLE_TRAILING_PERIOD = /(?<!\.)\.(?=["'”’»)\]®™]*$)/u;
const LOWERCASE_START = /^([\s"'“‘([{]*)(\p{Ll})/u;

/** Fills blanks in order; missing answers leave their blanks in place (live preview while picking). */
export function fillBlackCard(blackText: string, answers: readonly string[]): FilledCard {
    const prompt: FilledRun[] = [];
    let dropNextPeriod = false;
    for (const run of parseCardText(blackText, { blanks: true })) {
        if (dropNextPeriod && run.kind === 'text' && run.text.startsWith('.')) {
            if (run.text.length > 1) prompt.push({ ...run, text: run.text.slice(1) });
            dropNextPeriod = false;
            continue;
        }
        dropNextPeriod = false;
        const answer = run.kind === 'blank' ? answers[run.index] : undefined;
        if (run.kind !== 'blank' || answer === undefined) {
            prompt.push(run);
            continue;
        }
        const runs = answerRuns(answer, startsSentence(prompt));
        prompt.push({ kind: 'answer', index: run.index, runs });
        dropNextPeriod = TERMINAL_PUNCTUATION_AT_END.test(toPlainText(runs));
    }
    const blanks = countBlanks(blackText);
    const extraAnswers = answers.slice(blanks).map((answer, i): AnswerRun => ({
        kind: 'answer',
        index: blanks + i,
        runs: parseCardText(answer.trim(), { blanks: false }),
    }));
    return { prompt, extraAnswers };
}

function startsSentence(before: readonly FilledRun[]): boolean {
    return SENTENCE_BOUNDARY_AT_END.test(toPlainText(before).replace(OPENING_PUNCTUATION_AT_END, ''));
}

/** An answer inside a blank loses one trailing period (an ellipsis stays) and is capitalised at a sentence start. */
function answerRuns(answer: string, sentenceStart: boolean): CardRun[] {
    const runs = parseCardText(answer.trim(), { blanks: false });
    const last = runs.at(-1);
    if (last?.kind === 'text' && SINGLE_TRAILING_PERIOD.test(last.text)) {
        last.text = last.text.replace(SINGLE_TRAILING_PERIOD, '');
        if (!last.text) runs.pop();
    }
    const first = runs.find((run): run is TextRun => run.kind === 'text');
    if (sentenceStart && first) {
        first.text = first.text.replace(
            LOWERCASE_START,
            (_match, lead: string, letter: string) => lead + letter.toUpperCase(),
        );
    }
    return runs;
}
