import { describe, expect, it } from 'vitest';
import { createSettingsEditor } from '../../src/client/ui/settings/editor.js';
import type { Commands, GameSocket } from '../../src/client/ui/socket.js';
import type { Ack } from '../../src/shared/events.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';

/** Commands whose updateSettings answers the test releases by hand, in order. */
function heldCommands() {
    const answers: (() => void)[] = [];
    const commands = {
        send(emit) {
            const timed = {
                emit: (_event: string, _payload: unknown, callback: (error: Error | null, response: Ack) => void) =>
                    answers.push(() => callback(null, { ok: true })),
            };
            emit(timed as never, () => {});
        },
        admin() {},
    } satisfies Commands;
    return { commands, answers };
}

describe('the settings editor', () => {
    it('fetches the pack list again when the views say the custom decks changed', async () => {
        const asked: string[] = [];
        const socket = {
            timeout: () => ({
                emitWithAck: async (event: string) => {
                    asked.push(event);
                    return [];
                },
            }),
        } as unknown as GameSocket;
        const editor = createSettingsEditor(socket, heldCommands().commands, () => {});
        editor.syncCatalog(1);
        editor.ensureCatalog();
        await Promise.resolve();
        await Promise.resolve();
        editor.syncCatalog(1);
        editor.syncCatalog(2);
        await Promise.resolve();
        expect(asked).toEqual(['listPacks', 'listPacks']);
    });

    it('shows a change at once, and drops it when the server has answered', () => {
        const { commands, answers } = heldCommands();
        const editor = createSettingsEditor({} as GameSocket, commands, () => {});
        editor.act.changeSettings({ handSize: 8 });
        expect(editor.context(DEFAULT_SETTINGS).settings.handSize).toBe(8);
        answers[0]!();
        expect(editor.context(DEFAULT_SETTINGS).settings.handSize).toBe(DEFAULT_SETTINGS.handSize);
    });

    it('keeps a second change on screen until its own answer is in', () => {
        const { commands, answers } = heldCommands();
        const editor = createSettingsEditor({} as GameSocket, commands, () => {});
        editor.act.changeSettings({ packIds: ['a'] });
        editor.act.changeSettings({ packIds: ['a', 'b'] });
        answers[0]!();
        const afterFirst = { ...DEFAULT_SETTINGS, packIds: ['a'] };
        expect(editor.context(afterFirst).settings.packIds).toEqual(['a', 'b']);
        answers[1]!();
        const afterBoth = { ...DEFAULT_SETTINGS, packIds: ['a', 'b'] };
        expect(editor.context(afterBoth).settings.packIds).toEqual(['a', 'b']);
    });
});
