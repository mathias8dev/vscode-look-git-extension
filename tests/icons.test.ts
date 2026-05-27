import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
    getFileIconInfo,
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
        expect(renderFileTypeIcon('src/index.ts')).toContain('file-icon');
    });

    it('keeps file icon semantics centralized for special names and unknown extensions', () => {
        expect(getFileIconInfo('Dockerfile')).toEqual({ color: '#384d54', letter: 'Dk' });
        expect(getFileIconInfo('.env.local')).toEqual({ color: '#6a737d', letter: 'Ev' });
        expect(getFileIconInfo('archive.unknown')).toEqual({ color: '#6a737d', letter: 'F' });
    });

    it('centralizes extension host codicon labels', () => {
        expect(CODICON.commit).toBe('git-commit');
        expect(commitQuickPickLabel('abc1234')).toBe('$(git-commit) abc1234');
    });
});
