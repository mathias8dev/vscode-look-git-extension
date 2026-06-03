import type { WebviewFontSizeChangedPush } from '../../protocol/shared/ui';

export function isWebviewFontSizeMessage(message: unknown): message is WebviewFontSizeChangedPush {
    if (!message || typeof message !== 'object') { return false; }
    const record = message as Record<string, unknown>;
    return record.type === 'ui/fontSizeChanged'
        && typeof record.fontSize === 'number'
        && Number.isFinite(record.fontSize)
        && record.fontSize > 0;
}

export function applyWebviewFontSize(fontSize: number): void {
    if (!Number.isFinite(fontSize) || fontSize <= 0) { return; }
    const value = `${fontSize}px`;
    document.documentElement.style.setProperty('--look-git-font-size', value);
    document.documentElement.style.fontSize = value;
    if (document.body) {
        document.body.style.fontSize = value;
    }
    document.getElementById('root')?.style.setProperty('font-size', value);
    window.dispatchEvent(new CustomEvent('lookGitFontSizeChanged'));
}
