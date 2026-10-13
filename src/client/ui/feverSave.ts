import type { GameOverView } from '../../shared/views.js';
import type { Draft } from './decks/cardWriter.js';
import { formatShortDate, t } from './i18n/index.js';
import type { Commands } from './socket.js';

export type LeaveChoice = 'playAgain' | 'backToLobby';

/** Custom Fever's cards are still unsaved at the game over: leaving would throw them away. */
export function unsavedFever(over: GameOverView | null): boolean {
    return over?.fever?.savedAs === null;
}

/** "Custom Fever 13 Oct": the name the save form starts with. */
export function defaultFeverName(): string {
    return t('fever.defaultName', { date: formatShortDate(new Date()) });
}

/** Saves the cards under the typed name, or the default one when the field was never touched. */
export function saveFeverDeck(commands: Commands, typed: Draft | null, onSaved: () => void): void {
    const name = typed?.text ?? defaultFeverName();
    commands.send((timed, done) => timed.emit('saveFeverDeck', { name }, done), onSaved);
}
