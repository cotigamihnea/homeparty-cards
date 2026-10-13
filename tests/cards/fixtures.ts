import type { RawCardData } from '../../src/server/cards/loader.js';

export const TINY_DATA: RawCardData = {
    white: ['Being on fire.', 'being on fire', 'Bees?', '“Quotes” here.', '"Quotes" here', 'Fan card.', 'Base only.'],
    black: [
        { text: '_ is bad.', pick: 1 },
        { text: 'What is that?', pick: 1 },
        { text: 'One _, two _, red _, blue _.', pick: 4 },
        { text: '_ is BAD.', pick: 1 },
    ],
    packs: [
        { name: 'Weird Fan Pack', official: false, white: [5], black: [2] },
        { name: 'CAH: First Expansion', official: true, white: [2, 3], black: [1] },
        { name: 'Science Pack', official: true, white: [4], black: [] },
        { name: 'CAH Base Set', official: true, white: [0, 1, 6], black: [0, 3] },
        { name: 'Science Pack', official: true, white: [2], black: [] },
    ],
};
