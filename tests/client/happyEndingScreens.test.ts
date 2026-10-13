// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { resultScreen as tvResult } from '../../src/client/host/resultScreens.js';
import { adminBar, type AdminActions } from '../../src/client/host/adminBar.js';
import { introScreen as tvIntro } from '../../src/client/host/roundScreens.js';
import { resultScreen } from '../../src/client/phone/resultScreens.js';
import { introScreen } from '../../src/client/phone/roundScreens.js';
import { roundLabel } from '../../src/client/ui/gameText.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import type { RoundResultView, RoundView } from '../../src/shared/views.js';
import { phoneContext as context } from './phoneContext.js';
import { hostView, player, playerView } from './views.js';

setLanguage('en');

const players = [player('me', { name: 'Ana', score: 5 }), player('czar', { name: 'Bo', isCzar: true })];
const haikuRound: RoundView = {
    ...playerView().round!,
    number: 8,
    black: { text: 'Make a haiku.', pick: 3 },
    finale: true,
};
const meWon: RoundResultView = {
    kind: 'winner',
    winnerId: 'me',
    submissionId: 's1',
    submissions: [{ id: 's1', authorId: 'me', cards: [{ id: 'w1', text: 'Haiku' }] }],
};

const ADMIN = {
    pending: false,
    notice: null,
    confirmEnd: false,
    confirmStart: false,
    confirmLeave: null,
    feverName: null,
    sound: { muted: false, volume: 1 },
};
const adminActions = () => new Proxy({}, { get: () => vi.fn() }) as AdminActions;

describe('the Happy Ending on the screens', () => {
    it('is called the Happy Ending instead of a round number', () => {
        expect(roundLabel(playerView({ round: haikuRound }))).toBe('Happy Ending');
        expect(roundLabel(playerView())).toBe('Round 1');
    });

    it('is introduced as one last round, just for glory', () => {
        const tv = tvIntro(hostView({ phase: 'ROUND_START', players, round: haikuRound }));
        expect(tv.textContent).toContain('One last round, just for glory.');
        const phone = introScreen(playerView({ phase: 'ROUND_START', players, round: haikuRound }), context());
        expect(phone.textContent).toContain('One last round, just for glory.');
    });

    it('crowns a haiku winner without a point', () => {
        const tv = tvResult(hostView({ phase: 'ROUND_RESULT', players, round: haikuRound, result: meWon }), 0, null);
        expect(tv.querySelector('.tv-title')?.textContent).toBe('Ana wins the haiku');
        expect(tv.querySelector('.tv-plus-one')?.textContent).toBe('For glory');
        expect(tv.querySelector('.tv-new-score')).toBeNull();
        const phone = resultScreen(
            playerView({ phase: 'ROUND_RESULT', players, round: haikuRound, result: meWon }),
            context(),
        );
        expect(phone.querySelector('.screen-title')?.textContent).toBe('You won the haiku!');
        expect(phone.querySelector('.plus-one')?.textContent).toBe('For glory');
    });

    it('moves on to the final scores, not to another round', () => {
        const vip = [player('me', { name: 'Ana', isVip: true }), player('czar', { name: 'Bo', isCzar: true })];
        const result = { phase: 'ROUND_RESULT' as const, players: vip, result: meWon };
        const tvBar = adminBar(hostView({ ...result, round: haikuRound }), ADMIN, adminActions());
        expect(tvBar.textContent).toContain('Final scores');
        expect(tvBar.textContent).not.toContain('Next round');
        const phone = resultScreen(playerView({ ...result, round: haikuRound }), context());
        expect(phone.textContent).toContain('Final scores');
        expect(resultScreen(playerView(result), context()).textContent).toContain('Next round');
    });
});
