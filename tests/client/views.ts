import type { HostView, PlayerView, PublicPlayer } from '../../src/shared/views.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';

export function player(id: string, extra: Partial<PublicPlayer> = {}): PublicPlayer {
    return {
        id,
        name: id,
        avatar: 0,
        score: 0,
        connected: true,
        isVip: false,
        isCzar: false,
        hasSubmitted: false,
        inRound: true,
        ...extra,
    };
}

const COMMON = {
    game: 1,
    phase: 'SUBMITTING',
    lang: 'en',
    settings: DEFAULT_SETTINGS,
    deck: { white: 4351, black: 951, problem: null },
    players: [player('me'), player('czar', { isCzar: true })],
    serverNow: 0,
    catalogVersion: 0,
    phaseEndsAt: null,
    paused: false,
    pausedAt: null,
    round: {
        number: 1,
        czarId: 'czar',
        black: { text: '_.', pick: 1 },
        answeredCount: 0,
        expectedCount: 1,
        finale: false,
        announcements: [],
    },
    suddenDeath: null,
    rando: null,
    judging: null,
    result: null,
    gameOver: null,
    writing: null,
} as const satisfies Omit<HostView, 'network'>;

/** A phone's view mid-answer; override what the test is about. */
export function playerView(extra: Partial<PlayerView> = {}): PlayerView {
    return {
        ...COMMON,
        myId: 'me',
        hand: [],
        mySubmission: null,
        autoPlayed: false,
        canSubmit: true,
        myWritten: [],
        ...extra,
    };
}

/** The TV's view mid-answer; override what the test is about. */
export function hostView(extra: Partial<HostView> = {}): HostView {
    return {
        ...COMMON,
        network: { joinUrl: 'http://10.0.0.2:4242', qrSvg: '<svg/>', warning: null, host: 'windows' },
        ...extra,
    };
}
