import type { BlankAnswer } from '../../shared/blanks.js';
import type { CardColor } from '../../shared/customCards.js';
import type { Settings } from '../../shared/settings.js';
import type { BlackCardRef } from './state.js';

/** Who asked for an admin action: a phone (must be the VIP) or the host laptop. */
export type Actor = { kind: 'player'; playerId: string } | { kind: 'host' };

/** The selected packs as card ids, built by the net layer from the library. */
export interface DealtDeck {
    white: string[];
    black: BlackCardRef[];
    /** "Make a haiku.", kept for the Happy Ending house rule (null if the library has no such card). */
    haiku?: BlackCardRef | null;
    /** Some selected pack is a custom deck: the smaller deck minimum applies (GAME_DESIGN §3). */
    custom?: boolean;
}

export type Action =
    | { type: 'PLAYER_JOINED'; playerId: string; name: string; now: number }
    | { type: 'PLAYER_DISCONNECTED'; playerId: string; now: number }
    | { type: 'PLAYER_RECONNECTED'; playerId: string; now: number }
    | { type: 'KICK_PLAYER'; by: Actor; playerId: string; now: number }
    | { type: 'TRANSFER_VIP'; by: Actor; playerId: string }
    | { type: 'SET_AVATAR'; playerId: string; avatar: number }
    | { type: 'UPDATE_SETTINGS'; by: Actor; settings: Partial<Settings> }
    | { type: 'START_GAME'; by: Actor; deck: DealtDeck; seed: number; now: number }
    | { type: 'SUBMIT_CARDS'; playerId: string; cardIds: string[]; blanks?: BlankAnswer[]; now: number }
    | { type: 'REBOOT_HAND'; playerId: string; now: number }
    | { type: 'DISCARD_CARD'; playerId: string; cardId: string; now: number }
    | { type: 'CZAR_HIGHLIGHT'; playerId: string; submissionId: string }
    | { type: 'CZAR_PICK'; playerId: string; submissionId: string; now: number }
    | { type: 'ADVANCE'; by: Actor; now: number }
    | { type: 'END_GAME'; by: Actor; now: number }
    | { type: 'PLAY_AGAIN'; by: Actor; deck: DealtDeck; seed: number; now: number }
    | { type: 'BACK_TO_LOBBY'; by: Actor }
    | { type: 'TICK'; now: number }
    // Custom Fever (GAME_DESIGN §13).
    | { type: 'WRITE_CARD'; playerId: string; color: CardColor; text: string; now: number }
    | { type: 'EDIT_WRITTEN_CARD'; playerId: string; cardId: string; text: string }
    | { type: 'REMOVE_WRITTEN_CARD'; playerId: string; cardId: string }
    | { type: 'START_NOW'; by: Actor; now: number }
    | { type: 'FEVER_SAVED'; by: Actor; name: string };
