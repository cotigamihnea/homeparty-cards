import { MIN_PLAYERS } from '../../shared/constants.js';
import type { HostView, PublicPlayer } from '../../shared/views.js';
import { textButton } from '../ui/button.js';
import { el } from '../ui/dom.js';
import { boundField, emptyDraft, type Draft } from '../ui/decks/cardWriter.js';
import { startNowQuestion, stillWriting } from '../ui/fever.js';
import { defaultFeverName, unsavedFever, type LeaveChoice } from '../ui/feverSave.js';
import { advanceText } from '../ui/gameText.js';
import { t } from '../ui/i18n/index.js';
import { closeIcon, soundIcon } from '../ui/icons.js';
import type { KickButton } from './parts.js';

export interface AdminActions {
    openSettings(): void;
    askStartNow(confirm: boolean): void;
    startNow(): void;
    askLeave(choice: LeaveChoice | null): void;
    setFeverName(draft: Draft): void;
    saveFever(): void;
    openDecks(): void;
    openHelp(): void;
    openAbout(): void;
    start(): void;
    advance(): void;
    askEndGame(confirm: boolean): void;
    endGame(): void;
    playAgain(): void;
    backToLobby(): void;
    kick(playerId: string): void;
    toggleSound(): void;
    /** 0–1. */
    setVolume(volume: number): void;
}

export interface AdminState {
    pending: boolean;
    notice: string | null;
    confirmEnd: boolean;
    /** Start now was tapped while someone is still writing (Custom Fever), and waits for a confirm. */
    confirmStart: boolean;
    /** Play again or Back to lobby was tapped while Custom Fever's cards are unsaved. */
    confirmLeave: LeaveChoice | null;
    /** The save field's name as typed (null: not touched, so the default name shows). */
    feverName: Draft | null;
    sound: { muted: boolean; volume: number };
}

/** Custom Fever's unsaved cards: a name and Save; Play again and Back to lobby ask first while they are unsaved. */
function gameOverButtons(view: HostView, state: AdminState, act: AdminActions): HTMLElement[] {
    const busy = state.pending;
    const choice = state.confirmLeave;
    if (choice) {
        return [
            el('span', { class: 'admin-question', text: t('fever.leaveConfirm') }),
            textButton(t(choice === 'playAgain' ? 'game.playAgain' : 'game.backToLobby'), () => leave(act, choice), {
                disabled: busy,
                danger: true,
            }),
            textButton(t('game.cancel'), () => act.askLeave(null), { ghost: true }),
        ];
    }
    const unsaved = unsavedFever(view.gameOver);
    const tap = (next: LeaveChoice) => (unsaved ? () => act.askLeave(next) : () => leave(act, next));
    return [
        ...(unsaved ? feverSave(state, act) : []),
        textButton(t('game.playAgain'), tap('playAgain'), { disabled: busy }),
        textButton(t('game.backToLobby'), tap('backToLobby'), { disabled: busy, ghost: true }),
    ];
}

function leave(act: AdminActions, choice: LeaveChoice): void {
    if (choice === 'playAgain') act.playAgain();
    else act.backToLobby();
}

function feverSave(state: AdminState, act: AdminActions): HTMLElement[] {
    const name = boundField(el('input', { class: 'admin-fever-name', attrs: { type: 'text', autocomplete: 'off' } }), {
        id: 'admin-fever-name',
        draft: state.feverName ?? emptyDraft(defaultFeverName()),
        onDraft: act.setFeverName,
        attrs: { 'aria-label': t('fever.nameLabel') },
        onEnter: act.saveFever,
    });
    return [
        name,
        textButton(t('fever.saveCards'), act.saveFever, { disabled: state.pending, attrs: { id: 'admin-fever-save' } }),
    ];
}

function buttonsFor(view: HostView, state: AdminState, act: AdminActions): HTMLElement[] {
    const busy = state.pending;
    if (state.confirmEnd) {
        return [
            el('span', { class: 'admin-question', text: t('game.endGameConfirm') }),
            textButton(t('game.endGameYes'), act.endGame, { disabled: busy, danger: true }),
            textButton(t('game.cancel'), () => act.askEndGame(false), { ghost: true }),
        ];
    }
    const endGame = textButton(t('game.endGame'), () => act.askEndGame(true), { disabled: busy, ghost: true });
    if (view.phase === 'WRITING' && state.confirmStart) {
        return [
            el('span', { class: 'admin-question', text: startNowQuestion(view) }),
            textButton(t('fever.startNow'), act.startNow, { disabled: busy, danger: true }),
            textButton(t('fever.keepWriting'), () => act.askStartNow(false), { ghost: true }),
        ];
    }
    switch (view.phase) {
        case 'LOBBY': {
            const connected = view.players.filter((player) => player.connected).length;
            return [
                textButton(t('help.title'), act.openHelp, { ghost: true, attrs: { id: 'admin-help' } }),
                textButton(t('host.about'), act.openAbout, { ghost: true, attrs: { id: 'admin-about' } }),
                textButton(t('host.settings'), act.openSettings, { ghost: true, attrs: { id: 'admin-settings' } }),
                textButton(t('decks.title'), act.openDecks, { ghost: true, attrs: { id: 'admin-decks' } }),
                textButton(t('host.startGame'), act.start, {
                    disabled: busy || connected < MIN_PLAYERS || view.deck.problem !== null,
                }),
            ];
        }
        case 'WRITING': {
            const ask = () => (stillWriting(view).length > 0 ? act.askStartNow(true) : act.startNow());
            return [
                textButton(t('fever.startNow'), ask, { disabled: busy, attrs: { id: 'admin-start-now' } }),
                endGame,
            ];
        }
        case 'ROUND_RESULT':
            return [textButton(advanceText(view), act.advance, { disabled: busy || view.paused }), endGame];
        case 'GAME_OVER':
            return gameOverButtons(view, state, act);
        default:
            return [endGame];
    }
}

/** Sound on or off (said in words, with the speaker drawn to match), and the volume. */
function soundControls(state: AdminState, act: AdminActions): HTMLElement {
    const on = !state.sound.muted;
    const toggle = el(
        'button',
        {
            class: 'btn btn-ghost admin-sound-toggle',
            attrs: { type: 'button', id: 'admin-sound', 'aria-label': t('host.sound'), 'aria-pressed': String(on) },
        },
        [soundIcon(on), el('span', { text: on ? t('host.soundOn') : t('host.soundOff') })],
    );
    toggle.addEventListener('click', act.toggleSound);
    const slider = el('input', {
        class: 'admin-volume',
        attrs: { type: 'range', id: 'admin-volume', min: '0', max: '100', step: '5', 'aria-label': t('host.volume') },
    });
    slider.value = String(Math.round(state.sound.volume * 100));
    slider.disabled = !on;
    // On release, not while dragging: a re-render mid-drag would drop the slider from under the pointer.
    slider.addEventListener('change', () => act.setVolume(Number(slider.value) / 100));
    return el('div', { class: 'admin-sound' }, [toggle, slider]);
}

/** The laptop's own controls; a TV screen opened from another device never shows them. */
export function adminBar(view: HostView, state: AdminState, act: AdminActions): HTMLElement {
    return el('nav', { class: 'admin-bar', attrs: { 'aria-label': t('host.adminTitle') } }, [
        el('span', { class: 'admin-title', text: t('host.adminTitle') }),
        soundControls(state, act),
        ...buttonsFor(view, state, act),
        state.notice ? el('span', { class: 'admin-notice', attrs: { role: 'alert' }, text: state.notice }) : null,
    ]);
}

export function kickButtons(act: AdminActions): KickButton {
    return (player: PublicPlayer) => {
        const button = el(
            'button',
            { class: 'kick-button', attrs: { type: 'button', 'aria-label': t('host.kick', { name: player.name }) } },
            [closeIcon()],
        );
        button.addEventListener('click', () => act.kick(player.id));
        return button;
    };
}
