import type { HouseRuleSwitch, Settings } from '../../../shared/settings.js';
import type { DeckSummary } from '../../../shared/views.js';
import { formatNumber, t } from '../i18n/index.js';

/** The house-rule switches listed before the number of blank cards (GAME_DESIGN §8 order); Auto-play comes after. */
export const SWITCHES_BEFORE_BLANKS: readonly HouseRuleSwitch[] = [
    'rebootTheUniverse',
    'randoCardrissian',
    'happyEnding',
    'neverHaveIEver',
];

export interface SummaryLine {
    label: string;
    value: string;
}

export function winText(settings: Settings): string {
    if (settings.pointsToWin !== null) return t('settings.firstTo', { count: settings.pointsToWin });
    if (settings.roundLimit !== null) return t('settings.afterRounds', { count: settings.roundLimit });
    return t('settings.noLimit');
}

export function timerText(seconds: number): string {
    return seconds === 0 ? t('settings.off') : t('settings.seconds', { count: seconds });
}

export function deckText(packCount: number, deck: DeckSummary): string {
    return t('settings.packsSummary', {
        count: packCount,
        white: formatNumber(deck.white),
        black: formatNumber(deck.black),
    });
}

/** The house rules that are on, by short name (it fits one line on the TV), in GAME_DESIGN §8 order; or "None". */
export function houseRulesText(settings: Settings): string {
    const names = [
        ...SWITCHES_BEFORE_BLANKS.filter((rule) => settings[rule]).map((rule) => t(`houseRules.short.${rule}`)),
        settings.blankCards > 0 ? t('houseRules.short.blankCards', { count: settings.blankCards }) : null,
        settings.autoPlay ? t('houseRules.short.autoPlay') : null,
    ].filter((name) => name !== null);
    return names.length > 0 ? names.join(', ') : t('houseRules.none');
}

/** Custom Fever and its writing time; a classic game says nothing about its mode. */
function modeLine(settings: Settings): SummaryLine[] {
    if (settings.gameMode !== 'customFever') return [];
    const value =
        settings.writingMinutes === null
            ? t('settings.feverNoLimit')
            : t('settings.feverMinutes', { count: settings.writingMinutes });
    return [{ label: t('settings.game'), value }];
}

/** The game's settings in words, as the TV lobby and the VIP's phone show them. */
export function settingsSummary(settings: Settings, deck: DeckSummary): SummaryLine[] {
    return [
        ...modeLine(settings),
        { label: t('settings.win'), value: winText(settings) },
        { label: t('settings.hand'), value: t('settings.handCards', { count: settings.handSize }) },
        { label: t('settings.submitTimer'), value: timerText(settings.submitSeconds) },
        { label: t('settings.judgeTimer'), value: timerText(settings.judgeSeconds) },
        { label: t('settings.language'), value: t(`languages.${settings.language}`) },
        { label: t('settings.packs'), value: deckText(settings.packIds.length, deck) },
        { label: t('houseRules.title'), value: houseRulesText(settings) },
    ];
}
