import { describe, expect, it } from 'vitest';
import { loadIconForName } from '@webview/shared/file-icon-assets';
import { vscodeIconCatalogVersion, vscodeIconNames } from '@webview/shared/vscode-icon-catalog.generated';

describe('vscode icon catalog', () => {
    it('exposes every vscode-icons 12.6.0 asset and alias', () => {
        expect(vscodeIconCatalogVersion).toBe('12.6.0');
        expect(vscodeIconNames).toHaveLength(1244);
        expect(new Set(vscodeIconNames)).toHaveLength(1244);
    });

    it('resolves every catalog entry to renderable SVG data', async () => {
        for (const name of vscodeIconNames) {
            const icon = await loadIconForName(name);
            expect(icon.body, name).toContain('<');
            expect(icon.width ?? 0, name).toBeGreaterThan(0);
            expect(icon.height ?? 0, name).toBeGreaterThan(0);
        }
    });
});
