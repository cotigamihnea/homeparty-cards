// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { gameHeader } from '../../src/client/phone/parts.js';
import { watchJudgingScreen } from '../../src/client/phone/judgingScreens.js';
import { gameOverScreen, resultScreen } from '../../src/client/phone/resultScreens.js';
import { answerScreen } from '../../src/client/phone/roundScreens.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import { resetOnce } from '../../src/client/ui/motion.js';
import { phoneContext as context } from './phoneContext.js';
import { player, playerView } from './views.js';

setLanguage('en');

const vipView = playerView({ players: [player('me', { isVip: true }), player('czar', { isCzar: true })] });

describe('phone parts', () => {
    it("the VIP's menu controls have ids, so focus comes back to them after a re-render", () => {
        for (const vipMenu of ['closed', 'open', 'confirm'] as const) {
            const header = gameHeader(vipView, context({ vipMenu }));
            const buttons = [...header.querySelectorAll('button')];
            expect(buttons.length).toBeGreaterThan(0);
            expect(buttons.filter((button) => !button.id)).toEqual([]);
        }
    });

    it('the big final rank punches in once, not again on every update', () => {
        resetOnce();
        const over = playerView({
            phase: 'GAME_OVER',
            round: null,
            gameOver: {
                winnerIds: ['czar'],
                standings: [{ playerId: 'me', score: 1, rank: 2 }],
                bestOf: [],
                fever: null,
            },
        });
        expect(gameOverScreen(over, context()).querySelector('.final-rank')?.classList.contains('is-entering')).toBe(
            true,
        );
        expect(gameOverScreen(over, context()).querySelector('.final-rank')?.classList.contains('is-entering')).toBe(
            false,
        );
    });

    it('offers Rebooting the Universe under the hand, and asks before spending the point', () => {
        const rich = playerView({
            settings: { ...DEFAULT_SETTINGS, rebootTheUniverse: true },
            players: [player('me', { score: 2 }), player('czar', { isCzar: true })],
            hand: [{ id: 'w1', text: 'A card' }],
        });
        const offered = answerScreen(rich, context(), false);
        expect(offered.querySelector('#reboot-hand')?.textContent).toContain('1 point');
        expect(
            answerScreen(playerView({ hand: rich.hand }), context(), false).querySelector('#reboot-hand'),
        ).toBeNull();

        const act = { ...context().act, reboot: vi.fn(), setHouseAction: vi.fn() };
        const asking = answerScreen(rich, context({ houseAction: { kind: 'reboot' }, act }), false);
        expect(asking.querySelector('#reboot-hand')).toBeNull();
        expect(asking.querySelector('.action-bar .confirm-question')?.textContent).toContain('1 point');
        asking.querySelector<HTMLButtonElement>('#reboot-yes')!.click();
        asking.querySelector<HTMLButtonElement>('#reboot-no')!.click();
        expect(act.reboot).toHaveBeenCalledOnce();
        expect(act.setHouseAction).toHaveBeenCalledWith(null);
    });

    it("Never Have I Ever: pick the card you don't get from the hand, then confess it", () => {
        const view = playerView({
            settings: { ...DEFAULT_SETTINGS, neverHaveIEver: true },
            hand: [
                { id: 'w1', text: 'A card' },
                { id: 'w2', text: 'Another card' },
            ],
        });
        const act = { ...context().act, setHouseAction: vi.fn(), toggleCard: vi.fn(), confess: vi.fn() };
        const offered = answerScreen(view, context({ act }), false);
        offered.querySelector<HTMLButtonElement>('#confess-start')!.click();
        expect(act.setHouseAction).toHaveBeenLastCalledWith({ kind: 'confess', cardId: null });

        const choosing = answerScreen(view, context({ act, houseAction: { kind: 'confess', cardId: null } }), false);
        expect(choosing.querySelector('#confess-start')).toBeNull();
        expect(choosing.querySelector('.hand')?.classList.contains('is-confessing')).toBe(true);
        expect(choosing.querySelector('#send-answer')).toBeNull();
        choosing.querySelectorAll<HTMLButtonElement>('.hand-card')[1]!.click();
        expect(act.setHouseAction).toHaveBeenLastCalledWith({ kind: 'confess', cardId: 'w2' });
        expect(act.toggleCard).not.toHaveBeenCalled();

        const confirming = answerScreen(view, context({ act, houseAction: { kind: 'confess', cardId: 'w2' } }), false);
        expect(confirming.querySelectorAll('.hand-card')[1]!.classList.contains('is-confessed')).toBe(true);
        expect(confirming.querySelector('.confirm-question')?.textContent).toContain('The TV will show it');
        confirming.querySelector<HTMLButtonElement>('#confess-yes')!.click();
        expect(act.confess).toHaveBeenCalledWith('w2');
    });

    it('offers no confession once one is made this round', () => {
        const base = playerView({
            settings: { ...DEFAULT_SETTINGS, neverHaveIEver: true },
            hand: [{ id: 'w1', text: 'A' }],
        });
        const used = playerView({
            ...base,
            round: { ...base.round!, announcements: [{ kind: 'confession', playerId: 'me', text: 'B', at: 1 }] },
        });
        expect(answerScreen(base, context(), false).querySelector('#confess-start')).not.toBeNull();
        expect(answerScreen(used, context(), false).querySelector('#confess-start')).toBeNull();
    });

    it('a blank card asks to be written on, then plays like any card with its words', () => {
        const view = playerView({
            settings: { ...DEFAULT_SETTINGS, blankCards: 1 },
            hand: [
                { id: 'w1', text: 'A card' },
                { id: 'blank-1', text: '', blank: true },
            ],
        });
        const act = { ...context().act, writeBlank: vi.fn(), toggleCard: vi.fn() };
        const fresh = answerScreen(view, context({ act }), false);
        const blank = fresh.querySelectorAll<HTMLButtonElement>('.hand-card')[1]!;
        expect(blank.classList.contains('is-blank')).toBe(true);
        expect(blank.textContent).toBe('Blank card. Tap to write your own answer.');
        blank.click();
        expect(act.writeBlank).toHaveBeenCalledWith('blank-1');

        const written = answerScreen(
            view,
            context({ act, selected: ['blank-1'], blankTexts: { 'blank-1': 'My own words' } }),
            false,
        );
        const card = written.querySelectorAll<HTMLButtonElement>('.hand-card')[1]!;
        expect(card.querySelector('.card-text')?.textContent).toBe('My own words');
        expect(written.querySelector('.card-black')?.textContent).toContain('My own words');
        card.click();
        expect(act.toggleCard).toHaveBeenCalledWith('blank-1');
        expect(act.writeBlank).toHaveBeenCalledOnce();
    });

    it('tells a player when the timer played a card for them, while judging and on the result', () => {
        const answer = [{ id: 'w1', text: 'Random card' }];
        const judging = playerView({ phase: 'JUDGING', mySubmission: answer, autoPlayed: true });
        const notice = 'Time ran out, so a random card was played for you.';
        expect(watchJudgingScreen(judging, context()).textContent).toContain(notice);
        expect(watchJudgingScreen({ ...judging, autoPlayed: false }, context()).textContent).not.toContain(notice);
        const result = playerView({
            phase: 'ROUND_RESULT',
            mySubmission: answer,
            autoPlayed: true,
            result: { kind: 'void', reason: 'CZAR_TIMEOUT' },
        });
        expect(resultScreen(result, context()).textContent).toContain(notice);
    });
});
