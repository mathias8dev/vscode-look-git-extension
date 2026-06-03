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
    document.documentElement.style.setProperty('--look-git-font-size', `${fontSize}px`);
}
