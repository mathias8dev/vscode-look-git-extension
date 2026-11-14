import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Manifest {
    readonly contributes: {
        readonly menus: {
            readonly 'webview/context': readonly { readonly command?: string; readonly when: string }[];
        };
    };
}

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as Manifest; // Repository-owned manifest has the VS Code contribution shape.
const menus = manifest.contributes.menus['webview/context'];

describe('selection-aware native context menus', () => {
    it.each([
        ['lookGit.graph.commit', 'graphCommitHasMultipleSelectedCommits', 'graphCommitSelectedCount'],
        ['lookGit.history', 'historyHasMultipleSelectedCommits', 'historySelectedCount'],
    ])('uses the selection cardinality for %s', (prefix, multiple, count) => {
        const condition = (action: string) => {
            const entry = menus.find(menu => menu.command === `${prefix}.${action}`);
            expect(entry, action).toBeDefined();
            return entry?.when;
        };
        expect(condition('compareSelected')).toContain(`${count} == 2`);
        for (const action of [
            'copyRevisionNumber', 'checkoutRevision', 'showRepositoryAtRevision', 'compareWithLocal',
            'compareCommitWithWorktree', 'newWorktreeFromCommit', 'resetCurrentBranchToHere', 'undoCommit',
            'editCommitMessage', 'fixup', 'interactiveRebaseFromHere', 'pushAllUpToHere', 'newBranch', 'newTag',
            'goToChildCommit', 'goToParentCommit',
        ]) {
            expect(condition(action)).toContain(`&& !${multiple}`);
        }
        expect(condition('squashInto')).toContain(`&& ${multiple}`);
        for (const action of ['createPatch', 'explainDiff', 'cherryPick', 'revertCommit', 'dropCommit']) {
            expect(condition(action)).not.toContain(multiple);
        }
    });

    it('shows only the pair comparison among branch actions when a pair is selected', () => {
        const branches = menus.filter(menu => menu.command?.startsWith('lookGit.graph.branch.'));
        expect(branches.find(menu => menu.command?.endsWith('.compareSelected'))?.when).toContain('&& graphBranchHasSelectedPair');
        for (const menu of branches.filter(menu => !menu.command?.endsWith('.compareSelected'))) {
            expect(menu.when, menu.command).toContain('&& !graphBranchHasSelectedPair');
        }
    });
});
