import * as vscode from 'vscode';
import { afterEach, describe, expect, it } from 'vitest';
import { runCommitCommand } from '@extension/commands/commit-commands';
import { openChangesBetweenRefs } from '@extension/commands/git-command-helpers';
import { registerGitBlobDocumentProvider } from '@extension/utils/git-blob-documents';
import { createComparisonFixture } from '@tests/helpers/comparison-fixture';
import { commands, resetMockVscode } from '@tests/mocks/vscode';

describe('compare selected commits', () => {
    afterEach(resetMockVscode);

    it('opens the native changes editor with both committed file versions, including renames, additions and deletions', async () => {
        const { repo, repository, ancestor, feature } = createComparisonFixture();
        const provider = registerGitBlobDocumentProvider();
        try {
            await runCommitCommand(repository, 'compareSelected', feature, [feature, ancestor],
                undefined, undefined, undefined, undefined, undefined, undefined, undefined, { repository });
            const call = commands.calls.find(entry => entry.command === 'vscode.changes');
            expect(call?.args[0]).toBe(`Compare ${ancestor.slice(0, 8)} → ${feature.slice(0, 8)}`);
            const resources = call?.args[1] as readonly (readonly [vscode.Uri, vscode.Uri, vscode.Uri])[]; // Native vscode.changes receives URI triples.
            expect(resources).toHaveLength(5);
            const contents = await Promise.all(resources.map(async ([file, left, right]) => ({
                path: file.fsPath.replaceAll('\\', '/').slice(repo.cwd.replaceAll('\\', '/').length + 1),
                left: (await vscode.workspace.openTextDocument(left)).getText(),
                right: (await vscode.workspace.openTextDocument(right)).getText(),
            })));
            expect(contents).toEqual(expect.arrayContaining([
                { path: 'src/edited.ts', left: 'before\n', right: 'after\nsecond\n' },
                { path: 'src/renamed.ts', left: 'export const original = true;\n', right: 'export const original = true;\n' },
                { path: 'src/deleted.ts', left: 'delete me\n', right: '' },
                { path: 'src/新しい file.ts', left: '', right: 'unicode\n' },
            ]));
            expect(repo.gitTrim(['branch', '--show-current'])).toBe('main');
            expect(repo.gitTrim(['status', '--porcelain'])).toBe('');
        } finally { provider.dispose(); repo.cleanup(); }
    });

    it('rejects invalid cardinality and prevents local or worktree comparisons from ignoring the selection', async () => {
        const { repo, repository, ancestor, feature } = createComparisonFixture();
        try {
            for (const hashes of [[feature], [feature, ancestor, 'HEAD']]) {
                await expect(runCommitCommand(repository, 'compareSelected', feature, hashes)).rejects.toThrow('Select exactly two commits');
            }
            for (const command of ['compareWithLocal', 'compareCommitWithWorktree'] as const) {
                await expect(runCommitCommand(repository, command, feature, [feature, ancestor])).rejects.toThrow('single selected commit');
            }
            expect(commands.calls.some(entry => entry.command === 'vscode.changes')).toBe(false);
        } finally { repo.cleanup(); }
    });

    it('does not open an editor after cancellation while loading files', async () => {
        const { repo, repository, ancestor, feature } = createComparisonFixture();
        const controller = new AbortController();
        try {
            await expect(openChangesBetweenRefs(repository, ancestor, feature, controller.signal, () => controller.abort())).rejects.toThrow();
            expect(commands.calls.some(entry => entry.command === 'vscode.changes')).toBe(false);
        } finally { repo.cleanup(); }
    });
});
