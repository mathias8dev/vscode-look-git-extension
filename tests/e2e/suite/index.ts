import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { ChangesMessageRouter } from '../../../src/extension/messaging/ChangesMessageRouter';
import { GraphMessageRouter } from '../../../src/extension/messaging/GraphMessageRouter';
import type { ActiveRepositoryAccessor } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
import type { ChangesExtensionToWebviewMessage } from '../../../src/protocol/changes/messages';
import { ConflictState } from '../../../src/protocol/changes/types';
import type { GraphDataResponse, GraphExtensionToWebviewMessage, WorktreeDetailsResponse } from '../../../src/protocol/graph/messages';
import { createInitialGraphState, reduceGraphState } from '../../../src/webview/features/graph/graphState';
import { addLinkedWorktree, createBareGitRepo, createTempGitRepo, FIXTURE_AUTHORS, type TempGitRepo } from '../../helpers/gitRepo';
import { getFixtureRepoPath, gitFixtureOutput } from '../../helpers/fixtureRepo';
import { findFloatingNodeIssues, findLaneContinuityIssues } from '../../helpers/graphLayoutAssertions';
import { runTestCases } from '../../helpers/testRunner';

export function run(): Promise<void> {
    return runTestCases('Look Git E2E', [
        {
            name: 'opens the Look Git Activity Bar views',
            run: async () => {
                await vscode.commands.executeCommand('workbench.view.extension.look-git');
                await vscode.commands.executeCommand('lookGit.changesView.focus');
                await vscode.commands.executeCommand('lookGit.commitHistory.focus');
                const commands = await vscode.commands.getCommands(true);
                assert.ok(commands.includes('lookGit.changesView.focus'));
                assert.ok(commands.includes('lookGit.commitHistory.focus'));
            },
        },
        {
            name: 'finds the fixture repository used for submodule E2E coverage',
            run: async () => {
                const fixturePath = getFixtureRepoPath();
                if (!fixturePath) {
                    console.log('  skip fixture workspace assertion: fixture repo is absent');
                    return;
                }
                assert.ok(fs.existsSync(path.join(fixturePath, '.git')));
            },
        },
        {
            name: 'focuses Changes against the dirty fixture repository with submodules',
            run: async () => {
                const fixturePath = getFixtureRepoPath();
                if (!fixturePath) {
                    console.log('  skip dirty fixture assertion: fixture repo is absent');
                    return;
                }
                await vscode.commands.executeCommand('workbench.view.extension.look-git');
                await vscode.commands.executeCommand('lookGit.changesView.focus');

                const status = gitFixtureOutput(['status', '--short']);
                assert.match(status, /^[ MADRCU?][ MADRCU?] src\/graphFilter\.ts/m);
                assert.match(status, /^ m modules\/auth-kit/m);
                assert.match(status, /^ m modules\/billing-core/m);
                assert.match(status, /^ m modules\/analytics-adapter/m);
            },
        },
        {
            name: 'opens the Git Graph panel view',
            run: async () => {
                await vscode.commands.executeCommand('lookGit.graphView.focus');
                const commands = await vscode.commands.getCommands(true);
                assert.ok(commands.includes('lookGit.graphView.focus'));
            },
        },
        {
            name: 'lays out crossing graph lanes without floating commit nodes',
            run: async () => {
                await runFloatingGraphNodeLayoutE2E();
            },
        },
        {
            name: 'loads dirty worktree WIP rows from the lookGit fixture',
            run: async () => {
                await runWorktreeWipRowsE2E();
            },
        },
        {
            name: 'runs worktree context actions end to end',
            run: async () => {
                await runWorktreeContextActionsE2E();
            },
        },
        {
            name: 'opens graph diffs for added and deleted committed files',
            run: async () => {
                const repoPath = process.env.LOOK_GIT_DIFF_FIXTURE_REPO;
                if (!repoPath) {
                    console.log('  skip graph diff assertion: diff fixture repo is absent');
                    return;
                }

                try {
                    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

                    const repo = new GitProcessRepository(repoPath);
                    const messages: GraphExtensionToWebviewMessage[] = [];
                    const accessor: ActiveRepositoryAccessor = {
                        currentRepository: repo,
                        currentContext: undefined,
                        requireRepository: () => repo,
                    };
                    const router = new GraphMessageRouter(accessor, (message) => { messages.push(message); });
                    const commitHash = git(repoPath, ['rev-parse', 'HEAD']);
                    await waitForGitFileContent(repoPath, 'added.txt', commitHash, 'added content\n');
                    await waitForGitFileContent(repoPath, 'deleted.txt', `${commitHash}~1`, 'base content\n');

                    await router.handle({ type: 'graph/openDiff', filePath: 'added.txt', commitHash, status: 'A' });
                    await waitForTabLabel('added.txt');
                    assertNoGraphError(messages);

                    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

                    await router.handle({ type: 'graph/openDiff', filePath: 'deleted.txt', commitHash, status: 'D' });
                    await waitForTabLabel('deleted.txt');
                    assertNoGraphError(messages);
                } finally {
                    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                }
            },
        },
        {
            name: 'runs revision-oriented commit context actions end to end',
            run: async () => {
                const fixture = createTempGitRepo();
                const patchPath = path.join(fixture.cwd, 'selected.patch');
                const messages: GraphExtensionToWebviewMessage[] = [];
                let openedWorktreePath = '';

                try {
                    const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
                    const head = fixture.commitFile('head.txt', 'head\n', 'feat: head');
                    const router = routerFor(fixture.cwd, messages);

                    await router.handle({ type: 'graph/commitCommand', command: 'copyRevisionNumber', hash: head, hashes: [head] });
                    assert.equal(await vscode.env.clipboard.readText(), head);

                    await withPatchedVscode({ saveDialogUri: vscode.Uri.file(patchPath) }, async () => {
                        await router.handle({ type: 'graph/commitCommand', command: 'createPatch', hash: head, hashes: [head, base] });
                    });
                    assert.match(fs.readFileSync(patchPath, 'utf8'), /Subject: \[PATCH\] feat: head/);
                    assert.match(fs.readFileSync(patchPath, 'utf8'), /Subject: \[PATCH\] feat: base/);

                    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                    fixture.write('head.txt', 'head local\n');
                    await router.handle({ type: 'graph/commitCommand', command: 'compareWithLocal', hash: base, hashes: [base] });
                    await waitForActiveEditorText('head local');

                    const showCapture = await withPatchedVscode({ interceptOpenFolder: true }, async (capture) => {
                        await router.handle({ type: 'graph/commitCommand', command: 'showRepositoryAtRevision', hash: base, hashes: [base] });
                        return capture;
                    });
                    const openFolderCall = showCapture.commandCalls.find((call) => call.command === 'vscode.openFolder');
                    assert.ok(openFolderCall);
                    openedWorktreePath = fsPathOf(openFolderCall.args[0]);
                    assert.equal(git(openedWorktreePath, ['rev-parse', 'HEAD']), base);

                    const terminalCapture = await withPatchedVscode({ interceptTerminal: true }, async (capture) => {
                        await router.handle({ type: 'graph/commitCommand', command: 'interactiveRebaseFromHere', hash: base, hashes: [base] });
                        return capture;
                    });
                    assert.deepEqual(terminalCapture.terminalTexts, [`git rebase --autostash -i '${base}'`]);
                    assertNoGraphError(messages);
                } finally {
                    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                    if (openedWorktreePath) {
                        fs.rmSync(path.dirname(openedWorktreePath), { recursive: true, force: true });
                    }
                    fixture.cleanup();
                }
            },
        },
        {
            name: 'runs ref, checkout, cherry-pick, and push commit context actions end to end',
            run: async () => {
                const fixture = createTempGitRepo();
                const remote = createBareGitRepo();
                const messages: GraphExtensionToWebviewMessage[] = [];

                try {
                    const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
                    const head = fixture.commitFile('head.txt', 'head\n', 'feat: head');
                    fixture.git(['remote', 'add', 'origin', remote.cwd]);
                    const router = routerFor(fixture.cwd, messages);

                    await withPatchedVscode({ inputBoxValues: ['branch-at-base', 'tag-at-head'], warningChoices: ['Push'] }, async () => {
                        await router.handle({ type: 'graph/commitCommand', command: 'newBranch', hash: base, hashes: [base] });
                        await router.handle({ type: 'graph/commitCommand', command: 'newTag', hash: head, hashes: [head] });
                        await router.handle({ type: 'graph/commitCommand', command: 'pushAllUpToHere', hash: base, hashes: [base] });
                    });
                    assert.equal(git(fixture.cwd, ['rev-parse', 'branch-at-base']), base);
                    assert.equal(git(fixture.cwd, ['rev-parse', 'tag-at-head']), head);
                    assert.equal(git(remote.cwd, ['rev-parse', 'refs/heads/main']), base);

                    await router.handle({ type: 'graph/commitCommand', command: 'checkoutRevision', hash: base, hashes: [base] });
                    assert.equal(git(fixture.cwd, ['rev-parse', 'HEAD']), base);

                    fixture.git(['checkout', '-q', 'main']);
                    fixture.git(['checkout', '-q', '-b', 'feature']);
                    const older = fixture.commitFile('older.txt', 'older\n', 'feat: older');
                    const newer = fixture.commitFile('newer.txt', 'newer\n', 'feat: newer');
                    fixture.git(['checkout', '-q', 'main']);
                    fixture.git(['reset', '--hard', base]);
                    await router.handle({ type: 'graph/commitCommand', command: 'cherryPick', hash: newer, hashes: [newer, older] });
                    assert.deepEqual(git(fixture.cwd, ['log', '--format=%s', '-2']).split('\n'), ['feat: newer', 'feat: older']);
                    assertNoGraphError(messages);
                } finally {
                    fixture.cleanup();
                    remote.cleanup();
                }
            },
        },
        {
            name: 'runs branch context actions end to end',
            run: async () => {
                await runBranchContextActionsE2E();
            },
        },
        {
            name: 'runs history-editing commit context actions end to end',
            run: async () => {
                await runResetActionE2E();
                await runRevertActionE2E();
                await runUndoActionE2E();
                await runEditMessageActionE2E();
                await runFixupActionE2E();
                await runSquashActionE2E();
                await runDropActionE2E();
            },
        },
        {
            name: 'runs merge conflict resolve, continue, and abort flows end to end',
            run: async () => {
                await runMergeResolveContinueE2E();
                await runMergeAbortE2E();
                await runRebaseResolveContinueE2E();
            },
        },
        {
            name: 'bundles official Codicons with a webview-safe relative font URL',
            run: async () => {
                const extension = vscode.extensions.getExtension('mathias8dev.look-git');
                assert.ok(extension, 'Expected the Look Git extension to be available.');

                const webviewDist = path.join(extension.extensionPath, 'dist', 'webview');
                const styles = fs.readFileSync(path.join(webviewDist, 'styles.css'), 'utf8');

                assert.ok(fs.existsSync(path.join(webviewDist, 'codicon.ttf')), 'Expected codicon.ttf to be bundled.');
                assert.match(styles, /@font-face\{font-family:codicon/);
                assert.match(styles, /url\(\.\/codicon\.ttf\?/);
                assert.doesNotMatch(styles, /url\(\/codicon\.ttf/);
                assert.match(styles, /\.submodule-panel/);
                assert.match(styles, /\.submodule-badge-dirty/);
            },
        },
    ]);
}

async function runFloatingGraphNodeLayoutE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const messages: GraphExtensionToWebviewMessage[] = [];
    try {
        createFloatingNodeGraphFixture(fixture);
        const router = routerFor(fixture.cwd, messages);
        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'floating-layout',
            repoId: 'floating-layout',
            filters: {},
            page: { offset: 0, limit: 50 },
        });

        assertNoGraphError(messages);
        const response = graphDataResponse(messages, 'floating-layout');
        assert.equal(response.data.commits.some((commit) => commit.refs.includes('refs/stash')), false);
        assert.equal(response.data.commits.some((commit) => commit.message.includes('stash graph fixture')), false);
        const state = reduceGraphState(createInitialGraphState(), { type: 'message', message: response });
        const issues = findFloatingNodeIssues(state.rows);
        assert.deepEqual(issues, [], `Expected all visible graph nodes to be connected. Issues: ${JSON.stringify(issues)}`);
        const continuityIssues = findLaneContinuityIssues(state.rows);
        assert.deepEqual(continuityIssues, [], `Expected graph lanes to stay continuous. Issues: ${JSON.stringify(continuityIssues)}`);
    } finally {
        fixture.cleanup();
    }
}

async function runWorktreeWipRowsE2E(): Promise<void> {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-worktrees-e2e-'));
    try {
        execFileSync('node', [
            path.join(process.cwd(), 'scripts', 'look-git.ts'),
            'setup',
            'worktrees',
            '--output',
            outputRoot,
        ], { cwd: process.cwd(), encoding: 'utf8' });
        const repoPath = path.join(outputRoot, 'worktrees');
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = routerFor(repoPath, messages);

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'worktree-wips',
            repoId: 'worktree-wips',
            filters: {},
            page: { offset: 0, limit: 120 },
        });

        assertNoGraphError(messages);
        const response = graphDataResponse(messages, 'worktree-wips');
        const wipsByName = new Map(response.data.worktreeWips.map((wip) => [path.basename(wip.path), wip]));

        assert.equal(response.data.worktrees.length, 6);
        assert.equal(response.data.worktreeWips.length, 4);
        assert.deepEqual(
            {
                staged: wipsByName.get('worktrees')?.staged,
                untracked: wipsByName.get('worktrees')?.untracked,
            },
            { staged: 1, untracked: 1 },
        );
        assert.deepEqual(
            {
                staged: wipsByName.get('feature-uncommitted-draft')?.staged,
                untracked: wipsByName.get('feature-uncommitted-draft')?.untracked,
            },
            { staged: 1, untracked: 2 },
        );
        assert.deepEqual(
            {
                staged: wipsByName.get('fix-status-dirty')?.staged,
                unstaged: wipsByName.get('fix-status-dirty')?.unstaged,
                untracked: wipsByName.get('fix-status-dirty')?.untracked,
            },
            { staged: 1, unstaged: 1, untracked: 1 },
        );

        const heads = new Map<string, number>();
        for (const wip of response.data.worktreeWips) {
            heads.set(wip.head, (heads.get(wip.head) ?? 0) + 1);
        }
        assert.ok(Array.from(heads.values()).some((count) => count > 1), 'Expected multiple dirty worktrees to share one head.');

        const state = reduceGraphState(createInitialGraphState(), { type: 'message', message: response });
        assert.equal(state.displayRows.filter((row) => row.kind === 'wip').length, response.data.worktreeWips.length);

        const dirtyWorktree = wipsByName.get('fix-status-dirty');
        assert.ok(dirtyWorktree);
        await router.handle({
            type: 'graph/worktreeDetailsRequest',
            requestId: 'worktree-details',
            path: dirtyWorktree.path,
        });
        const details = worktreeDetailsResponse(messages, 'worktree-details');
        assert.deepEqual(details.files.map((file) => `${file.status} ${file.filePath}`), [
            '? notes/status-local.md',
            'M src/status/model.ts',
            'A src/status/staged.ts',
        ]);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await router.handle({
            type: 'graph/openWorktreeDiff',
            worktreePath: dirtyWorktree.path,
            filePath: 'src/status/model.ts',
            status: 'M',
        });
        await waitForTabLabel('model.ts');
    } finally {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fs.rmSync(outputRoot, { recursive: true, force: true });
    }
}

async function runWorktreeContextActionsE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const remote = createBareGitRepo();
    let linked: ReturnType<typeof addLinkedWorktree> | undefined;
    let forceLinked: ReturnType<typeof addLinkedWorktree> | undefined;
    const messages: GraphExtensionToWebviewMessage[] = [];
    try {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['remote', 'add', 'origin', remote.cwd]);
        fixture.git(['push', '-u', 'origin', 'main']);
        linked = addLinkedWorktree(fixture, 'feature/worktree-context');
        const worktreePath = linked.worktreePath;
        git(worktreePath, ['push', '-u', 'origin', 'feature/worktree-context']);
        fixture.git(['branch', 'feature/checkout-target']);
        const router = routerFor(fixture.cwd, messages);

        const openCapture = await withPatchedVscode({ quickPickValues: ['Open in Current Window'], interceptOpenFolder: true }, async (capture) => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'open', path: worktreePath });
            await router.handle({ type: 'graph/worktreeCommand', command: 'openInNewWindow', path: worktreePath });
            return capture;
        });
        assert.deepEqual(openCapture.commandCalls
            .filter((call) => call.command === 'vscode.openFolder')
            .map((call) => Boolean((call.args[1] as { forceNewWindow?: boolean } | undefined)?.forceNewWindow)), [false, true]);

        await router.handle({ type: 'graph/worktreeCommand', command: 'fetch', path: worktreePath });
        await router.handle({ type: 'graph/worktreeCommand', command: 'pull', path: worktreePath });

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fs.writeFileSync(path.join(worktreePath, 'base.txt'), 'base from worktree\n');
        fs.writeFileSync(path.join(worktreePath, 'untracked-diff.txt'), 'untracked diff\n');
        await router.handle({ type: 'graph/worktreeCommand', command: 'showDiffWithHead', path: worktreePath });
        await waitForActiveEditorText('base from worktree');
        await waitForActiveEditorText('untracked-diff.txt');

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await router.handle({ type: 'graph/worktreeCommand', command: 'showDiffWithMainWorktree', path: worktreePath });
        await waitForActiveEditorText('base from worktree');
        await waitForActiveEditorText('untracked-diff.txt');

        fs.writeFileSync(path.join(worktreePath, 'committed.txt'), 'committed\n');
        await withPatchedVscode({ warningChoices: ['Stage All and Commit'], inputBoxValues: ['feat(worktrees): commit from context action'] }, async () => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'commit', path: worktreePath });
        });
        assert.equal(git(worktreePath, ['log', '-1', '--format=%s']), 'feat(worktrees): commit from context action');
        assert.equal(gitStatus(worktreePath), '');

        await router.handle({ type: 'graph/worktreeCommand', command: 'push', path: worktreePath });
        assert.equal(git(remote.cwd, ['rev-parse', 'feature/worktree-context']), git(worktreePath, ['rev-parse', 'HEAD']));

        fs.writeFileSync(path.join(worktreePath, 'stashed.txt'), 'stashed\n');
        await withPatchedVscode({ inputBoxValues: ['wip(worktrees): context stash'] }, async () => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'stash', path: worktreePath });
        });
        assert.equal(gitStatus(worktreePath), '');
        assert.match(git(worktreePath, ['stash', 'list']), /wip\(worktrees\): context stash/);

        await withPatchedVscode({ inputBoxValues: ['feature/from-worktree-head'] }, async () => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'newBranch', path: worktreePath });
        });
        assert.equal(git(worktreePath, ['branch', '--show-current']), 'feature/from-worktree-head');

        await withPatchedVscode({ quickPickValues: ['feature/checkout-target'] }, async () => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'checkoutBranch', path: worktreePath });
        });
        assert.equal(git(worktreePath, ['branch', '--show-current']), 'feature/checkout-target');

        await router.handle({ type: 'graph/worktreeCommand', command: 'lock', path: worktreePath });
        assert.match(git(fixture.cwd, ['worktree', 'list', '--porcelain']), /locked/);
        await router.handle({ type: 'graph/worktreeCommand', command: 'unlock', path: worktreePath });
        assert.doesNotMatch(git(fixture.cwd, ['worktree', 'list', '--porcelain']), /locked/);

        forceLinked = addLinkedWorktree(fixture, 'feature/worktree-force-remove');
        const forceWorktreePath = forceLinked.worktreePath;
        fs.writeFileSync(path.join(forceWorktreePath, 'discarded.txt'), 'discarded\n');
        await withPatchedVscode({ warningChoices: ['Force Remove', 'Discard Changes and Remove'] }, async () => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'removeForce', path: forceWorktreePath });
        });
        assert.equal(fs.existsSync(forceWorktreePath), false);

        await withPatchedVscode({ warningChoices: ['Remove'] }, async () => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'remove', path: worktreePath });
        });
        assert.equal(fs.existsSync(worktreePath), false);
        assertNoGraphError(messages);
    } finally {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        forceLinked?.cleanup();
        linked?.cleanup();
        fixture.cleanup();
        remote.cleanup();
    }
}

function createFloatingNodeGraphFixture(fixture: TempGitRepo): void {
    const base = fixture.commitFile('graph/base.txt', 'base\n', 'feat(graph): add shared base', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    fixture.git(['checkout', '-q', '-b', 'feature/floating-topic', base]);
    fixture.commitFile('graph/topic-parent.txt', 'topic parent\n', 'feat(graph): add topic parent', FIXTURE_AUTHORS[1], '2024-01-02T00:00:00Z');
    fixture.commitFile('graph/topic-child.txt', 'topic child\n', 'feat(graph): add topic child', FIXTURE_AUTHORS[2], '2024-01-04T00:00:00Z');
    fixture.git(['checkout', '-q', 'main']);
    fixture.commitFile('graph/main-child.txt', 'main child\n', 'feat(graph): add main child', FIXTURE_AUTHORS[3], '2024-01-03T00:00:00Z');
    fixture.write('graph/stash-wip.txt', 'stash wip\n');
    fixture.git(['stash', 'push', '-u', '-m', 'wip(graph): stash graph fixture', '--', 'graph/stash-wip.txt']);
}

async function runBranchContextActionsE2E(): Promise<void> {
    await runBranchCheckoutCreateRenameDeleteE2E();
    await runBranchRebaseMergeAndDiffE2E();
    await runBranchPushAndRemoteDeleteE2E();
}

async function runBranchCheckoutCreateRenameDeleteE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const messages: GraphExtensionToWebviewMessage[] = [];
    try {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'chore/ci-matrix']);
        const source = fixture.commitFile('ci.txt', 'ci\n', 'chore(ci): add matrix');
        fixture.git(['checkout', '-q', 'main']);
        const router = routerFor(fixture.cwd, messages);

        await router.handle({ type: 'graph/branchCommand', command: 'checkout', branch: 'chore/ci-matrix', isRemote: false });
        assert.equal(git(fixture.cwd, ['branch', '--show-current']), 'chore/ci-matrix');
        fixture.git(['checkout', '-q', 'main']);

        await withPatchedVscode({ inputBoxValues: ['feature/from-ci', 'feature/renamed-ci'], warningChoices: ['Delete'] }, async () => {
            await router.handle({ type: 'graph/branchCommand', command: 'newBranchFrom', branch: 'chore/ci-matrix', isRemote: false });
            await router.handle({ type: 'graph/branchCommand', command: 'rename', branch: 'feature/from-ci', isRemote: false });
            fixture.git(['checkout', '-q', 'main']);
            await router.handle({ type: 'graph/branchCommand', command: 'delete', branch: 'feature/renamed-ci', isRemote: false });
        });

        assert.equal(git(fixture.cwd, ['rev-parse', 'chore/ci-matrix']), source);
        assert.equal(git(fixture.cwd, ['branch', '--list', 'feature/renamed-ci']), '');
        assertNoGraphError(messages);
    } finally {
        fixture.cleanup();
    }
}

async function runBranchRebaseMergeAndDiffE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const messages: GraphExtensionToWebviewMessage[] = [];
    try {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'feature/topic', base]);
        fixture.commitFile('feature.txt', 'feature\n', 'feat: feature');
        fixture.git(['checkout', '-q', 'main']);
        const main = fixture.commitFile('main.txt', 'main\n', 'feat: main');
        const router = routerFor(fixture.cwd, messages);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await router.handle({ type: 'graph/branchCommand', command: 'compareWithCurrent', branch: 'feature/topic', isRemote: false });
        await waitForActiveEditorText('feature.txt');

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fixture.write('base.txt', 'working tree\n');
        await router.handle({ type: 'graph/branchCommand', command: 'showDiffWithWorkingTree', branch: 'feature/topic', isRemote: false });
        await waitForActiveEditorText('working tree');
        fixture.git(['checkout', '--', 'base.txt']);

        await router.handle({ type: 'graph/branchCommand', command: 'checkoutRebaseOnto', branch: 'feature/topic', isRemote: false });
        assert.equal(git(fixture.cwd, ['branch', '--show-current']), 'feature/topic');
        assert.equal(git(fixture.cwd, ['merge-base', 'HEAD', 'main']), main);

        fixture.git(['checkout', '-q', 'main']);
        fixture.git(['checkout', '-q', '-b', 'feature/merge-target', base]);
        fixture.commitFile('merge-target.txt', 'merge target\n', 'feat: merge target');
        fixture.git(['checkout', '-q', 'main']);
        await router.handle({ type: 'graph/branchCommand', command: 'mergeInto', branch: 'feature/merge-target', isRemote: false });
        assert.equal(git(fixture.cwd, ['show', 'HEAD:merge-target.txt']), 'merge target');

        fixture.git(['checkout', '-q', '-b', 'feature/rebase-base', base]);
        const selected = fixture.commitFile('selected.txt', 'selected\n', 'feat: selected');
        fixture.git(['checkout', '-q', 'main']);
        await router.handle({ type: 'graph/branchCommand', command: 'rebaseOnto', branch: 'feature/rebase-base', isRemote: false });
        assert.equal(git(fixture.cwd, ['merge-base', 'HEAD', 'feature/rebase-base']), selected);
        assertNoGraphError(messages);
    } finally {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fixture.cleanup();
    }
}

async function runBranchPushAndRemoteDeleteE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const remote = createBareGitRepo();
    const messages: GraphExtensionToWebviewMessage[] = [];
    try {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['remote', 'add', 'origin', remote.cwd]);
        fixture.git(['push', '-u', 'origin', 'main']);
        fixture.git(['checkout', '-q', '-b', 'feature/push']);
        fixture.commitFile('feature.txt', 'feature\n', 'feat: feature');
        const router = routerFor(fixture.cwd, messages);

        await withPatchedVscode({ warningChoices: ['Delete Remote'] }, async () => {
            await router.handle({ type: 'graph/branchCommand', command: 'push', branch: 'feature/push', isRemote: false });
            await router.handle({ type: 'graph/branchCommand', command: 'delete', branch: 'origin/feature/push', isRemote: true });
        });

        assert.equal(remote.gitTrim(['branch', '--list', 'feature/push']), '');
        assertNoGraphError(messages);
    } finally {
        fixture.cleanup();
        remote.cleanup();
    }
}

async function runResetActionE2E(): Promise<void> {
    await withTempCommitRepo(async ({ fixture, base, head, router, messages }) => {
        await withPatchedVscode({ quickPickValues: ['Mixed reset'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'resetCurrentBranchToHere', hash: base, hashes: [base] });
        });
        assert.equal(git(fixture.cwd, ['rev-parse', 'HEAD']), base);
        assert.match(gitStatus(fixture.cwd), /head\.txt/);
        assert.notEqual(head, base);
        assertNoGraphError(messages);
    });
    await withTempCommitRepo(async ({ fixture, base, router, messages }) => {
        fixture.write('local.txt', 'local\n');
        await withPatchedVscode({ quickPickValues: ['Keep reset'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'resetCurrentBranchToHere', hash: base, hashes: [base] });
        });
        assert.equal(git(fixture.cwd, ['rev-parse', 'HEAD']), base);
        assert.equal(fs.readFileSync(path.join(fixture.cwd, 'local.txt'), 'utf8'), 'local\n');
        assertNoGraphError(messages);
    });
}

async function runRevertActionE2E(): Promise<void> {
    await withTempCommitRepo(async ({ fixture, head, router, messages }) => {
        await router.handle({ type: 'graph/commitCommand', command: 'revertCommit', hash: head, hashes: [head] });
        assert.match(git(fixture.cwd, ['log', '-1', '--format=%s']), /^Revert "feat: head"$/);
        assertNoGraphError(messages);
    });
}

async function runUndoActionE2E(): Promise<void> {
    await withTempCommitRepo(async ({ fixture, base, head, router, messages }) => {
        await withPatchedVscode({ warningChoices: ['Undo Commit'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'undoCommit', hash: head, hashes: [head] });
        });
        assert.equal(git(fixture.cwd, ['rev-parse', 'HEAD']), base);
        assert.match(gitStatus(fixture.cwd), /^A  head\.txt/m);
        assertNoGraphError(messages);
    });
}

async function runEditMessageActionE2E(): Promise<void> {
    await withTempCommitRepo(async ({ fixture, head, router, messages }) => {
        await withPatchedVscode({ inputBoxValues: ['fix: edited head'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'editCommitMessage', hash: head, hashes: [head] });
        });
        assert.equal(git(fixture.cwd, ['log', '-1', '--format=%s']), 'fix: edited head');
        assertNoGraphError(messages);
    });
    await withTempCommitRepo(async ({ fixture, base, router, messages }) => {
        await withPatchedVscode({ inputBoxValues: ['fix: edited base'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'editCommitMessage', hash: base, hashes: [base] });
        });
        assert.equal(git(fixture.cwd, ['log', '--format=%s', '--reverse']), 'fix: edited base\nfeat: head');
        assertNoGraphError(messages);
    });
    await withTempCommitRepo(async ({ fixture, base, router, messages }) => {
        fixture.git(['checkout', '-q', '-b', 'feature/edit-message', base]);
        const feature = fixture.commitFile('feature.txt', 'feature\n', 'feat: feature');
        fixture.git(['checkout', '-q', 'main']);
        const main = fixture.commitFile('main.txt', 'main\n', 'feat: main');

        await withPatchedVscode({ inputBoxValues: ['fix: edited feature'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'editCommitMessage', hash: feature, hashes: [feature] });
        });
        assert.equal(git(fixture.cwd, ['branch', '--show-current']), 'main');
        assert.equal(git(fixture.cwd, ['log', '-1', '--format=%s', 'feature/edit-message']), 'fix: edited feature');
        assert.equal(git(fixture.cwd, ['rev-parse', 'main']), main);
        assert.doesNotMatch(git(fixture.cwd, ['log', '--all', '--format=%H']), new RegExp(feature));

        await withPatchedVscode({ inputBoxValues: ['fix: edited shared base'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'editCommitMessage', hash: base, hashes: [base] });
        });
        assert.equal(git(fixture.cwd, ['log', '--format=%s', '--reverse', 'main']), 'fix: edited shared base\nfeat: head\nfeat: main');
        assert.equal(git(fixture.cwd, ['log', '--format=%s', '--reverse', 'feature/edit-message']), 'fix: edited shared base\nfix: edited feature');
        assert.doesNotMatch(git(fixture.cwd, ['log', '--all', '--format=%H']), new RegExp(base));
        assertNoGraphError(messages);
    });
}

async function runFixupActionE2E(): Promise<void> {
    await withTempCommitRepo(async ({ fixture, base, router, messages }) => {
        fixture.write('fixup.txt', 'fixup\n');
        fixture.git(['add', 'fixup.txt']);
        await router.handle({ type: 'graph/commitCommand', command: 'fixup', hash: base, hashes: [base] });
        assert.equal(git(fixture.cwd, ['rev-list', '--count', 'HEAD']), '2');
        assert.equal(git(fixture.cwd, ['log', '--format=%s', '--reverse']), 'feat: base\nfeat: head');
        assert.equal(git(fixture.cwd, ['show', 'HEAD~1:fixup.txt']), 'fixup');
        assertNoGraphError(messages);
    });
}

async function runSquashActionE2E(): Promise<void> {
    await withTempCommitRepo(async ({ fixture, base, router, messages }) => {
        fixture.write('squash.txt', 'squash\n');
        fixture.git(['add', 'squash.txt']);
        await withPatchedVscode({ inputBoxValues: ['fix: staged squash'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'squashInto', hash: base, hashes: [base] });
        });
        assert.equal(git(fixture.cwd, ['rev-list', '--count', 'HEAD']), '2');
        assert.match(git(fixture.cwd, ['log', '--format=%B', '--reverse']), /feat: base\n\nfix: staged squash/);
        assert.equal(git(fixture.cwd, ['show', 'HEAD~1:squash.txt']), 'squash');
        assertNoGraphError(messages);
    });
}

async function runDropActionE2E(): Promise<void> {
    await withTempCommitRepo(async ({ fixture, base, head, router, messages }) => {
        fixture.write('local.txt', 'local\n');
        await withPatchedVscode({ warningChoices: ['Drop'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'dropCommit', hash: head, hashes: [head] });
        });
        assert.equal(git(fixture.cwd, ['rev-parse', 'HEAD']), base);
        assert.equal(fs.readFileSync(path.join(fixture.cwd, 'local.txt'), 'utf8'), 'local\n');
        assertNoGraphError(messages);
    });
    await withTempCommitRepo(async ({ fixture, head, router, messages }) => {
        const middle = fixture.commitFile('middle.txt', 'middle\n', 'feat: middle');
        const tail = fixture.commitFile('tail.txt', 'tail\n', 'feat: tail');
        await withPatchedVscode({ warningChoices: ['Drop'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'dropCommit', hash: head, hashes: [head, middle] });
        });
        assert.notEqual(git(fixture.cwd, ['rev-parse', 'HEAD']), tail);
        assert.equal(git(fixture.cwd, ['log', '--format=%s', '--reverse']), 'feat: base\nfeat: tail');
        assert.equal(git(fixture.cwd, ['show', 'HEAD:tail.txt']), 'tail');
        assertNoGraphError(messages);
    });
}

async function runMergeResolveContinueE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const messages: ChangesExtensionToWebviewMessage[] = [];
    try {
        createMergeConflict(fixture);
        const router = changesRouterFor(fixture.cwd, messages);

        await router.handle({ type: 'changes/acceptTheirs', filePath: 'conflict.txt' });
        assert.equal(fs.readFileSync(path.join(fixture.cwd, 'conflict.txt'), 'utf8'), 'incoming\n');
        assert.ok(fs.existsSync(path.join(fixture.cwd, '.git', 'MERGE_HEAD')), 'Accepting a side must not continue the merge automatically.');
        assert.equal(git(fixture.cwd, ['log', '-1', '--format=%s']), 'feat: current');

        await router.handle({ type: 'changes/continueOp', conflictState: ConflictState.Merge });

        assert.equal(fs.existsSync(path.join(fixture.cwd, '.git', 'MERGE_HEAD')), false);
        assert.equal(fs.readFileSync(path.join(fixture.cwd, 'conflict.txt'), 'utf8'), 'incoming\n');
        assert.match(git(fixture.cwd, ['log', '-1', '--format=%s']), /^Merge branch 'incoming'/);
        assertNoChangesError(messages);
    } finally {
        fixture.cleanup();
    }
}

async function runMergeAbortE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const messages: ChangesExtensionToWebviewMessage[] = [];
    try {
        createMergeConflict(fixture);
        const router = changesRouterFor(fixture.cwd, messages);

        await withPatchedVscode({ warningChoices: ['Abort'] }, async () => {
            await router.handle({ type: 'changes/abortOp', conflictState: ConflictState.Merge });
        });

        assert.equal(fs.existsSync(path.join(fixture.cwd, '.git', 'MERGE_HEAD')), false);
        assert.equal(fs.readFileSync(path.join(fixture.cwd, 'conflict.txt'), 'utf8'), 'current\n');
        assert.equal(gitStatus(fixture.cwd), '');
        assertNoChangesError(messages);
    } finally {
        fixture.cleanup();
    }
}

async function runRebaseResolveContinueE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const messages: ChangesExtensionToWebviewMessage[] = [];
    try {
        createRebaseConflict(fixture);
        const router = changesRouterFor(fixture.cwd, messages);

        await router.handle({ type: 'changes/acceptTheirs', filePath: 'conflict.txt' });
        assert.equal(fs.readFileSync(path.join(fixture.cwd, 'conflict.txt'), 'utf8'), 'feature\n');
        assert.ok(fs.existsSync(path.join(fixture.cwd, '.git', 'rebase-merge')), 'Accepting a side must not continue the rebase automatically.');

        await router.handle({ type: 'changes/continueOp', conflictState: ConflictState.Rebase });

        assert.equal(fs.existsSync(path.join(fixture.cwd, '.git', 'rebase-merge')), false);
        assert.equal(git(fixture.cwd, ['branch', '--show-current']), 'feature');
        assert.equal(fs.readFileSync(path.join(fixture.cwd, 'conflict.txt'), 'utf8'), 'feature\n');
        assert.equal(git(fixture.cwd, ['log', '--format=%s', '--reverse']), 'feat: base\nfeat: current\nfeat: feature');
        assertNoChangesError(messages);
    } finally {
        fixture.cleanup();
    }
}

function createMergeConflict(fixture: TempGitRepo): void {
    fixture.commitFile('conflict.txt', 'base\n', 'feat: base');
    fixture.git(['checkout', '-q', '-b', 'incoming']);
    fixture.commitFile('conflict.txt', 'incoming\n', 'feat: incoming');
    fixture.git(['checkout', '-q', 'main']);
    fixture.commitFile('conflict.txt', 'current\n', 'feat: current');
    expectGitFailure(fixture, ['merge', 'incoming']);
    assert.match(gitStatus(fixture.cwd), /^UU conflict\.txt/m);
}

function createRebaseConflict(fixture: TempGitRepo): void {
    const base = fixture.commitFile('conflict.txt', 'base\n', 'feat: base');
    fixture.git(['checkout', '-q', '-b', 'feature', base]);
    fixture.commitFile('conflict.txt', 'feature\n', 'feat: feature');
    fixture.git(['checkout', '-q', 'main']);
    fixture.commitFile('conflict.txt', 'current\n', 'feat: current');
    fixture.git(['checkout', '-q', 'feature']);
    expectGitFailure(fixture, ['rebase', 'main']);
    assert.match(gitStatus(fixture.cwd), /^UU conflict\.txt/m);
}

function expectGitFailure(fixture: TempGitRepo, args: readonly string[]): void {
    let failed = false;
    try {
        fixture.git([...args]);
    } catch {
        failed = true;
    }
    assert.equal(failed, true, `Expected git ${args.join(' ')} to fail.`);
}

async function withTempCommitRepo(
    run: (context: {
        readonly fixture: TempGitRepo;
        readonly base: string;
        readonly head: string;
        readonly router: GraphMessageRouter;
        readonly messages: GraphExtensionToWebviewMessage[];
    }) => Promise<void>,
): Promise<void> {
    const fixture = createTempGitRepo();
    const messages: GraphExtensionToWebviewMessage[] = [];
    try {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        const head = fixture.commitFile('head.txt', 'head\n', 'feat: head');
        await run({ fixture, base, head, router: routerFor(fixture.cwd, messages), messages });
    } finally {
        fixture.cleanup();
    }
}

function routerFor(repoPath: string, messages: GraphExtensionToWebviewMessage[]): GraphMessageRouter {
    const repo = new GitProcessRepository(repoPath);
    const accessor: ActiveRepositoryAccessor = {
        currentRepository: repo,
        currentContext: undefined,
        requireRepository: () => repo,
    };
    return new GraphMessageRouter(accessor, (message) => { messages.push(message); });
}

function changesRouterFor(repoPath: string, messages: ChangesExtensionToWebviewMessage[]): ChangesMessageRouter {
    const repo = new GitProcessRepository(repoPath);
    const accessor: ActiveRepositoryAccessor = {
        currentRepository: repo,
        currentContext: undefined,
        requireRepository: () => repo,
    };
    return new ChangesMessageRouter(accessor, (message) => { messages.push(message); }, async () => undefined);
}

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();
}

function gitStatus(cwd: string): string {
    return execFileSync('git', ['status', '--short'], { cwd, encoding: 'utf8' });
}

interface VscodePatchOptions {
    readonly inputBoxValues?: readonly string[];
    readonly quickPickValues?: readonly string[];
    readonly warningChoices?: readonly string[];
    readonly saveDialogUri?: vscode.Uri;
    readonly interceptOpenFolder?: boolean;
    readonly interceptTerminal?: boolean;
}

interface VscodePatchCapture {
    readonly commandCalls: Array<{ readonly command: string; readonly args: readonly unknown[] }>;
    readonly terminalTexts: string[];
}

async function withPatchedVscode<T>(
    options: VscodePatchOptions,
    run: (capture: VscodePatchCapture) => Promise<T>,
): Promise<T> {
    const inputBoxValues = [...options.inputBoxValues ?? []];
    const quickPickValues = [...options.quickPickValues ?? []];
    const warningChoices = [...options.warningChoices ?? []];
    const capture: VscodePatchCapture = { commandCalls: [], terminalTexts: [] };
    const originalInputBox = vscode.window.showInputBox;
    const originalQuickPick = vscode.window.showQuickPick;
    const originalWarning = vscode.window.showWarningMessage;
    const originalSaveDialog = vscode.window.showSaveDialog;
    const originalExecuteCommand = vscode.commands.executeCommand.bind(vscode.commands);
    const originalCreateTerminal = vscode.window.createTerminal;

    Object.defineProperty(vscode.window, 'showInputBox', {
        configurable: true,
        value: async () => inputBoxValues.shift(),
    });
    Object.defineProperty(vscode.window, 'showQuickPick', {
        configurable: true,
        value: async () => quickPickValues.shift(),
    });
    Object.defineProperty(vscode.window, 'showWarningMessage', {
        configurable: true,
        value: async (_message: string, _options?: unknown, ...items: string[]) => warningChoices.shift() ?? items[0],
    });
    Object.defineProperty(vscode.window, 'showSaveDialog', {
        configurable: true,
        value: async () => options.saveDialogUri,
    });
    Object.defineProperty(vscode.commands, 'executeCommand', {
        configurable: true,
        value: async (command: string, ...args: unknown[]) => {
            capture.commandCalls.push({ command, args });
            if (options.interceptOpenFolder && command === 'vscode.openFolder') { return undefined; }
            return originalExecuteCommand(command, ...args);
        },
    });
    Object.defineProperty(vscode.window, 'createTerminal', {
        configurable: true,
        value: (terminalOptions: vscode.TerminalOptions) => ({
            name: terminalOptions.name ?? 'Look Git',
            processId: Promise.resolve(0),
            creationOptions: terminalOptions,
            exitStatus: undefined,
            state: { isInteractedWith: false },
            sendText(text: string) { capture.terminalTexts.push(text); },
            show() {},
            hide() {},
            dispose() {},
        }),
    });

    try {
        return await run(capture);
    } finally {
        Object.defineProperty(vscode.window, 'showInputBox', { configurable: true, value: originalInputBox });
        Object.defineProperty(vscode.window, 'showQuickPick', { configurable: true, value: originalQuickPick });
        Object.defineProperty(vscode.window, 'showWarningMessage', { configurable: true, value: originalWarning });
        Object.defineProperty(vscode.window, 'showSaveDialog', { configurable: true, value: originalSaveDialog });
        Object.defineProperty(vscode.commands, 'executeCommand', { configurable: true, value: originalExecuteCommand });
        Object.defineProperty(vscode.window, 'createTerminal', { configurable: true, value: originalCreateTerminal });
    }
}

async function waitForActiveEditorText(expected: string): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt++) {
        const text = vscode.window.activeTextEditor?.document.getText();
        if (text?.includes(expected)) { return; }
        await sleep(100);
    }
    assert.fail(`Expected active editor text containing "${expected}".`);
}

function fsPathOf(value: unknown): string {
    assert.ok(typeof value === 'object' && value !== null && 'fsPath' in value);
    const fsPath = value.fsPath;
    assert.equal(typeof fsPath, 'string');
    if (typeof fsPath !== 'string') { throw new Error('Expected URI fsPath.'); }
    return fsPath;
}

async function waitForGitFileContent(repoPath: string, filePath: string, ref: string, expected: string): Promise<void> {
    const uri = gitObjectUri(repoPath, filePath, ref);
    let lastError = '';

    for (let attempt = 0; attempt < 40; attempt++) {
        try {
            const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            if (content === expected) { return; }
            lastError = `read "${content}"`;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        await sleep(100);
    }

    assert.fail(`Expected Git file content for ${filePath} at ${ref}: ${lastError}`);
}

function gitObjectUri(repoPath: string, filePath: string, ref: string): vscode.Uri {
    const uri = vscode.Uri.file(path.join(repoPath, filePath));
    return uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.path, ref }) });
}

async function waitForTabLabel(label: string): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt++) {
        const tab = vscode.window.tabGroups.all
            .flatMap((group) => group.tabs)
            .find((candidate) => candidate.label.includes(label));
        if (tab) { return; }
        await sleep(100);
    }

    const openLabels = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .map((tab) => tab.label);
    assert.fail(`Expected an open diff tab containing "${label}". Open tabs: ${openLabels.join(', ')}`);
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

function assertNoGraphError(messages: readonly GraphExtensionToWebviewMessage[]): void {
    const error = messages.find((message) => message.type === 'graph/error');
    assert.equal(error, undefined, error?.message);
}

function graphDataResponse(messages: readonly GraphExtensionToWebviewMessage[], requestId: string): GraphDataResponse {
    const response = messages.find((message): message is GraphDataResponse => (
        message.type === 'graph/dataResponse' && message.requestId === requestId
    ));
    assert.ok(response, `Expected graph/dataResponse for ${requestId}.`);
    return response;
}

function worktreeDetailsResponse(messages: readonly GraphExtensionToWebviewMessage[], requestId: string): WorktreeDetailsResponse {
    const response = messages.find((message): message is WorktreeDetailsResponse => (
        message.type === 'graph/worktreeDetailsResponse' && message.requestId === requestId
    ));
    assert.ok(response, `Expected graph/worktreeDetailsResponse for ${requestId}.`);
    return response;
}

function assertNoChangesError(messages: readonly ChangesExtensionToWebviewMessage[]): void {
    const error = messages.find((message) => message.type === 'changes/error');
    assert.equal(error, undefined, error?.message);
}
