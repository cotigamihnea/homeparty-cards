/** `custom`: one of the laptop's own decks (GAME_DESIGN §12). */
export type PackKind = 'custom' | 'base' | 'expansion' | 'themed' | 'fan';

/** One pack in the picker: its unique playable card counts. */
export interface PackSummary {
    id: string;
    name: string;
    kind: PackKind;
    white: number;
    black: number;
}
