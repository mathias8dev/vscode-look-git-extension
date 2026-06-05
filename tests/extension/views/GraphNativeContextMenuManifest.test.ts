import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageJson {
    readonly contributes?: {
        readonly commands?: readonly { readonly command: string; readonly title: string }[];
        readonly menus?: {
            readonly 'webview/context'?: readonly {
                readonly command: string;
                readonly when: string;
                readonly group: string;
            }[];
        };
    };
}

describe('Graph native context menu manifest', () => {
    it('delegates commit, branch, and worktree graph menus to VS Code webview/context contributions', () => {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as PackageJson;
        const commands = new Set((pkg.contributes?.commands ?? []).map((entry) => entry.command));
        const webviewContextMenu = pkg.contributes?.menus?.['webview/context'] ?? [];

        for (const command of [
            'lookGit.graph.commit.copyRevisionNumber',
            'lookGit.graph.commit.explainDiff',
            'lookGit.graph.commit.goToParentCommit',
            'lookGit.graph.branch.checkout',
            'lookGit.graph.branch.removeBranchWorktree',
            'lookGit.graph.worktree.open',
            'lookGit.graph.worktree.showDetails',
            'lookGit.graph.worktree.removeForce',
        ]) {
            expect(commands.has(command)).toBe(true);
        }
        expect(webviewContextMenu).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: 'lookGit.graph.commit.copyRevisionNumber',
                when: "webviewId == 'lookGit.graphView' && webviewSection == 'graphCommit'",
            }),
            expect.objectContaining({
                command: 'lookGit.graph.commit.explainDiff',
                when: "webviewId == 'lookGit.graphView' && webviewSection == 'graphCommit'",
            }),
            expect.objectContaining({
                command: 'lookGit.graph.commit.undoCommit',
                when: "webviewId == 'lookGit.graphView' && webviewSection == 'graphCommit' && graphCommitCanUndoCommit",
            }),
            expect.objectContaining({
                command: 'lookGit.graph.branch.openBranchWorktree',
                when: "webviewId == 'lookGit.graphView' && webviewSection == 'graphBranch' && graphBranchHasWorktree",
            }),
            expect.objectContaining({
                command: 'lookGit.graph.branch.rename',
                when: "webviewId == 'lookGit.graphView' && webviewSection == 'graphBranch' && !graphBranchIsRemote",
            }),
            expect.objectContaining({
                command: 'lookGit.graph.worktree.showDiffWithMainWorktree',
                when: "webviewId == 'lookGit.graphView' && webviewSection == 'graphWorktree' && !graphWorktreeIsMain",
            }),
            expect.objectContaining({
                command: 'lookGit.graph.worktree.unlock',
                when: "webviewId == 'lookGit.graphView' && webviewSection == 'graphWorktree' && !graphWorktreeIsMain && graphWorktreeIsLocked",
            }),
        ]));
    });
});
