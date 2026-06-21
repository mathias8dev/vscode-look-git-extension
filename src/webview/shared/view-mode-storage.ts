import { ViewMode } from '@webview/shared/view-mode';

export function readViewMode(storageKey: string, fallback: ViewMode): ViewMode {
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw === 'list') { return ViewMode.List; }
        if (raw === 'tree') { return ViewMode.Tree; }
        return fallback;
    } catch {
        return fallback;
    }
}

export function writeViewMode(storageKey: string, viewMode: ViewMode): void {
    try { localStorage.setItem(storageKey, viewMode === ViewMode.List ? 'list' : 'tree'); } catch {}
}
