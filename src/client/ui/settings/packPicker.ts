import type { PackKind, PackSummary } from '../../../shared/packs.js';
import type { DeckSummary } from '../../../shared/views.js';
import { textButton } from '../button.js';
import { el } from '../dom.js';
import { formatNumber, t } from '../i18n/index.js';
import type { SettingsEditContext } from './editor.js';
import { baseOnly, customOnly, officialOnly, packGroups, setGroup, togglePack, type PackGroup } from './packs.js';
import { deckProblemLine } from './settingsForm.js';
import { deckText } from './summary.js';

export interface PackPickerActions {
    onChange(packIds: string[]): void;
    /** A group was opened or folded away (kept across re-renders). */
    onToggleGroup(kind: PackKind, open: boolean): void;
}

function packRow(
    pack: PackSummary,
    catalog: readonly PackSummary[],
    selected: readonly string[],
    act: PackPickerActions,
): HTMLElement {
    const id = `pack-${pack.id}`;
    const input = el('input', { class: 'pack-check', attrs: { type: 'checkbox', id } });
    input.checked = selected.includes(pack.id);
    input.addEventListener('change', () => act.onChange(togglePack(catalog, selected, pack.id)));
    return el('li', {}, [
        el('label', { class: 'pack-row', attrs: { for: id } }, [
            input,
            el('span', { class: 'pack-name', text: pack.name }),
            el('span', {
                class: 'pack-count',
                text: t('packs.cardCounts', { white: formatNumber(pack.white), black: formatNumber(pack.black) }),
            }),
        ]),
    ]);
}

function groupHead(group: PackGroup, selected: readonly string[]): HTMLElement[] {
    const on = group.packs.filter((pack) => selected.includes(pack.id)).length;
    return [
        el('span', { class: 'pack-group-title', text: t(`packs.groups.${group.kind}`) }),
        el('span', { class: 'pack-group-count', text: t('packs.onCount', { on, total: group.packs.length }) }),
    ];
}

/** One kind of pack, folded away unless it was opened, with "All on" / "All off" and each pack's card counts. */
function groupSection(
    group: PackGroup,
    catalog: readonly PackSummary[],
    selected: readonly string[],
    open: boolean,
    act: PackPickerActions,
): HTMLElement {
    function setAll(on: boolean): void {
        act.onChange(setGroup(catalog, selected, group.kind, on));
    }
    const details = el('details', { class: 'pack-group', attrs: { 'data-kind': group.kind } }, [
        el('summary', { class: 'pack-group-head', attrs: { id: `packs-${group.kind}` } }, groupHead(group, selected)),
        el('div', { class: 'pack-group-toggles' }, [
            textButton(t('packs.allOn'), () => setAll(true), { ghost: true, attrs: { id: `packs-${group.kind}-on` } }),
            textButton(t('packs.allOff'), () => setAll(false), {
                ghost: true,
                attrs: { id: `packs-${group.kind}-off` },
            }),
        ]),
        el(
            'ul',
            { class: 'pack-list' },
            group.packs.map((pack) => packRow(pack, catalog, selected, act)),
        ),
    ]);
    details.open = open;
    details.addEventListener('toggle', () => {
        if (details.open !== open) act.onToggleGroup(group.kind, details.open);
    });
    return details;
}

/** Quick choices, the deck the selection makes (kept in view), then the packs grouped by kind. */
export function packPicker(
    catalog: readonly PackSummary[],
    selected: readonly string[],
    deck: DeckSummary,
    view: { openGroups: ReadonlySet<PackKind> },
    act: PackPickerActions,
): HTMLElement {
    return el('div', { class: 'pack-picker' }, [
        el('div', { class: 'pack-totals' }, [
            el('p', { class: 'pack-total', text: deckText(selected.length, deck) }),
            deckProblemLine(deck),
        ]),
        el('div', { class: 'pack-quick' }, [
            textButton(t('packs.officialOnly'), () => act.onChange(officialOnly(catalog)), {
                ghost: true,
                attrs: { id: 'packs-official-only' },
            }),
            textButton(t('packs.baseOnly'), () => act.onChange(baseOnly(catalog)), {
                ghost: true,
                attrs: { id: 'packs-base-only' },
            }),
            catalog.some((pack) => pack.kind === 'custom')
                ? textButton(t('packs.customOnly'), () => act.onChange(customOnly(catalog)), {
                      ghost: true,
                      attrs: { id: 'packs-custom-only' },
                  })
                : null,
        ]),
        ...packGroups(catalog).map((group) =>
            groupSection(group, catalog, selected, view.openGroups.has(group.kind), act),
        ),
    ]);
}

/** How a screen dresses the lines shown while the pack list is loading, or after it failed to load. */
export interface PackStatusStyle {
    hintClass?: string;
    /** A full-width "Try again" button, as on the phone. */
    blockButton?: boolean;
}

/** The pack picker once the pack list is in; until then a loading line, or the failure and a retry button. */
export function catalogPicker(ctx: SettingsEditContext, deck: DeckSummary, style: PackStatusStyle = {}): HTMLElement {
    const packs = ctx.catalog.packs;
    if (packs) {
        return packPicker(
            packs,
            ctx.settings.packIds,
            deck,
            { openGroups: ctx.openGroups },
            {
                onChange: (packIds) => ctx.act.changeSettings({ packIds }),
                onToggleGroup: ctx.act.toggleGroup,
            },
        );
    }
    if (ctx.catalog.failed) {
        return el('div', { class: 'panel-status' }, [
            el('p', { class: style.hintClass, text: t('packs.failed') }),
            textButton(t('packs.retry'), ctx.act.retryCatalog, { ghost: true, block: style.blockButton }),
        ]);
    }
    return el('p', { class: style.hintClass, attrs: { role: 'status' }, text: t('packs.loading') });
}
