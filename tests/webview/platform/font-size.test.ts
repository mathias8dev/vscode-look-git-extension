// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '../../../src/webview/platform/font-size';

describe('webview font size platform helper', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('style');
    });

    it('recognizes font size push messages', () => {
        expect(isWebviewFontSizeMessage({ type: 'ui/fontSizeChanged', fontSize: 18 })).toBe(true);
        expect(isWebviewFontSizeMessage({ type: 'ui/fontSizeChanged', fontSize: 0 })).toBe(false);
        expect(isWebviewFontSizeMessage({ type: 'ui/fontSizeChanged', fontSize: '18' })).toBe(false);
        expect(isWebviewFontSizeMessage({ type: 'graph/dataPush', fontSize: 18 })).toBe(false);
    });

    it('applies valid font sizes to the root CSS variable', () => {
        applyWebviewFontSize(19);

        expect(document.documentElement.style.getPropertyValue('--look-git-font-size')).toBe('19px');
    });

    it('ignores invalid font sizes', () => {
        applyWebviewFontSize(18);
        applyWebviewFontSize(0);
        applyWebviewFontSize(Number.NaN);

        expect(document.documentElement.style.getPropertyValue('--look-git-font-size')).toBe('18px');
    });
});
