// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '@webview/platform/font-size';

describe('webview font size platform helper', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('style');
        document.body.removeAttribute('style');
        document.body.innerHTML = '<div id="root"></div>';
    });

    it('recognizes font size push messages', () => {
        expect(isWebviewFontSizeMessage({ type: 'ui/fontSizeChanged', fontSize: 18 })).toBe(true);
        expect(isWebviewFontSizeMessage({ type: 'ui/fontSizeChanged', fontSize: 0 })).toBe(false);
        expect(isWebviewFontSizeMessage({ type: 'ui/fontSizeChanged', fontSize: '18' })).toBe(false);
        expect(isWebviewFontSizeMessage({ type: 'graph/dataPush', fontSize: 18 })).toBe(false);
    });

    it('applies valid font sizes to the webview root elements', () => {
        let eventCount = 0;
        window.addEventListener('lookGitFontSizeChanged', () => { eventCount += 1; }, { once: true });

        applyWebviewFontSize(19);

        expect(document.documentElement.style.getPropertyValue('--look-git-font-size')).toBe('19px');
        expect(document.documentElement.style.fontSize).toBe('19px');
        expect(document.body.style.fontSize).toBe('19px');
        expect(document.getElementById('root')?.style.fontSize).toBe('19px');
        expect(eventCount).toBe(1);
    });

    it('ignores invalid font sizes', () => {
        applyWebviewFontSize(18);
        applyWebviewFontSize(0);
        applyWebviewFontSize(Number.NaN);

        expect(document.documentElement.style.getPropertyValue('--look-git-font-size')).toBe('18px');
    });
});
