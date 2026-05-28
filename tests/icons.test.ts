import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
    FILE_ICON_IDS,
    getFileIconId,
    ICON_BRANCH,
    ICON_INCOMING_CHANGES,
    renderFileTypeIcon,
} from '../src/icons/webviewIcons';
import { CODICON, commitQuickPickLabel } from '../src/icons/vscodeIcons';

function listSourceFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listSourceFiles(absolute));
        } else if (entry.isFile() && absolute.endsWith('.ts')) {
            files.push(absolute);
        }
    }

    return files;
}

describe('centralized icons', () => {
    it('keeps static webview SVG icons in the shared icon module', () => {
        const repoRoot = process.cwd();
        const allowed = new Set([
            path.join(repoRoot, 'src/icons/webviewIcons.ts'),
            path.join(repoRoot, 'src/webview/graphRenderer.ts'),
        ]);

        const offenders = listSourceFiles(path.join(repoRoot, 'src'))
            .filter((file) => !allowed.has(file))
            .filter((file) => fs.readFileSync(file, 'utf8').includes('<svg'))
            .map((file) => path.relative(repoRoot, file));

        expect(offenders).toEqual([]);
    });

    it('exposes reusable webview icons with the classes expected by the UI', () => {
        expect(ICON_BRANCH).toContain('tree-branch-icon');
        expect(ICON_INCOMING_CHANGES).toContain('branch-incoming-icon');
        const typescriptIcon = renderFileTypeIcon('src/index.ts');
        expect(typescriptIcon).toContain('file-icon');
        expect(typescriptIcon).toContain('data-icon="typescript"');
        expect(typescriptIcon).not.toContain('<text');
    });

    it('keeps file icon semantics centralized for special names and unknown extensions', () => {
        expect(getFileIconId('Dockerfile')).toBe('docker');
        expect(getFileIconId('.env.local')).toBe('dotenv');
        expect(getFileIconId('package.json')).toBe('npm');
        expect(getFileIconId('vite.config.ts')).toBe('vite');
        expect(getFileIconId('README.fr.md')).toBe('markdown');
        expect(getFileIconId('src/App.vue')).toBe('vue');
        expect(getFileIconId('assets/logo.svg')).toBe('svg');
        expect(getFileIconId('docs/spec.pdf')).toBe('pdf');
        expect(getFileIconId('archive.unknown')).toBe('file');
    });

    it('has matching packaged SVG assets for tree view file icons', () => {
        const repoRoot = process.cwd();
        const iconAssetDir = path.join(repoRoot, 'resources', 'file-icons');
        const expectedAssets = [...FILE_ICON_IDS, 'folder', 'folder-opened'];

        for (const iconId of expectedAssets) {
            const iconPath = path.join(iconAssetDir, `${iconId}.svg`);
            expect(fs.existsSync(iconPath), iconPath).toBe(true);
            expect(fs.readFileSync(iconPath, 'utf8')).not.toContain('<text');
        }
    });

    it('centralizes extension host codicon labels', () => {
        expect(CODICON.commit).toBe('git-commit');
        expect(commitQuickPickLabel('abc1234')).toBe('$(git-commit) abc1234');
    });
});
