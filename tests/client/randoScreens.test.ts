// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { scoreStrip } from '../../src/client/host/parts.js';
import { resultScreen as tvResult } from '../../src/client/host/resultScreens.js';
import { scoreList } from '../../src/client/phone/parts.js';
import { resultScreen } from '../../src/client/phone/resultScreens.js';
import { setLanguage } from '../../src/client/ui/i18n/index.js';
import { RANDO_ID } from '../../src/shared/constants.js';
import type { RoundResultView } from '../../src/shared/views.js';
import { phoneContext as context } from './phoneContext.js';
import { hostView, player, playerView } from './views.js';

setLanguage('en');

const players = [player('me', { name: 'Ana', score: 1 }), player('czar', { name: 'Bo', isCzar: true })];
const randoWon: RoundResultView = {
    kind: 'winner',
    winnerId: RANDO_ID,
    submissionId: 's1',
    submissions: [{ id: 's1', authorId: RANDO_ID, cards: [{ id: 'w1', text: 'Grandpa' }] }],
};

describe('Rando Cardrissian on the screens', () => {
    it('is in the scores on the TV and the phones, ranked by its points', () => {
        const tv = hostView({ players, rando: { score: 3 }, phase: 'ROUND_RESULT' });
        expect([...scoreStrip(tv).querySelectorAll('li')].map((li) => li.textContent)).toEqual([
            'Rando Cardrissian3',
            'AAna1',
            'BBo0',
        ]);
        const phone = playerView({ players, rando: { score: 3 } });
        expect(scoreList(phone).querySelectorAll('.score-row')).toHaveLength(3);
        expect(scoreList(phone).querySelector('.avatar.is-rando')).not.toBeNull();
    });

    it('winning a round shames everyone, on the TV and on the phones', () => {
        const tv = tvResult(
            hostView({ players, rando: { score: 1 }, phase: 'ROUND_RESULT', result: randoWon }),
            0,
            null,
        );
        expect(tv.querySelector('.tv-title')?.textContent).toBe('Rando Cardrissian wins the round');
        expect(tv.textContent).toContain('Everyone shares the shame.');
        const phone = resultScreen(
            playerView({ players, rando: { score: 1 }, phase: 'ROUND_RESULT', result: randoWon }),
            context(),
        );
        expect(phone.textContent).toContain('Everyone shares the shame.');
    });
});
