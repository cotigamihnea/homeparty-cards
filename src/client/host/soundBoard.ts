import type { HostView } from '../../shared/views.js';
import { soundCues, type SoundName } from './soundCues.js';

/** How loud each sound is next to the others: the small table sounds sit under the jingles. */
export const SOUND_GAIN: Record<SoundName, number> = {
    join: 0.7,
    answered: 0.6,
    deal: 0.6,
    tick: 0.5,
    win: 1,
    gameOver: 1,
    shame: 1,
    skipped: 0.9,
    reboot: 0.9,
};

const MUTED_KEY = 'cah.sound.muted';
const VOLUME_KEY = 'cah.sound.volume';

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface SoundBoardOptions {
    play(sound: SoundName, volume: number): void;
    /** Where mute and volume are remembered (this laptop); null when storage is unavailable. */
    storage: SettingsStorage | null;
}

export interface SoundBoard {
    readonly muted: boolean;
    /** 0–1. */
    readonly volume: number;
    /** Plays the sounds of the moments this view shows that haven't played yet. */
    update(view: HostView, now: number): void;
    setMuted(muted: boolean): void;
    setVolume(volume: number): void;
    /** After a reconnect (maybe to a restarted server): forget what was heard, and take the next screen as heard. */
    reset(): void;
}

/**
 * The TV's sounds. Each moment plays once; whatever is already on screen when the page loads is taken as heard, so a
 * reload never replays a burst. Muted moments are heard too, so unmuting doesn't play them late.
 */
export function createSoundBoard(options: SoundBoardOptions): SoundBoard {
    const heard = new Set<string>();
    let primed = false;
    let muted = read(MUTED_KEY) === 'true';
    let volume = parseVolume(read(VOLUME_KEY));

    function read(key: string): string | null {
        try {
            return options.storage?.getItem(key) ?? null;
        } catch {
            return null;
        }
    }

    function write(key: string, value: string): void {
        try {
            options.storage?.setItem(key, value);
        } catch {
            // A private window or full storage: the setting just isn't remembered.
        }
    }

    return {
        get muted() {
            return muted;
        },
        get volume() {
            return volume;
        },
        update(view, now) {
            for (const cue of soundCues(view, now)) {
                if (heard.has(cue.key)) continue;
                heard.add(cue.key);
                if (primed && !muted && volume > 0) options.play(cue.sound, SOUND_GAIN[cue.sound] * volume);
            }
            primed = true;
        },
        setMuted(value) {
            muted = value;
            write(MUTED_KEY, String(value));
        },
        reset() {
            heard.clear();
            primed = false;
        },
        setVolume(value) {
            volume = Math.min(1, Math.max(0, value));
            write(VOLUME_KEY, String(volume));
        },
    };
}

function parseVolume(stored: string | null): number {
    if (stored === null) return 1;
    const value = Number(stored);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
}
