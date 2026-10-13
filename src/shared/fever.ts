/** About this many black cards in all, so a game has enough prompts (GAME_DESIGN §13). */
const BLACK_CARDS_IN_ALL = 12;
const MIN_BLACK_EACH = 2;
const SPARE_WHITE = 3;

/** What each player writes in Custom Fever: a hand plus 3 white cards, and a share of about 12 black cards. */
export function feverQuota(players: number, handSize: number): { white: number; black: number } {
    return {
        white: handSize + SPARE_WHITE,
        black: Math.max(MIN_BLACK_EACH, Math.ceil(BLACK_CARDS_IN_ALL / Math.max(1, players))),
    };
}
