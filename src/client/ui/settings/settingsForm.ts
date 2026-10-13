import { LANGUAGES } from '../../../shared/constants.js';
import {
    BLANK_CARD_OPTIONS,
    GAME_MODES,
    HAND_SIZE_MAX,
    HAND_SIZE_MIN,
    POINTS_TO_WIN_OPTIONS,
    ROUND_LIMIT_OPTIONS,
    TIMER_OPTIONS,
    WRITING_MINUTES_OPTIONS,
    type HouseRuleSwitch,
    type Settings,
} from '../../../shared/settings.js';
import type { DeckSummary } from '../../../shared/views.js';
import { textButton } from '../button.js';
import { el } from '../dom.js';
import { t, translateReason } from '../i18n/index.js';
import { deckText, SWITCHES_BEFORE_BLANKS, timerText } from './summary.js';

export interface SettingsFormActions {
    onChange(patch: Partial<Settings>): void;
    onOpenPacks(): void;
}

interface Choice<V> {
    value: V;
    label: string;
    lang?: string;
}

/** A row of radio choices for one setting; picking one sends just that setting. */
function choiceGroup<K extends keyof Settings>(
    field: K,
    legend: string,
    choices: readonly Choice<Settings[K]>[],
    current: Settings[K],
    onChange: (patch: Partial<Settings>) => void,
    help?: string,
): HTMLElement {
    const name = `setting-${field}`;
    const helpId = `${name}-help`;
    return el('fieldset', { class: 'segments', attrs: help ? { 'aria-describedby': helpId } : {} }, [
        el('legend', { class: 'settings-label', text: legend }),
        help ? el('p', { class: 'settings-help', attrs: { id: helpId }, text: help }) : null,
        el(
            'div',
            { class: 'segments-row' },
            choices.map(({ value, label, lang }) => {
                const id = `${name}-${value ?? 'none'}`;
                const input = el('input', { class: 'segment-input', attrs: { type: 'radio', name, id } });
                input.checked = value === current;
                input.addEventListener('change', () => {
                    if (input.checked) onChange({ [field]: value } as Partial<Settings>);
                });
                return el('label', { class: 'segment', attrs: { for: id, ...(lang ? { lang } : {}) } }, [
                    input,
                    el('span', { text: label }),
                ]);
            }),
        ),
    ]);
}

/** A house rule as a switch: its name, and what it does underneath. The whole row is the tap target. */
function ruleSwitch(
    rule: HouseRuleSwitch,
    settings: Settings,
    onChange: (patch: Partial<Settings>) => void,
): HTMLElement {
    const id = `setting-${rule}`;
    const input = el('input', {
        class: 'switch-input',
        attrs: {
            type: 'checkbox',
            role: 'switch',
            id,
            'aria-labelledby': `${id}-name`,
            'aria-describedby': `${id}-help`,
        },
    });
    input.checked = settings[rule];
    input.addEventListener('change', () => onChange({ [rule]: input.checked }));
    return el('label', { class: 'house-rule', attrs: { for: id } }, [
        el('span', { class: 'house-rule-text' }, [
            el('span', { class: 'house-rule-name', attrs: { id: `${id}-name` }, text: t(`houseRules.${rule}`) }),
            el('span', { class: 'house-rule-help', attrs: { id: `${id}-help` }, text: t(`houseRules.${rule}Help`) }),
        ]),
        input,
    ]);
}

/** GAME_DESIGN §8, in its order: a switch per rule, and how many blank cards each hand starts with. */
function houseRules(settings: Settings, onChange: (patch: Partial<Settings>) => void): HTMLElement {
    const blanks = BLANK_CARD_OPTIONS.map((value) => ({
        value,
        label: value === 0 ? t('settings.off') : String(value),
    }));
    return el('fieldset', { class: 'house-rules' }, [
        el('legend', { class: 'settings-label', text: t('houseRules.title') }),
        ...SWITCHES_BEFORE_BLANKS.map((rule) => ruleSwitch(rule, settings, onChange)),
        choiceGroup(
            'blankCards',
            t('houseRules.blankCards'),
            blanks,
            settings.blankCards,
            onChange,
            t('houseRules.blankCardsHelp'),
        ),
        ruleSwitch('autoPlay', settings, onChange),
    ]);
}

const numberChoices = (values: readonly (number | null)[], noneLabel: string): Choice<number | null>[] =>
    values.map((value) => ({ value, label: value === null ? noneLabel : String(value) }));

/** Why the selected packs can't start a game, if they can't. */
export function deckProblemLine(deck: DeckSummary): HTMLElement | null {
    return deck.problem
        ? el('p', { class: 'deck-problem', attrs: { role: 'status' }, text: translateReason(deck.problem) })
        : null;
}

/** Every game setting the VIP (or the host laptop) can change in the lobby. */
export function settingsForm(settings: Settings, deck: DeckSummary, act: SettingsFormActions): HTMLElement {
    const handSizes = Array.from({ length: HAND_SIZE_MAX - HAND_SIZE_MIN + 1 }, (_, i) => HAND_SIZE_MIN + i);
    const timers = TIMER_OPTIONS.map((value) => ({ value, label: timerText(value) }));
    return el('div', { class: 'settings-form' }, [
        choiceGroup(
            'gameMode',
            t('settings.gameMode'),
            GAME_MODES.map((value) => ({ value, label: t(`settings.modes.${value}`) })),
            settings.gameMode,
            act.onChange,
            settings.gameMode === 'customFever' ? t('settings.feverHelp') : undefined,
        ),
        settings.gameMode === 'customFever'
            ? choiceGroup(
                  'writingMinutes',
                  t('settings.writingTime'),
                  numberChoices(WRITING_MINUTES_OPTIONS, t('settings.noTimeLimit')),
                  settings.writingMinutes,
                  act.onChange,
              )
            : null,
        choiceGroup(
            'pointsToWin',
            t('settings.pointsToWin'),
            numberChoices(POINTS_TO_WIN_OPTIONS, t('settings.unlimited')),
            settings.pointsToWin,
            act.onChange,
        ),
        settings.pointsToWin === null
            ? choiceGroup(
                  'roundLimit',
                  t('settings.rounds'),
                  numberChoices(ROUND_LIMIT_OPTIONS, t('settings.noRoundLimit')),
                  settings.roundLimit,
                  act.onChange,
              )
            : null,
        choiceGroup(
            'handSize',
            t('settings.handSize'),
            handSizes.map((value) => ({ value, label: String(value) })),
            settings.handSize,
            act.onChange,
        ),
        choiceGroup('submitSeconds', t('settings.submitTimer'), timers, settings.submitSeconds, act.onChange),
        choiceGroup('judgeSeconds', t('settings.judgeTimer'), timers, settings.judgeSeconds, act.onChange),
        houseRules(settings, act.onChange),
        choiceGroup(
            'language',
            t('settings.language'),
            LANGUAGES.map((value) => ({ value, label: t(`languages.${value}`), lang: value })),
            settings.language,
            act.onChange,
        ),
        el('section', { class: 'settings-packs' }, [
            el('h2', { class: 'settings-label', text: t('settings.packs') }),
            el('p', { class: 'settings-deck', text: deckText(settings.packIds.length, deck) }),
            deckProblemLine(deck),
            textButton(t('settings.choosePacks'), act.onOpenPacks, { ghost: true, attrs: { id: 'choose-packs' } }),
        ]),
    ]);
}
