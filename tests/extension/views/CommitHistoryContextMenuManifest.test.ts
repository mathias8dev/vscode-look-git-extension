import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageJson {
    readonly contributes?: {
        readonly commands?: readonly { readonly command: string }[];
        readonly menus?: {
            readonly 'webview/context'?: readonly {
                readonly command: string;
                readonly when: string;
            }[];
        };
    };
}

describe('Commit History native context menu manifest', () => {
    it('delegates commit and file context menus to VS Code webview/context contributions', () => {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as PackageJson;
        const commands = new Set((pkg.contributes?.commands ?? []).map((entry) => entry.command));
        const webviewContextMenu = pkg.contributes?.menus?.['webview/context'] ?? [];

        expect(commands).toContain('lookGit.history.copyRevisionNumber');
        expect(commands).toContain('lookGit.history.explainDiff');
        expect(commands).toContain('lookGit.history.openFileDiff');
        expect(webviewContextMenu).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: 'lookGit.history.copyRevisionNumber',
                when: expect.stringContaining("webviewId == 'lookGit.commitHistory'"),
            }),
            expect.objectContaining({
                command: 'lookGit.history.explainDiff',
                when: expect.stringContaining("webviewSection == 'historyCommit'"),
            }),
            expect.objectContaining({
                command: 'lookGit.history.openFileDiff',
                when: expect.stringContaining("webviewSection == 'historyFile'"),
            }),
        ]));
    });
});
