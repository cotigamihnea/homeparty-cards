import { vi } from 'vitest';
import type { PhoneActions, PhoneContext } from '../../src/client/phone/parts.js';

/** A phone screen's context with nothing chosen yet and spy actions; override what the test is about. */
export function phoneContext(extra: Partial<PhoneContext> = {}): PhoneContext {
    const act = new Proxy({}, { get: () => vi.fn() }) as PhoneActions;
    return {
        now: 0,
        selected: [],
        pending: false,
        notice: null,
        vipMenu: 'closed',
        confirmPick: false,
        houseAction: null,
        blankTexts: {},
        confirmLeave: null,
        feverName: null,
        act,
        ...extra,
    };
}
