import '../ui/base.css';
import './phone.css';
import '../ui/settings/settings.css';
import '../ui/decks/decks.css';
import type { Language } from '../../shared/constants.js';
import { validateName } from '../../shared/names.js';
import type { PlayerView, WhiteCardView } from '../../shared/views.js';
import { createClock } from '../ui/clock.js';
import { countdown, tickCountdowns } from '../ui/countdown.js';
import { requireElement } from '../ui/dom.js';
import { buzz } from '../ui/haptics.js';
import { setLanguage, t, translateReason } from '../ui/i18n/index.js';
import { once, resetOnNewGame } from '../ui/motion.js';
import { replaceContent } from '../ui/render.js';
import { timerLength } from '../ui/timer.js';
import type { Draft } from '../ui/decks/cardWriter.js';
import { createDeckEditor } from '../ui/decks/deckEditor.js';
import { saveFeverDeck, type LeaveChoice } from '../ui/feverSave.js';
import { createSettingsEditor } from '../ui/settings/editor.js';
import { ACK_TIMEOUT_MS, ackNotice, connectToGame, createCommands } from '../ui/socket.js';
import { openBlankWriter, type BlankWriter } from './blankWriter.js';
import { decksScreen } from './decksScreen.js';
import { createFeverWriter } from './feverWriter.js';
import { buildJoinScreen, type JoinScreen } from './joinScreen.js';
import { czarJudgingScreen, watchJudgingScreen } from './judgingScreens.js';
import {
    blackCard,
    me,
    pauseBanner,
    type HouseAction,
    type PhoneActions,
    type PhoneContext,
    type VipMenu,
} from './parts.js';
import {
    buzzMoment,
    choosableCards,
    lobbyPanel,
    phoneScreen,
    pruneSelection,
    selectionWith,
    toggleCard,
    wordsOn,
    type LobbyPanel,
} from './play.js';
import { reclaimSeat, type SeatApi, type SeatResult } from './reclaim.js';
import { createRejoiner } from './rejoin.js';
import { gameOverScreen, resultScreen } from './resultScreens.js';
import { answerScreen, answerSentScreen, czarWaitingScreen, introScreen, waitScreen } from './roundScreens.js';
import { forgetToken, loadSession, saveSession, type StoredSession } from './session.js';
import { packsScreen, playersScreen, settingsScreen, type PanelActions, type PanelContext } from './settingsScreens.js';
import { kickedScreen, reclaimingScreen, replacedScreen } from './statusScreens.js';
import { waitingScreen } from './waitingScreen.js';
import { writingScreen } from './writingScreen.js';

const REJOIN_RETRY_MS = 2000;
const REJOIN_ATTEMPTS = 15;
const COUNTDOWN_TICK_MS = 250;

const root = requireElement('app');
const connectionBanner = requireElement('connection-status');
const socket = connectToGame();
const clock = createClock();

let session: StoredSession = loadSession();
let view: PlayerView | null = null;
let ended: 'kicked' | 'replaced' | null = null;
let reclaiming = session.token !== null;
let joinScreen: JoinScreen | null = null;
let joinError: string | null = null;
let dealtCardFor: string | null = null;
let blankWriter: { cardId: string; writer: BlankWriter } | null = null;

/** Choices that stay on this phone until they are sent. */
const ui = {
    selected: [] as string[],
    editing: false,
    pending: false,
    notice: null as string | null,
    vipMenu: 'closed' as VipMenu,
    confirmPick: false,
    houseAction: null as HouseAction,
    blankTexts: {} as Record<string, string>,
    panel: null as LobbyPanel,
    confirmKick: null as string | null,
    confirmLeave: null as LeaveChoice | null,
    feverName: null as Draft | null,
};
const commands = createCommands(socket, ui, render, 'phone.cantReach');
const settingsEditor = createSettingsEditor(socket, commands, render);
const deckEditor = createDeckEditor(socket, commands, render, {
    notify(message) {
        ui.notice = message;
        render();
    },
});
const feverWriter = createFeverWriter(socket, commands, render, () => view?.myWritten ?? []);
/** The deck the editor showed last time, so opening or leaving a deck starts at the top of the page. */
let shownDeck: string | null = null;

function show(screen: HTMLElement): void {
    joinScreen = null;
    replaceContent(root, screen);
}

function render(): void {
    if (ended === 'kicked') return show(kickedScreen(joinAgain));
    if (ended === 'replaced') return show(replacedScreen(playHere));
    if (!view) {
        if (reclaiming) return show(reclaimingScreen());
        if (!joinScreen) showJoinScreen(session.name ?? '', joinError);
        return;
    }
    root.dataset.phase = view.phase;
    show(screenFor(view));
    const openDeck = ui.panel === 'decks' ? (deckEditor.state.open?.id ?? null) : null;
    if (openDeck !== shownDeck) window.scrollTo(0, 0);
    shownDeck = openDeck;
    // The writer covers the screen: it carries the countdown and any pause along.
    blankWriter?.writer.setStatus([countdown(view.phaseEndsAt, clock.now(), timerLength(view)), pauseBanner(view)]);
}

function screenFor(current: PlayerView): HTMLElement {
    const ctx: PhoneContext = {
        now: clock.now(),
        selected: ui.selected,
        pending: ui.pending,
        notice: ui.notice,
        vipMenu: ui.vipMenu,
        confirmPick: ui.confirmPick,
        houseAction: ui.houseAction,
        blankTexts: ui.blankTexts,
        confirmLeave: ui.confirmLeave,
        feverName: ui.feverName,
        act: actions,
    };
    switch (phoneScreen(current, ui.editing)) {
        case 'lobby':
            return lobbyScreen(current);
        case 'writing':
            return writingScreen(current, ctx, { state: feverWriter.state, pending: ui.pending, act: feverWriter.act });
        case 'intro':
            return introScreen(current, ctx);
        case 'czarWaiting':
            return czarWaitingScreen(current, ctx);
        case 'dealtInNext':
            return waitScreen(current, ctx, t('phone.dealtInNext'), t('phone.dealtInNextBody'));
        case 'sitOut':
            return waitScreen(current, ctx, t('phone.sitOut'), t('phone.sitOutBody'));
        case 'answer':
            return answerScreen(current, ctx, ui.editing);
        case 'answerSent':
            return answerSentScreen(current, ctx);
        case 'czarJudging':
            return czarJudgingScreen(current, ctx);
        case 'watchJudging':
            return watchJudgingScreen(current, ctx);
        case 'result':
            return resultScreen(current, ctx);
        case 'gameOver':
            return gameOverScreen(current, ctx);
    }
}

function lobbyScreen(current: PlayerView): HTMLElement {
    if (ui.panel) return panelFor(current, ui.panel);
    const dealIn = dealtCardFor !== current.myId;
    dealtCardFor = current.myId;
    return waitingScreen(current, {
        dealIn,
        notice: ui.notice,
        pending: ui.pending,
        onStart: () => commands.admin('startGame'),
        onOpenPanel: openPanel,
        onChooseAvatar: (avatar) => commands.send((timed, done) => timed.emit('setAvatar', { avatar }, done)),
    });
}

function panelFor(current: PlayerView, panel: Exclude<LobbyPanel, null>): HTMLElement {
    const ctx: PanelContext = {
        ...settingsEditor.context(current.settings),
        pending: ui.pending,
        notice: ui.notice,
        confirmKick: ui.confirmKick,
        act: panelActions,
    };
    switch (panel) {
        case 'settings':
            return settingsScreen(current, ctx);
        case 'packs':
            settingsEditor.ensureCatalog();
            return packsScreen(current, ctx);
        case 'players':
            return playersScreen(current, ctx);
        case 'decks':
            settingsEditor.ensureCatalog();
            return decksScreen({
                catalog: ctx.catalog,
                deck: { state: deckEditor.state, pending: ui.pending, act: deckEditor.act },
                notice: ui.notice,
                close: () => openPanel(null),
                retryCatalog: settingsEditor.act.retryCatalog,
            });
    }
}

function openPanel(panel: LobbyPanel): void {
    if (panel !== 'decks') deckEditor.reset();
    ui.panel = panel;
    ui.notice = null;
    ui.confirmKick = null;
    render();
    window.scrollTo(0, 0);
}

const panelActions: PanelActions = {
    ...settingsEditor.act,
    close: () => openPanel(null),
    openPacks: () => openPanel('packs'),
    closePacks: () => openPanel('settings'),
    passCrown: (playerId) => commands.send((timed, done) => timed.emit('transferVip', { playerId }, done)),
    askKick(playerId) {
        ui.confirmKick = playerId;
        render();
    },
    kick(playerId) {
        ui.confirmKick = null;
        commands.send((timed, done) => timed.emit('kick', { playerId }, done));
    },
};

const actions: PhoneActions = {
    toggleCard(cardId) {
        if (!view?.round) return;
        ui.selected = toggleCard(ui.selected, cardId, view.round.black.pick);
        ui.notice = null;
        buzz('tap');
        render();
    },
    writeBlank(cardId) {
        const round = view?.round;
        if (!round) return;
        blankWriter?.writer.close();
        const pick = round.black.pick;
        const answerWith = selectionWith(ui.selected, cardId, pick);
        const focusCard = () => document.getElementById(`card-${cardId}`)?.focus();
        const writer = openBlankWriter({
            initial: ui.blankTexts[cardId] ?? '',
            preview: (text) =>
                blackCard(
                    round.black,
                    answerWith.map((id) => (id === cardId ? text : answerText(id))),
                    'is-preview',
                ),
            onUse(text) {
                blankWriter = null;
                ui.blankTexts = { ...ui.blankTexts, [cardId]: text };
                ui.selected = selectionWith(ui.selected, cardId, pick);
                buzz('tap');
                render();
                focusCard();
            },
            onClose() {
                blankWriter = null;
                focusCard();
            },
        });
        blankWriter = { cardId, writer };
        render();
    },
    submit() {
        const cardIds = [...ui.selected];
        const blanks = cardIds.filter(isBlankCard).map((cardId) => ({ cardId, text: ui.blankTexts[cardId] ?? '' }));
        commands.send(
            (timed, done) => timed.emit('submitCards', { cardIds, blanks }, done),
            () => {
                ui.selected = [];
                ui.editing = false;
                buzz('sent');
            },
        );
    },
    editAnswer() {
        const answer = view?.mySubmission ?? [];
        ui.editing = true;
        ui.selected = answer.map((card) => card.id);
        // A written blank keeps its words while the answer is changed.
        for (const card of answer) if (card.blank) ui.blankTexts = { ...ui.blankTexts, [card.id]: card.text };
        render();
    },
    cancelEdit() {
        ui.editing = false;
        ui.selected = [];
        render();
    },
    setHouseAction(action) {
        ui.houseAction = action;
        ui.notice = null;
        render();
    },
    reboot() {
        ui.houseAction = null;
        // The new hand's view drops the old cards from the selection (pruneSelection).
        commands.send(
            (timed, done) => timed.emit('rebootHand', done),
            () => buzz('sent'),
        );
    },
    confess(cardId) {
        ui.houseAction = null;
        commands.send(
            (timed, done) => timed.emit('discardCard', { cardId }, done),
            () => buzz('sent'),
        );
    },
    highlight(submissionId) {
        ui.confirmPick = false;
        commands.send((timed, done) => timed.emit('czarHighlight', { submissionId }, done));
    },
    askPick(confirm) {
        ui.confirmPick = confirm;
        render();
    },
    pick(submissionId) {
        ui.confirmPick = false;
        commands.send((timed, done) => timed.emit('czarPick', { submissionId }, done));
    },
    advance: () => commands.admin('advance'),
    setVipMenu(menu) {
        ui.vipMenu = menu;
        render();
    },
    endGame() {
        ui.vipMenu = 'closed';
        commands.admin('endGame');
    },
    playAgain() {
        ui.confirmLeave = null;
        commands.admin('playAgain');
    },
    backToLobby() {
        ui.confirmLeave = null;
        commands.admin('backToLobby');
    },
    askLeave(choice) {
        ui.confirmLeave = choice;
        render();
    },
    setFeverName(draft) {
        ui.feverName = draft;
    },
    saveFever() {
        saveFeverDeck(commands, ui.feverName, () => {
            ui.feverName = null;
        });
    },
};

/** A new round or phase starts with a clean slate on this phone. */
function resetRoundUi(previous: PlayerView | null, next: PlayerView): void {
    const samePhase = previous?.phase === next.phase;
    const sameRound = previous?.round?.number === next.round?.number;
    if (samePhase && sameRound) return;
    ui.notice = null;
    ui.vipMenu = 'closed';
    ui.confirmPick = false;
    ui.houseAction = null;
    ui.confirmLeave = null;
    ui.feverName = null;
    if (next.phase !== 'SUBMITTING' || !sameRound) {
        ui.selected = [];
        ui.editing = false;
        ui.blankTexts = {};
    }
}

/** The cards this phone may answer with (none without a view). */
function choosable(current: PlayerView | null): WhiteCardView[] {
    return current ? choosableCards(current) : [];
}

function isBlankCard(cardId: string): boolean {
    return choosable(view).some((card) => card.id === cardId && card.blank === true);
}

/** A card's words in this phone's answer: a blank shows what the player wrote on it. */
function answerText(cardId: string): string {
    const card = choosable(view).find((c) => c.id === cardId);
    return card ? wordsOn(card, ui.blankTexts) : '';
}

/** The blank writer closes when answering is over for this phone, or the card is gone. */
function closeStaleBlankWriter(current: PlayerView | null): void {
    if (!blankWriter) return;
    const answering = current?.phase === 'SUBMITTING' && current.canSubmit;
    if (answering && choosable(current).some((card) => card.id === blankWriter?.cardId)) return;
    blankWriter.writer.close();
    blankWriter = null;
}

function rememberSeat(token: string | null, name: string | null): void {
    session = { token, name };
    saveSession(session);
}

function forgetSeat(): void {
    session = { ...session, token: null };
    forgetToken();
}

function showJoinScreen(initialName: string, error: string | null = null): void {
    joinScreen = buildJoinScreen(root, { initialName, onSubmit: submitJoin });
    joinScreen.showError(error);
}

function applyLanguage(lang: Language): void {
    if (!setLanguage(lang)) return;
    if (joinScreen) showJoinScreen(joinScreen.value);
}

function submitJoin(rawName: string): void {
    const check = validateName(rawName);
    if (!check.ok) {
        joinScreen?.showError(translateReason(check.reason));
        return;
    }
    joinScreen?.setPending(true);
    socket.timeout(ACK_TIMEOUT_MS).emit('join', { name: check.name }, (error, response) => {
        if (!error && response.ok) {
            joinError = null;
            rememberSeat(response.sessionToken, check.name);
            return;
        }
        joinScreen?.setPending(false);
        joinScreen?.showError(ackNotice(error, response, t('phone.cantReach')));
    });
}

function asSeatResult(error: Error | null, response: SeatResult): SeatResult {
    return error ? { ok: false, reason: 'TIMEOUT' } : response;
}

const seatApi: SeatApi = {
    resume: (sessionToken, done) =>
        socket
            .timeout(ACK_TIMEOUT_MS)
            .emit('resume', { sessionToken }, (error, response) => done(asSeatResult(error, response))),
    join: (name, done) =>
        socket.timeout(ACK_TIMEOUT_MS).emit('join', { name }, (error, response) => done(asSeatResult(error, response))),
};

/** After a reconnect (phone woke up, Wi-Fi blipped, page reloaded) the phone takes its seat back by itself. */
const rejoiner = createRejoiner<StoredSession>({
    attempt: (target, done) =>
        reclaimSeat(seatApi, target, (result) => {
            if (result.ok) rememberSeat(result.sessionToken, target.name);
            done(result);
        }),
    schedule: (retry, delayMs) => {
        const timer = setTimeout(retry, delayMs);
        return () => clearTimeout(timer);
    },
    onGiveUp: (_target, reason) => {
        reclaiming = false;
        view = null;
        if (reason === 'KICKED') {
            ended = 'kicked';
            forgetSeat();
        } else {
            joinError = reason === 'TIMEOUT' ? t('phone.cantReach') : translateReason(reason);
        }
        render();
    },
    retryMs: REJOIN_RETRY_MS,
    maxAttempts: REJOIN_ATTEMPTS,
});

function joinAgain(): void {
    ended = null;
    joinError = null;
    if (!socket.connected) socket.connect();
    render();
}

function playHere(): void {
    ended = null;
    reclaiming = true;
    render();
    socket.connect();
}

socket.on('serverHello', ({ lang }) => {
    applyLanguage(lang);
    render();
});

socket.on('playerView', (next) => {
    resetOnNewGame(view, next);
    clock.sync(next.serverNow);
    const moment = buzzMoment(next);
    if (moment && once(moment.key)) buzz(moment.kind);
    resetRoundUi(view, next);
    // A reboot or a confession swaps cards out of the hand: they can't stay chosen.
    ui.selected = pruneSelection(ui.selected, next);
    // A lobby panel closes for good once the game starts or the crown goes to someone else.
    ui.panel = lobbyPanel(next, ui.panel);
    if (ui.panel !== 'decks') deckEditor.reset();
    settingsEditor.syncCatalog(next.catalogVersion);
    deckEditor.sync(next.catalogVersion);
    if (next.phase !== 'WRITING') feverWriter.reset();
    view = next;
    closeStaleBlankWriter(next);
    reclaiming = false;
    const name = me(next)?.name ?? null;
    if (name && name !== session.name) rememberSeat(session.token, name);
    applyLanguage(next.lang);
    render();
});

socket.on('kicked', () => {
    ended = 'kicked';
    view = null;
    closeStaleBlankWriter(null);
    rejoiner.stop();
    forgetSeat();
    render();
});

socket.on('replaced', () => {
    ended = 'replaced';
    view = null;
    closeStaleBlankWriter(null);
    rejoiner.stop();
    render();
});

socket.on('connect', () => {
    connectionBanner.hidden = true;
    if (session.token && !ended) {
        reclaiming = view === null;
        rejoiner.start(session);
        render();
    }
});

socket.on('disconnect', () => {
    rejoiner.stop();
    if (ended) return;
    connectionBanner.textContent = t('phone.reconnecting');
    connectionBanner.hidden = false;
});

// The whole page, so the blank writer's countdown (outside #app) ticks too.
setInterval(() => tickCountdowns(document.body, clock.now()), COUNTDOWN_TICK_MS);
render();
