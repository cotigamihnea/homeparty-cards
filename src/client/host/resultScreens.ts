import type {
    AuthoredSubmissionView,
    BestOfView,
    HostView,
    RoundResultView,
    StandingView,
    VoidReason,
} from '../../shared/views.js';
import { RANDO_ID } from '../../shared/constants.js';
import { avatarBadge } from '../ui/avatars.js';
import { answerTexts, blackCardEl, whiteCardEl } from '../ui/cards.js';
import { celebrate } from '../ui/confetti.js';
import { classNames, el } from '../ui/dom.js';
import { findPlayer, playerName, roundWinnerText, voidReasonText, winnersTitle } from '../ui/gameText.js';
import { formatList, t } from '../ui/i18n/index.js';
import { entering } from '../ui/motion.js';
import { awayStrip, playerTag, scoreStrip, tvHeader, tvPage, type KickButton } from './parts.js';
import { podium, type GameOverStage, type PodiumStep } from './stage.js';

/** Second place stands left of the winner and third right, like a real podium. */
const PODIUM_ORDER = [2, 1, 3];
/** A big tie shows this many avatars on its step, then a "+N". */
const TIE_AVATARS = 4;
/** Up to this many answers or players get the roomy layout; more get more columns and smaller type. */
const ROOMY_MAX = 6;

type WinnerResult = Extract<RoundResultView, { kind: 'winner' }>;

/** ROUND_RESULT: the winning card on the prompt and who played it, or why the round was skipped. */
export function resultScreen(view: HostView, now: number, kick: KickButton | null): HTMLElement {
    const result = view.result!;
    const screen = result.kind === 'void' ? voidScreen(view, now, result.reason) : winnerScreen(view, now, result);
    screen.append(...[awayStrip(view, kick), scoreStrip(view)].filter((node) => node !== null));
    return screen;
}

/** A skipped round: the prompt goes back under the deck, and the TV says why. */
function voidScreen(view: HostView, now: number, reason: VoidReason): HTMLElement {
    const round = view.round!;
    return tvPage(classNames('tv-result-screen is-void', entering(`void-${round.number}`)), [
        tvHeader(view, now, t('game.roundSkipped')),
        el('main', { class: 'tv-void' }, [
            blackCardEl(round.black, { className: 'tv-card is-prompt is-returning' }),
            el('p', { class: 'tv-void-reason', text: voidReasonText(reason) }),
        ]),
    ]);
}

function winnerScreen(view: HostView, now: number, result: WinnerResult): HTMLElement {
    const round = view.round!;
    const winning = result.submissions.find((submission) => submission.id === result.submissionId);
    const moment = entering(`result-${round.number}`);
    if (moment) celebrate(round.number);
    const crowded = result.submissions.length > ROOMY_MAX && 'is-crowded';
    return tvPage(classNames('tv-result-screen', crowded, moment), [
        tvHeader(view, now, roundWinnerText(view, result.winnerId)),
        el('main', { class: 'tv-result-main' }, [
            el('div', { class: 'tv-table is-winning', attrs: { 'data-pick': String(round.black.pick) } }, [
                blackCardEl(round.black, { className: 'tv-card is-prompt' }),
                winning ? whiteCardEl(answerTexts(winning.cards), 'tv-card is-winner-card') : null,
            ]),
            el('div', { class: 'tv-result-side' }, [
                winnerPanel(view, result.winnerId, round.finale),
                allAnswers(view, result.submissions, result.submissionId),
            ]),
        ]),
    ]);
}

/** The round's winner takes the stage: their colour, name, the point and their new total (the haiku: glory). */
function winnerPanel(view: HostView, winnerId: string, finale: boolean): HTMLElement {
    const winner = findPlayer(view, winnerId);
    return el('div', { class: 'tv-winner' }, [
        winner ? avatarBadge(winner) : null,
        el('p', { class: 'tv-winner-name', text: playerName(view, winnerId) }),
        el('p', { class: 'tv-plus-one', text: finale ? t('game.forGlory') : t('host.plusOne') }),
        winner && !finale
            ? el('p', {
                  class: 'tv-new-score',
                  text: t('host.totalNow', { points: t('game.points', { count: winner.score }) }),
              })
            : null,
        winnerId === RANDO_ID ? el('p', { class: 'tv-shame', text: t('rando.shame') }) : null,
    ]);
}

/** Every answer of the round with its author, now that the round is over. */
function allAnswers(view: HostView, submissions: readonly AuthoredSubmissionView[], winningId: string): HTMLElement {
    return el('section', { class: 'tv-all-answers', attrs: { 'aria-label': t('host.everyAnswer') } }, [
        el('h2', { text: t('host.everyAnswer') }),
        el(
            'ul',
            { attrs: { 'data-many': String(submissions.length > ROOMY_MAX) } },
            submissions.map((submission, i) => {
                const isWinner = submission.id === winningId;
                return el('li', { class: isWinner ? 'is-winner' : '', attrs: { style: `--i: ${i}` } }, [
                    el('span', { class: 'tv-slip-head' }, [
                        playerTag(view, submission.authorId),
                        isWinner ? el('span', { class: 'tv-winner-tag', text: t('host.winnerTag') }) : null,
                    ]),
                    el('span', { class: 'tv-answer-text', text: answerTexts(submission.cards).join(' / ') }),
                ]);
            }),
        ),
    ]);
}

/** GAME_OVER: the podium and everyone's final score, then the game's best moments one by one, round and round. */
export function gameOverScreen(view: HostView, stage: GameOverStage): HTMLElement {
    if (stage.kind === 'reel') {
        const entry = view.gameOver!.bestOf[stage.index];
        if (entry) return reelSlide(view, entry, stage);
    }
    return podiumScreen(view, stage.cycle);
}

/** The podium for the top three ranks, then everyone's final score; the confetti only the first time. */
function podiumScreen(view: HostView, cycle: number): HTMLElement {
    const over = view.gameOver!;
    const steps = podium(over.standings);
    const order = PODIUM_ORDER.flatMap((rank) => steps.find((step) => step.rank === rank) ?? []);
    const moment = entering(`game-over-${view.game}-${cycle}`);
    if (moment && cycle === 0) celebrate(over.bestOf.length + 1000);
    return tvPage(classNames('tv-game-over-screen', moment), [
        el('header', { class: 'tv-header' }, [
            el('span', { class: 'tv-round', text: t('game.gameOver') }),
            el('h1', { class: 'tv-title', text: winnersTitle(view, over.winnerIds) }),
        ]),
        el('main', { class: 'tv-final' }, [
            el(
                'ol',
                { class: 'tv-podium' },
                order.map((step) => podiumStep(view, step)),
            ),
            finalScores(view, over.standings),
            over.fever?.savedAs
                ? el('p', { class: 'tv-fever-saved', text: t('fever.savedAs', { name: over.fever.savedAs }) })
                : null,
        ]),
    ]);
}

/** One of the game's winning combos: the prompt with the winning card beside it, who played it and in which round. */
function reelSlide(view: HostView, entry: BestOfView, stage: Extract<GameOverStage, { kind: 'reel' }>): HTMLElement {
    const total = view.gameOver!.bestOf.length;
    const winner = findPlayer(view, entry.winnerId);
    return tvPage(classNames('tv-result-screen tv-reel', entering(`reel-${view.game}-${stage.cycle}-${stage.index}`)), [
        el('header', { class: 'tv-header' }, [
            el('span', { class: 'tv-round', text: t('game.gameOver') }),
            el('h1', { class: 'tv-title', text: t('host.bestOf') }),
            el('span', { class: 'tv-reel-count', text: t('host.reelCount', { index: stage.index + 1, total }) }),
        ]),
        el('main', { class: 'tv-result-main' }, [
            el('div', { class: 'tv-table is-winning', attrs: { 'data-pick': String(entry.black.pick) } }, [
                blackCardEl(entry.black, { className: 'tv-card is-prompt' }),
                whiteCardEl(answerTexts(entry.cards), 'tv-card is-winner-card'),
            ]),
            el('div', { class: 'tv-result-side' }, [
                el('div', { class: 'tv-winner tv-reel-winner' }, [
                    winner ? avatarBadge(winner) : null,
                    el('p', { class: 'tv-winner-name', text: playerName(view, entry.winnerId) }),
                    el('p', { class: 'tv-new-score', text: t('game.round', { number: entry.round }) }),
                ]),
            ]),
        ]),
    ]);
}

/** Everyone's final score, in rank order. */
function finalScores(view: HostView, standings: readonly StandingView[]): HTMLElement {
    return el('section', { class: 'tv-final-scores', attrs: { 'aria-label': t('host.finalScores') } }, [
        el('h2', { text: t('host.finalScores') }),
        el(
            'ol',
            { class: 'tv-standings', attrs: { 'data-many': String(standings.length > ROOMY_MAX) } },
            standings.map((standing) =>
                el('li', {}, [
                    el('span', { class: 'tv-rank', text: `#${standing.rank}` }),
                    playerTag(view, standing.playerId),
                    el('span', { class: 'tv-score', text: String(standing.score) }),
                ]),
            ),
        ),
    ]);
}

/** One player stands on their step; tied players share it, avatars side by side and names listed. */
function podiumPlayers(view: HostView, playerIds: readonly string[]): HTMLElement {
    if (playerIds.length === 1) {
        const player = findPlayer(view, playerIds[0]);
        return el('div', { class: 'podium-player' }, [
            player ? avatarBadge(player) : null,
            el('span', { class: 'tv-player-name', text: playerName(view, playerIds[0]) }),
        ]);
    }
    const hidden = playerIds.length - TIE_AVATARS;
    return el('div', { class: 'podium-tie' }, [
        el('div', { class: 'podium-tie-avatars' }, [
            ...playerIds.slice(0, TIE_AVATARS).flatMap((id) => {
                const player = findPlayer(view, id);
                return player ? [avatarBadge(player)] : [];
            }),
            hidden > 0 ? el('span', { class: 'avatar podium-tie-more', text: `+${hidden}` }) : null,
        ]),
        el('span', { class: 'podium-tie-names', text: formatList(playerIds.map((id) => playerName(view, id))) }),
    ]);
}

function podiumStep(view: HostView, step: PodiumStep): HTMLElement {
    return el('li', { class: `podium-step is-rank-${step.rank}` }, [
        podiumPlayers(view, step.playerIds),
        el('div', { class: 'podium-block' }, [
            el('span', { class: 'podium-rank', text: `#${step.rank}` }),
            el('span', { class: 'podium-points', text: t('game.points', { count: step.score }) }),
        ]),
    ]);
}
