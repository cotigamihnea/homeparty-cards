import '../ui/base.css';
import '../ui/settings/settings.css';
import '../ui/decks/decks.css';
import './host.css';
import './tv-game.css';
import type { HostView } from '../../shared/views.js';
import { createClock } from '../ui/clock.js';
import { tickCountdowns } from '../ui/countdown.js';
import { el, requireElement } from '../ui/dom.js';
import { setLanguage, t } from '../ui/i18n/index.js';
import { resetOnNewGame } from '../ui/motion.js';
import { replaceContent } from '../ui/render.js';
import { nextRevealChange } from '../ui/reveal.js';
import type { Draft } from '../ui/decks/cardWriter.js';
import { createDeckEditor } from '../ui/decks/deckEditor.js';
import { saveFeverDeck, type LeaveChoice } from '../ui/feverSave.js';
import { createSettingsEditor } from '../ui/settings/editor.js';
import { connectToGame, createCommands } from '../ui/socket.js';
import { adminBar, kickButtons, type AdminActions } from './adminBar.js';
import { playSound, preloadSounds } from './audio.js';
import { decksDialog } from './decksDialog.js';
import { infoDialog, type InfoPage } from './infoDialog.js';
import { judgingScreen } from './judgingScreen.js';
import { lobbyScreen, type LobbyContext } from './lobby.js';
import type { KickButton } from './parts.js';
import { pauseOverlay } from './pauseOverlay.js';
import { gameOverScreen, resultScreen } from './resultScreens.js';
import { introScreen, submittingScreen } from './roundScreens.js';
import { settingsDialog, type SettingsDialogActions, type SettingsPage } from './settingsDialog.js';
import { createSoundBoard } from './soundBoard.js';
import { HELP_AFTER_MS, gameOverStage, helpDue, nextGameOverChange } from './stage.js';
import { spotlight, spotlightChange } from './tableTalk.js';
import { writingScreen } from './writingScreen.js';

type DialogPage = SettingsPage | InfoPage | 'decks';

const COUNTDOWN_TICK_MS = 250;
/** Re-render just after a change on screen is due, so nothing (the next answer, the next slide) shows early. */
const CHANGE_SLACK_MS = 20;

const root = requireElement('app');
const connectionBanner = requireElement('connection-status');
const lobby: LobbyContext = {
    qr: el('img', { class: 'join-qr', attrs: { width: '512', height: '512' } }),
    knownPlayerIds: new Set(),
};
const clock = createClock();
const sounds = createSoundBoard({ play: playSound, storage: settingsStorage() });
const admin = {
    enabled: false,
    pending: false,
    notice: null as string | null,
    confirmEnd: false,
    confirmStart: false,
    confirmLeave: null as LeaveChoice | null,
    feverName: null as Draft | null,
    dialog: null as DialogPage | null,
    /** The board itself: its mute and volume are always the current ones. */
    sound: sounds,
};
let view: HostView | null = null;
let qrSvg = '';
/** Where this laptop keeps its custom decks (the server says so to the laptop only). */
let decksFolder: string | null = null;
let changeTimer: ReturnType<typeof setTimeout> | null = null;
/** When this TV page first showed the current game's final scores: the reel's timeline starts there. */
let gameOverSince: { game: number; at: number } | null = null;
const help = { everJoined: false, shown: false, openedAt: null as number | null, openedByItself: false };
/** How long an empty lobby waits before offering the connection help (tests shorten it with ?helpAfter=ms). */
const HELP_AFTER = Number(new URLSearchParams(location.search).get('helpAfter')) || HELP_AFTER_MS;

const socket = connectToGame();
const commands = createCommands(socket, admin, render, 'host.serverLost');
const settingsEditor = createSettingsEditor(socket, commands, render);
const deckEditor = createDeckEditor(socket, commands, render, {
    notify(message) {
        admin.notice = message;
        render();
    },
});

const actions: AdminActions = {
    openSettings: () => showDialog('settings'),
    openDecks: () => showDialog('decks'),
    openHelp: () => showDialog('help'),
    openAbout: () => showDialog('about'),
    start: () => commands.admin('startGame'),
    askStartNow(confirm) {
        admin.confirmStart = confirm;
        render();
    },
    startNow() {
        admin.confirmStart = false;
        commands.admin('startNow');
    },
    advance: () => commands.admin('advance'),
    askEndGame(confirm) {
        admin.confirmEnd = confirm;
        render();
    },
    endGame() {
        admin.confirmEnd = false;
        commands.admin('endGame');
    },
    playAgain() {
        admin.confirmLeave = null;
        commands.admin('playAgain');
    },
    backToLobby() {
        admin.confirmLeave = null;
        commands.admin('backToLobby');
    },
    askLeave(choice) {
        admin.confirmLeave = choice;
        render();
    },
    setFeverName(draft) {
        admin.feverName = draft;
    },
    saveFever() {
        saveFeverDeck(commands, admin.feverName, () => {
            admin.feverName = null;
        });
    },
    kick: (playerId) => commands.send((timed, done) => timed.emit('kick', { playerId }, done)),
    toggleSound() {
        sounds.setMuted(!sounds.muted);
        render();
    },
    setVolume(volume) {
        sounds.setVolume(volume);
        render();
    },
};

/** Remembered sound settings live on this laptop; a private window may have no storage at all. */
function settingsStorage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

/** Only the laptop's own TV page plays sound, so a second screen never echoes it. */
function updateSounds(): void {
    if (admin.enabled && view) sounds.update(view, clock.now());
}

const dialogActions: SettingsDialogActions = {
    ...settingsEditor.act,
    close: () => showDialog(null),
    showPage: (page) => showDialog(page),
};

/** The host control that opened each panel, where the focus goes back when it closes. */
const OPENER: Record<DialogPage, string> = {
    settings: 'admin-settings',
    packs: 'admin-settings',
    decks: 'admin-decks',
    about: 'admin-about',
    help: 'admin-help',
};

/** Opens, switches or closes the laptop's panel (settings, about, help), moving the focus with it. */
function showDialog(page: DialogPage | null): void {
    const closing = admin.dialog;
    if (page !== 'decks') deckEditor.reset();
    admin.dialog = page;
    help.openedByItself = false;
    admin.notice = null;
    render();
    const target = page ? 'dialog-close' : closing ? OPENER[closing] : null;
    if (target) document.getElementById(target)?.focus();
}

function screenFor(current: HostView, kick: KickButton | null): HTMLElement {
    const now = clock.now();
    switch (current.phase) {
        case 'LOBBY':
            return lobbyScreen(current, lobby, kick);
        case 'WRITING':
            return writingScreen(current, now, kick);
        case 'ROUND_START':
            return introScreen(current);
        case 'SUBMITTING':
            return submittingScreen(current, now, kick);
        case 'JUDGING':
            return judgingScreen(current, now, kick);
        case 'ROUND_RESULT':
            return resultScreen(current, now, kick);
        case 'GAME_OVER':
            return gameOverScreen(current, gameOverStage(gameOverElapsed(current), current.gameOver!.bestOf.length));
    }
}

function dialogFor(current: HostView): HTMLElement | null {
    if (!admin.enabled || !admin.dialog || current.phase !== 'LOBBY') {
        admin.dialog = null;
        deckEditor.reset();
        return null;
    }
    if (admin.dialog === 'decks') {
        settingsEditor.ensureCatalog();
        return decksDialog({
            catalog: settingsEditor.context(current.settings).catalog,
            deck: { state: deckEditor.state, pending: admin.pending, act: deckEditor.act },
            notice: admin.notice,
            close: () => showDialog(null),
            retryCatalog: settingsEditor.act.retryCatalog,
            folder: decksFolder,
        });
    }
    if (admin.dialog === 'about' || admin.dialog === 'help') {
        return infoDialog(current, { page: admin.dialog, act: { close: () => showDialog(null) } });
    }
    if (admin.dialog === 'packs') settingsEditor.ensureCatalog();
    return settingsDialog(current, {
        ...settingsEditor.context(current.settings),
        page: admin.dialog,
        notice: admin.notice,
        act: dialogActions,
    });
}

function render(): void {
    if (!view) return;
    const kick = admin.enabled ? kickButtons(actions) : null;
    root.dataset.phase = view.phase;
    const layers = [
        screenFor(view, kick),
        spotlight(view, clock.now()),
        pauseOverlay(view),
        dialogFor(view),
        admin.enabled ? adminBar(view, admin, actions) : null,
    ];
    replaceContent(root, ...layers.filter((layer) => layer !== null));
    updateSounds();
    scheduleNextChange(view);
}

/**
 * The screen also moves on by itself, on time: the next answer read out, a house-rule move leaving the middle of the
 * screen, the final scores giving way to the best-of reel and slide to slide. Re-render when the first is due.
 */
function scheduleNextChange(current: HostView): void {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = null;
    const now = clock.now();
    const waits = [revealChange(current, now), spotlightChange(current, now), reelChange(current)].filter(
        (wait) => wait !== null,
    );
    if (waits.length > 0) changeTimer = setTimeout(render, Math.min(...waits) + CHANGE_SLACK_MS);
}

function revealChange(current: HostView, now: number): number | null {
    if (current.phase !== 'JUDGING' || !current.judging || current.paused) return null;
    return nextRevealChange(current.judging, now);
}

function reelChange(current: HostView): number | null {
    if (current.phase !== 'GAME_OVER' || !current.gameOver) return null;
    return nextGameOverChange(gameOverElapsed(current), current.gameOver.bestOf.length);
}

function gameOverElapsed(current: HostView): number {
    if (gameOverSince?.game !== current.game) gameOverSince = { game: current.game, at: Date.now() };
    return Date.now() - gameOverSince.at;
}

function updateQr(current: HostView): void {
    lobby.qr.alt = t('host.qrAlt', { url: current.network.joinUrl });
    if (current.network.qrSvg === qrSvg) return;
    qrSvg = current.network.qrSvg;
    lobby.qr.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`;
}

socket.on('connect', () => {
    connectionBanner.hidden = true;
    // Maybe a restarted server, whose games count from 1 again: start listening afresh (no replay of the screen).
    sounds.reset();
    socket.emit('hostHello', ({ admin: isAdmin, decksFolder: folder }) => {
        if (isAdmin && !admin.enabled) preloadSounds();
        admin.enabled = isAdmin;
        decksFolder = folder;
        render();
    });
});

socket.on('disconnect', () => {
    connectionBanner.textContent = t('host.serverLost');
    connectionBanner.hidden = false;
});

socket.on('hostView', (next) => {
    resetOnNewGame(view, next);
    clock.sync(next.serverNow);
    if (view?.phase !== next.phase) {
        admin.notice = null;
        admin.confirmEnd = false;
        admin.confirmStart = false;
        admin.confirmLeave = null;
        admin.feverName = null;
    }
    view = next;
    settingsEditor.syncCatalog(next.catalogVersion);
    deckEditor.sync(next.catalogVersion);
    watchForLostPhones(next);
    setLanguage(next.lang);
    updateQr(next);
    render();
});

/** Notes when the lobby first showed and whether any phone has joined, for the connection help. */
function watchForLostPhones(current: HostView): void {
    if (current.players.length > 0) help.everJoined = true;
    // The first phone is in: the help that opened by itself goes, uncovering the lobby (a panel the host opened stays).
    if (help.everJoined && help.openedByItself && admin.dialog === 'help') {
        admin.dialog = null;
        help.openedByItself = false;
    }
    if (current.phase === 'LOBBY' && help.openedAt === null) help.openedAt = Date.now();
}

/** The connection help opens by itself once on the laptop when the lobby stays empty (not over another panel). */
function offerHelp(): void {
    if (!admin.enabled || !view || admin.dialog) return;
    if (!helpDue({ ...help, phase: view.phase }, Date.now(), HELP_AFTER)) return;
    help.shown = true;
    showDialog('help');
    help.openedByItself = true;
}

document.addEventListener('keydown', (event) => {
    // An Escape a field already used (leaving a card's edit) doesn't also close the panel.
    if (event.key === 'Escape' && admin.dialog && !event.defaultPrevented) showDialog(null);
});

setInterval(() => {
    tickCountdowns(root, clock.now());
    updateSounds();
    offerHelp();
}, COUNTDOWN_TICK_MS);
