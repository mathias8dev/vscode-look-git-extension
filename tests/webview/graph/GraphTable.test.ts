import { describe, expect, it } from 'vitest';
import { getVisibleGraphRowRange } from '@webview/features/graph/graphVirtualization';

describe('GraphTable', () => {
    it('expands the rendered row range when the measured viewport grows', () => {
        expect(getVisibleGraphRowRange(50, 0, 24)).toEqual({
            firstVisible: 0,
            lastVisible: 9,
        });
        expect(getVisibleGraphRowRange(50, 0, 240)).toEqual({
            firstVisible: 0,
            lastVisible: 17,
        });
    });

    it('uses measured row height for large-font graph virtualization', () => {
        expect(getVisibleGraphRowRange(50, 0, 240, 35)).toEqual({
            firstVisible: 0,
            lastVisible: 15,
        });
    });
});
