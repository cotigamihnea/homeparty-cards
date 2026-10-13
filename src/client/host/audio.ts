import answered from './sounds/answered.ogg';
import deal from './sounds/deal.ogg';
import gameOver from './sounds/game-over.ogg';
import join from './sounds/join.ogg';
import reboot from './sounds/reboot.ogg';
import shame from './sounds/shame.ogg';
import skipped from './sounds/skipped.ogg';
import tick from './sounds/tick.ogg';
import win from './sounds/win.ogg';
import type { SoundName } from './soundCues.js';

/** Bundled with the game (Kenney, CC0; see sounds/LICENSE.txt), so they play without internet. */
const SOURCES: Record<SoundName, string> = { join, answered, deal, tick, win, gameOver, shame, skipped, reboot };

/** Plays a sound; each play gets its own element, so quick sounds can overlap. A browser may refuse until a click. */
export function playSound(sound: SoundName, volume: number): void {
    const audio = new Audio(SOURCES[sound]);
    audio.volume = volume;
    audio.play().catch(() => {
        // Autoplay blocked until the first click on the page, or the device has no audio: stay quiet.
    });
}

/** Loads every sound up front, so the first time each one plays it isn't late. */
export function preloadSounds(): void {
    for (const source of Object.values(SOURCES)) {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = source;
    }
}
