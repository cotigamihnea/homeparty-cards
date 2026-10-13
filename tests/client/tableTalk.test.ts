// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { SPOTLIGHT_MS, spotlight, spotlightChange, tableTalk } from '../../src/client/host/tableTalk.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import { resetOnce } from '../../src/client/ui/motion.js';
import type { AnnouncementView } from '../../src/shared/views.js';
import { hostView, player } from './views.js';

setLanguage('en');

const players = [player('ana', { name: 'Ana' }), player('bo', { name: 'Bo' }), player('czar', { isCzar: true })];

function withTalk(announcements: AnnouncementView[]) {
    const view = hostView({ players });
    return hostView({ players, round: { ...view.round!, announcements } });
}

const confession: AnnouncementView = { kind: 'confession', playerId: 'ana', text: '<b>Bees?</b>', at: 10_000 };
const reboot: AnnouncementView = { kind: 'reboot', playerId: 'bo', at: 12_000 };

describe('tableTalk', () => {
    it('is not there while nobody has used a house rule', () => {
        expect(tableTalk(withTalk([]))).toBeNull();
    });

    it('logs what happened in one line each, newest first, the confessed card as text', () => {
        const log = tableTalk(withTalk([confession, reboot]))!;
        const lines = [...log.querySelectorAll('li')].map((li) => li.textContent);
        expect(lines).toEqual([
            expect.stringMatching(/Bo\s*rebooted the universe/),
            expect.stringMatching(/Ana\s*doesn't get “<b>Bees\?<\/b>”/),
        ]);
        expect(log.querySelector('b')?.textContent).not.toBe('Bees?');
    });

    it('brings each line in once, not again on every update', () => {
        resetOnce();
        const view = withTalk([reboot]);
        expect(tableTalk(view)!.querySelector('li')!.classList.contains('is-new')).toBe(true);
        expect(tableTalk(view)!.querySelector('li')!.classList.contains('is-new')).toBe(false);
    });
});

describe('spotlight', () => {
    it('puts the newest move in the middle of the screen for a few seconds', () => {
        const view = withTalk([confession]);
        const shown = spotlight(view, confession.at + 1_000)!;
        expect(shown.textContent).toContain("Ana doesn't get this one:");
        expect(shown.querySelector('.card-white .card-text')?.textContent).toBe('<b>Bees?</b>');
        expect(spotlight(view, confession.at + SPOTLIGHT_MS)).toBeNull();
        expect(spotlight(withTalk([]), 0)).toBeNull();
    });

    it('shows a reboot too, and only the newest move', () => {
        const shown = spotlight(withTalk([confession, reboot]), reboot.at + 100)!;
        expect(shown.textContent).toContain('Bo rebooted the universe');
        expect(shown.textContent).not.toContain('Ana');
    });

    it('stays away while answers are not being collected, or the game is paused', () => {
        const view = withTalk([reboot]);
        expect(spotlight({ ...view, phase: 'JUDGING' }, reboot.at)).toBeNull();
        expect(spotlight({ ...view, paused: true }, reboot.at)).toBeNull();
    });

    it('says when the screen next has to change: when the spotlight goes', () => {
        const view = withTalk([reboot]);
        expect(spotlightChange(view, reboot.at + 1_000)).toBe(SPOTLIGHT_MS - 1_000);
        expect(spotlightChange(view, reboot.at + SPOTLIGHT_MS)).toBeNull();
    });
});
