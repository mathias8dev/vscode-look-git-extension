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
import { CommitHistoryViewProvider } from '../../../src/extension/views/CommitHistoryViewProvider';
import { getConfiguredWebviewFontSize, registerWebviewFontSizeSync } from '../../../src/extension/views/webview-font';
import type { CommitMessageGeneratorInput } from '../../../src/application/ports/commit-message-generator';
import type { GitRepository } from '../../../src/application/ports/git-repository';
import { VscodeRemoteCommand, type CliRemoteCommand, type RemoteCommandBackend } from '../../../src/application/ports/remote-command-backend';
import { GenerateCommitMessageUseCase } from '../../../src/application/usecases/changes/generate-commit-message';
import type { ChangesExtensionToWebviewMessage } from '../../../src/protocol/changes/messages';
import { ConflictState } from '../../../src/protocol/changes/types';
import type { GraphDataResponse, GraphExtensionToWebviewMessage, GraphSubmodulesPush, WorktreeDetailsResponse } from '../../../src/protocol/graph/messages';
import type { HistoryExtensionToWebviewMessage, HistoryWebviewToExtensionMessage } from '../../../src/protocol/history/messages';
import type { GraphRow } from '../../../src/webview/features/graph/layout/graph-lane-model';
import { createInitialGraphState, reduceGraphState, type GraphState } from '../../../src/webview/features/graph/graphState';
import { addLinkedWorktree, createBareGitRepo, createSubmoduleFixture, createTempGitRepo, removeDirSyncWithRetry, samePath, FIXTURE_AUTHORS, type TempGitRepo } from '../../helpers/gitRepo';
import { getFixtureRepoPath, gitFixtureOutput } from '../../helpers/fixtureRepo';
import { findAdjacentDisconnectedSameLaneIssues, findCommitLanePassThroughIssues, findFloatingNodeIssues, findLaneContinuityIssues, findNonVisibleLineTargetIssues } from '../../helpers/graphLayoutAssertions';
import { runTestCases } from '../../helpers/testRunner';

// Repo root resolved from this compiled file (out/tests/e2e/suite) — process.cwd() is unreliable in the
// VS Code test host (on Windows it points at the VS Code install dir, not the extension repo).
const repoRoot = path.resolve(__dirname, '../../../..');

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
            name: 'updates Look Git webview font size when configuration changes',
            run: async () => {
                await runWebviewFontSizeConfigurationE2E();
            },
        },
        {
            name: 'loads Changes view and sort menu entries with checked codicon aliases',
            run: async () => {
                await runChangesNativeViewSortMenuMarkerE2E();
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
            name: 'keeps graph branches visible across user refresh stories',
            run: async () => {
                await runGraphBranchRefreshStoriesE2E();
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
            name: 'runs worktree-aware commit and branch context actions end to end',
            run: async () => {
                await runWorktreeAwareCommitAndBranchMenusE2E();
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

                    await withPatchedVscode({
                        quickPickValues: ['Save Patch to File...'],
                        saveDialogUri: vscode.Uri.file(patchPath),
                    }, async () => {
                        await router.handle({ type: 'graph/commitCommand', command: 'createPatch', hash: head, hashes: [head, base] });
                    });
                    assert.match(fs.readFileSync(patchPath, 'utf8'), /Subject: \[PATCH\] feat: head/);
                    assert.match(fs.readFileSync(patchPath, 'utf8'), /Subject: \[PATCH\] feat: base/);

                    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                    fixture.write('head.txt', 'head local\n');
                    await router.handle({ type: 'graph/commitCommand', command: 'compareWithLocal', hash: base, hashes: [base] });
                    await waitForTabLabel(`Diff ${base.substring(0, 7)}..local`);

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
                        removeDirSyncWithRetry(path.dirname(openedWorktreePath));
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

                    const pushCapture = await withPatchedVscode({ inputBoxValues: ['branch-at-base', 'tag-at-head'], warningChoices: ['Push'], interceptTerminal: true }, async (capture) => {
                        await router.handle({ type: 'graph/commitCommand', command: 'newBranch', hash: base, hashes: [base] });
                        await router.handle({ type: 'graph/commitCommand', command: 'newTag', hash: head, hashes: [head] });
                        await router.handle({ type: 'graph/commitCommand', command: 'pushAllUpToHere', hash: base, hashes: [base] });
                        return capture;
                    });
                    assert.equal(git(fixture.cwd, ['rev-parse', 'branch-at-base']), base);
                    assert.equal(git(fixture.cwd, ['rev-parse', 'tag-at-head']), head);
                    assert.deepEqual(pushCapture.terminalTexts, [`git 'push' 'origin' '${base}:refs/heads/main'`]);

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
            name: 'runs remote branch and commit context actions end to end',
            run: async () => {
                await runRemoteContextActionsE2E();
            },
        },
        {
            name: 'scopes commit history toolbar actions to selected submodules',
            run: async () => {
                await runCommitHistorySubmoduleScopeE2E();
            },
        },
        {
            name: 'runs history-editing commit context actions end to end',
            run: async () => {
                await runResetActionE2E();
                await runRevertActionE2E();
                await runUndoActionE2E();
                await runFloatingCommitMessageEditorE2E();
                await runEditMessageActionE2E();
                await runFixupActionE2E();
                await runSquashActionE2E();
                await runCommitHistorySquashSelectionE2E();
                await runDropActionE2E();
            },
        },
        {
            name: 'generates commit messages for staged repo and submodule changes end to end',
            run: async () => {
                await runGeneratedCommitMessageE2E();
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
                assert.match(styles, /--look-git-row-min-height/);
                assert.match(styles, /--look-git-control-min-height/);
                assert.match(styles, /--look-git-graph-row-height/);
                assert.match(styles, /\.submodule-panel/);
                assert.match(styles, /\.submodule-badge-dirty/);
            },
        },
    ]);
}

interface ExtensionPackageJson {
    readonly contributes?: {
        readonly commands?: readonly ExtensionCommandContribution[];
        readonly menus?: Record<string, readonly ExtensionMenuContribution[] | undefined>;
    };
}

interface ExtensionCommandContribution {
    readonly command: string;
    readonly title: string;
    readonly toggled?: unknown;
}

interface ExtensionMenuContribution {
    readonly command?: string;
    readonly group?: string;
    readonly when?: string;
}

async function runChangesNativeViewSortMenuMarkerE2E(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.look-git');
    await vscode.commands.executeCommand('lookGit.changesView.focus');

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
        'lookGit.changes.viewAsList',
        'lookGit.changes.viewAsListChecked',
        'lookGit.changes.viewAsTree',
        'lookGit.changes.viewAsTreeChecked',
        'lookGit.changes.sortByPath',
        'lookGit.changes.sortByPathChecked',
        'lookGit.changes.sortByName',
        'lookGit.changes.sortByNameChecked',
        'lookGit.changes.sortByStatus',
        'lookGit.changes.sortByStatusChecked',
        'lookGit.changes.sortByExtension',
        'lookGit.changes.sortByExtensionChecked',
    ]) {
        assert.ok(commands.includes(command), `Expected ${command} to be registered in VS Code.`);
    }

    const pkg = readExtensionPackageJson();
    assertCheckedAliasCommand(pkg, 'lookGit.changes.viewAsList', 'View as List');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.viewAsListChecked', '$(check) View as List');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.viewAsTree', 'View as Tree');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.viewAsTreeChecked', '$(check) View as Tree');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.sortByPath', 'Sort by Path');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.sortByPathChecked', '$(check) Sort by Path');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.sortByName', 'Sort by File Name');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.sortByNameChecked', '$(check) Sort by File Name');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.sortByStatus', 'Sort by Status');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.sortByStatusChecked', '$(check) Sort by Status');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.sortByExtension', 'Sort by Extension');
    assertCheckedAliasCommand(pkg, 'lookGit.changes.sortByExtensionChecked', '$(check) Sort by Extension');

    const viewSortMenu = pkg.contributes?.menus?.['lookGit.changes.viewSort'] ?? [];
    assert.deepEqual(viewSortMenu.map((entry) => [entry.command, entry.when]), [
        ['lookGit.changes.viewAsList', 'lookGit.changesViewMode != list'],
        ['lookGit.changes.viewAsListChecked', 'lookGit.changesViewMode == list'],
        ['lookGit.changes.viewAsTree', 'lookGit.changesViewMode != tree'],
        ['lookGit.changes.viewAsTreeChecked', 'lookGit.changesViewMode == tree'],
        ['lookGit.changes.sortByPath', 'lookGit.changesSortMode != path'],
        ['lookGit.changes.sortByPathChecked', 'lookGit.changesSortMode == path'],
        ['lookGit.changes.sortByName', 'lookGit.changesSortMode != name'],
        ['lookGit.changes.sortByNameChecked', 'lookGit.changesSortMode == name'],
        ['lookGit.changes.sortByStatus', 'lookGit.changesSortMode != status'],
        ['lookGit.changes.sortByStatusChecked', 'lookGit.changesSortMode == status'],
        ['lookGit.changes.sortByExtension', 'lookGit.changesSortMode != extension'],
        ['lookGit.changes.sortByExtensionChecked', 'lookGit.changesSortMode == extension'],
    ]);

    await vscode.commands.executeCommand('lookGit.changes.viewAsList');
    await vscode.commands.executeCommand('lookGit.changes.viewAsTreeChecked');
    await vscode.commands.executeCommand('lookGit.changes.sortByExtensionChecked');
    await vscode.commands.executeCommand('lookGit.changes.sortByPath');
}

function readExtensionPackageJson(): ExtensionPackageJson {
    const extension = vscode.extensions.getExtension('mathias8dev.look-git');
    assert.ok(extension, 'Expected Look Git extension to be loaded in the E2E VS Code instance.');
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(extension.extensionPath, 'package.json'), 'utf8'));
    assert.ok(isExtensionPackageJson(parsed), 'Expected extension package.json to be an object.');
    return parsed;
}

function isExtensionPackageJson(value: unknown): value is ExtensionPackageJson {
    return typeof value === 'object' && value !== null;
}

function assertCheckedAliasCommand(pkg: ExtensionPackageJson, command: string, title: string): void {
    const contribution = pkg.contributes?.commands?.find((entry) => entry.command === command);
    assert.ok(contribution, `Expected ${command} to be contributed.`);
    assert.equal(contribution.title, title);
    assert.equal(contribution.toggled, undefined);
}

async function runWebviewFontSizeConfigurationE2E(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.look-git');
    await vscode.commands.executeCommand('lookGit.changesView.focus');
    await vscode.commands.executeCommand('lookGit.commitHistory.focus');
    await vscode.commands.executeCommand('lookGit.graphView.focus');

    const observedFontSizes: number[] = [];
    const disposable = registerWebviewFontSizeSync([{
        notifyFontSizeChanged() {
            observedFontSizes.push(getConfiguredWebviewFontSize());
        },
    }]);

    const configuration = vscode.workspace.getConfiguration();
    const originalLookGitFontSize = configuration.inspect('lookGit.fontSize')?.globalValue;
    const originalEditorFontSize = configuration.inspect('editor.fontSize')?.globalValue;

    try {
        await configuration.update('lookGit.fontSize', 19, vscode.ConfigurationTarget.Global);
        await waitForCondition(
            () => observedFontSizes.includes(19),
            () => `Expected lookGit.fontSize update to notify webviews. Observed: ${observedFontSizes.join(', ')}`,
        );
        assert.equal(getConfiguredWebviewFontSize(), 19);

        await configuration.update('lookGit.fontSize', 0, vscode.ConfigurationTarget.Global);
        await configuration.update('editor.fontSize', 17, vscode.ConfigurationTarget.Global);
        await waitForCondition(
            () => observedFontSizes.includes(17),
            () => `Expected editor.fontSize fallback update to notify webviews. Observed: ${observedFontSizes.join(', ')}`,
        );
        assert.equal(getConfiguredWebviewFontSize(), 17);
    } finally {
        disposable.dispose();
        await configuration.update('lookGit.fontSize', originalLookGitFontSize, vscode.ConfigurationTarget.Global);
        await configuration.update('editor.fontSize', originalEditorFontSize, vscode.ConfigurationTarget.Global);
    }
}

async function runGraphBranchRefreshStoriesE2E(): Promise<void> {
    await runLocalAndRemoteBranchRefreshStoryE2E();
    await runSubmoduleBranchRefreshStoryE2E();
}

async function runLocalAndRemoteBranchRefreshStoryE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const remote = createBareGitRepo();
    const messages: GraphExtensionToWebviewMessage[] = [];

    try {
        fixture.commitFile('README.md', '# Branch refresh\n', 'docs(graph): add branch refresh fixture');
        fixture.git(['remote', 'add', 'origin', remote.cwd]);
        fixture.git(['push', '-u', 'origin', 'main']);
        fixture.git(['checkout', '-q', '-b', 'feature/existing']);
        fixture.commitFile('feature.txt', 'feature\n', 'feat(graph): add existing feature branch');
        fixture.git(['push', '-u', 'origin', 'feature/existing']);
        fixture.git(['checkout', '-q', 'main']);
        fixture.git(['fetch', '-q', 'origin']);

        const router = routerFor(fixture.cwd, messages);
        let state = createInitialGraphState();
        const initialResponse = await requestGraphDataForState(router, messages, state, 'branch-refresh-local');
        state = reduceGraphState(state, { type: 'message', message: initialResponse });
        assertBranchNamesInclude(state, ['main', 'feature/existing', 'origin/main', 'origin/feature/existing'], 'initial local/remote branch refresh story');

        const firstRefresh = reduceGraphState(state, { type: 'refreshRequested' });
        const staleResponse = await requestGraphDataForState(router, messages, firstRefresh, 'branch-refresh-local');

        fixture.git(['branch', 'feature/created-after-refresh']);
        const secondRefresh = reduceGraphState(firstRefresh, { type: 'refreshRequested' });
        const freshResponse = await requestGraphDataForState(router, messages, secondRefresh, 'branch-refresh-local');
        state = reduceGraphState(secondRefresh, { type: 'message', message: freshResponse });

        assertBranchNamesInclude(state, ['main', 'feature/existing', 'feature/created-after-refresh', 'origin/main', 'origin/feature/existing'], 'fresh local/remote branch refresh story');
        const branchNamesAfterFreshRefresh = branchNames(state);

        state = reduceGraphState(state, { type: 'message', message: staleResponse });

        assert.deepEqual(branchNames(state), branchNamesAfterFreshRefresh, 'A late older graph response must not remove branches from the branch panel state.');
        assertNoGraphError(messages);
    } finally {
        fixture.cleanup();
        remote.cleanup();
    }
}

async function runSubmoduleBranchRefreshStoryE2E(): Promise<void> {
    const source = createTempGitRepo();
    const parent = createTempGitRepo();
    const messages: GraphExtensionToWebviewMessage[] = [];

    try {
        source.commitFile('README.md', '# Auth Kit\n', 'docs(auth-kit): add module readme');
        source.git(['checkout', '-q', '-b', 'feature/oauth']);
        source.commitFile('src/oauth.ts', 'export const oauth = true;\n', 'feat(auth-kit): add oauth support');
        source.git(['checkout', '-q', 'main']);

        parent.commitFile('README.md', '# Parent\n', 'docs(submodules): add parent readme');
        parent.git(['-c', 'protocol.file.allow=always', 'submodule', 'add', source.cwd, 'modules/auth-kit']);
        parent.git(['-C', 'modules/auth-kit', 'checkout', '-q', '-b', 'feature/oauth', 'origin/feature/oauth']);
        parent.commit('feat(submodules): add auth-kit module');

        const router = routerFor(parent.cwd, messages);
        let state = createInitialGraphState();
        const parentResponse = await requestGraphDataForState(router, messages, state, 'submodule-branch-refresh');
        state = reduceGraphState(state, { type: 'message', message: parentResponse });

        const submodule = state.submodules.find((candidate) => candidate.path === 'modules/auth-kit');
        assert.ok(submodule, 'Expected the parent graph data to expose the auth-kit submodule.');

        const submodulesPush = await waitForGraphSubmodulesPush(messages, 'modules/auth-kit');
        state = reduceGraphState(state, { type: 'message', message: submodulesPush });

        const hydratedSubmodule = state.submodules.find((candidate) => candidate.path === 'modules/auth-kit');
        assert.ok(hydratedSubmodule?.branches.some((branch) => branch.name === 'feature/oauth'), 'Expected hydrated submodule branch list to include feature/oauth.');

        state = reduceGraphState(state, {
            type: 'selectSubmodule',
            submodulePath: 'modules/auth-kit',
            submoduleLabel: 'auth-kit',
        });
        const scopedResponse = await requestGraphDataForState(router, messages, state, 'submodule-branch-refresh');
        state = reduceGraphState(state, { type: 'message', message: scopedResponse });

        assert.equal(state.repositoryScope.kind, 'submodule');
        assertBranchNamesInclude(state, ['feature/oauth'], 'selected submodule branch refresh story');
        const submoduleBranchNames = branchNames(state);

        await router.pushGraphData({}, undefined);
        state = reduceGraphState(state, { type: 'message', message: lastGraphDataPush(messages) });

        assert.equal(state.repositoryScope.kind, 'submodule');
        assert.deepEqual(branchNames(state), submoduleBranchNames, 'A parent repository data push must not replace the selected submodule branch list.');
        assert.equal(state.loading, true);

        const refreshedScopedResponse = await requestGraphDataForState(router, messages, state, 'submodule-branch-refresh');
        state = reduceGraphState(state, { type: 'message', message: refreshedScopedResponse });

        assert.equal(state.repositoryScope.kind, 'submodule');
        assertBranchNamesInclude(state, ['feature/oauth'], 'refreshed selected submodule branch story');
        assertNoGraphError(messages);
    } finally {
        parent.cleanup();
        source.cleanup();
    }
}

async function runFloatingGraphNodeLayoutE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const messages: GraphExtensionToWebviewMessage[] = [];
    try {
        createFloatingNodeGraphFixture(fixture);
        const router = routerFor(fixture.cwd, messages);
        let state = createInitialGraphState();
        const response = await requestGraphDataForState(router, messages, state, 'floating-layout', 50);

        assertNoGraphError(messages);
        assert.equal(response.data.commits.some((commit) => commit.refs.includes('refs/stash')), false);
        assert.equal(response.data.commits.some((commit) => commit.message.includes('stash graph fixture')), false);
        state = reduceGraphState(state, { type: 'message', message: response });
        assertGraphLayout(state.rows, 'crossing graph fixture');
    } finally {
        fixture.cleanup();
    }

    const largeFixture = createTempGitRepo();
    const largeMessages: GraphExtensionToWebviewMessage[] = [];
    try {
        createLargeOctopusGraphFixture(largeFixture);
        const router = routerFor(largeFixture.cwd, largeMessages);
        let state = createInitialGraphState();
        const response = await requestGraphDataForState(router, largeMessages, state, 'large-floating-layout', 100);

        assertNoGraphError(largeMessages);
        state = reduceGraphState(state, { type: 'message', message: response });
        const topicRows = state.rows.filter((row) => row.commit.message.startsWith('feat(graph): add octopus topic'));
        const baseRow = state.rows.find((row) => row.commit.message === 'feat(graph): add octopus base');
        assert.ok(Math.max(...topicRows.map((row) => row.laneData.lane)) >= 12, 'Expected the fixture to open many graph lanes.');
        assert.equal(baseRow?.laneData.lane, 0);
        assertGraphLayout(state.rows, 'large octopus graph fixture');
    } finally {
        largeFixture.cleanup();
    }

    const filteredFixture = createTempGitRepo();
    try {
        createFilteredHistoryGraphFixture(filteredFixture);
        const pathMessages: GraphExtensionToWebviewMessage[] = [];
        const pathRouter = routerFor(filteredFixture.cwd, pathMessages);
        let pathFilteredState = reduceGraphState(createInitialGraphState(), { type: 'setFilters', filters: { path: 'graph/selected.txt' } });
        const pathFilteredResponse = await requestGraphDataForState(pathRouter, pathMessages, pathFilteredState, 'path-filtered-layout', 80);

        assertNoGraphError(pathMessages);
        pathFilteredState = reduceGraphState(pathFilteredState, { type: 'message', message: pathFilteredResponse });
        assert.ok(pathFilteredState.rows.length >= 8, 'Expected path-filtered graph to include sparse selected-path commits.');
        assertGraphLayout(pathFilteredState.rows, 'path-filtered sparse graph fixture');

        const searchMessages: GraphExtensionToWebviewMessage[] = [];
        const searchRouter = routerFor(filteredFixture.cwd, searchMessages);
        let searchFilteredState = reduceGraphState(createInitialGraphState(), { type: 'setFilters', filters: { search: 'needle' } });
        const searchFilteredResponse = await requestGraphDataForState(searchRouter, searchMessages, searchFilteredState, 'search-filtered-layout', 80);

        assertNoGraphError(searchMessages);
        searchFilteredState = reduceGraphState(searchFilteredState, { type: 'message', message: searchFilteredResponse });
        assert.ok(searchFilteredState.rows.some((row) => row.commit.message.includes('needle')), 'Expected search-filtered graph to include matching commits.');
        assertGraphLayout(searchFilteredState.rows, 'search-filtered non-contiguous graph fixture');
    } finally {
        filteredFixture.cleanup();
    }

    const pagedFixture = createTempGitRepo();
    const pagedMessages: GraphExtensionToWebviewMessage[] = [];
    try {
        createLargeOctopusGraphFixture(pagedFixture);
        const router = routerFor(pagedFixture.cwd, pagedMessages);
        let state = createInitialGraphState();
        const firstResponse = await requestGraphDataForState(router, pagedMessages, state, 'paged-layout', 6);

        assertNoGraphError(pagedMessages);
        state = reduceGraphState(state, { type: 'message', message: firstResponse });
        const lockedLanes = new Map(state.rows.map((row) => [row.commit.hash, row.laneData.lane]));
        assert.ok(state.hasMore, 'Expected first graph page to have more commits.');
        assertGraphLayout(state.rows, 'first paged graph fixture');

        state = reduceGraphState(state, { type: 'startLoadMore' });
        const moreResponse = await requestGraphLoadMoreForState(router, pagedMessages, state, 'paged-layout', 40);

        assertNoGraphError(pagedMessages);
        state = reduceGraphState(state, { type: 'message', message: moreResponse });
        for (const [hash, lane] of lockedLanes) {
            const row = state.rows.find((candidate) => candidate.commit.hash === hash);
            assert.equal(row?.laneData.lane, lane, `Expected loaded-more graph to preserve locked lane for ${hash}.`);
        }
        assertGraphLayout(state.rows, 'loaded-more graph fixture with locked lanes');
    } finally {
        pagedFixture.cleanup();
    }

    const pathologicalFixture = createTempGitRepo();
    const pathologicalMessages: GraphExtensionToWebviewMessage[] = [];
    try {
        createPathologicalMergeGraphFixture(pathologicalFixture);
        const router = routerFor(pathologicalFixture.cwd, pathologicalMessages);
        let state = createInitialGraphState();
        const response = await requestGraphDataForState(router, pathologicalMessages, state, 'pathological-merge-layout', 120);

        assertNoGraphError(pathologicalMessages);
        state = reduceGraphState(state, { type: 'message', message: response });
        assert.ok(Math.max(...state.rows.map((row) => row.laneData.lane)) >= 3, 'Expected pathological merge fixture to open several lanes.');
        assertGraphLayout(state.rows, 'pathological merge graph fixture');
    } finally {
        pathologicalFixture.cleanup();
    }

    const graphHeavyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-graph-heavy-e2e-'));
    try {
        execFileSync('node', [
            path.join(repoRoot, 'scripts', 'look-git.ts'),
            'setup',
            'graph-heavy',
            '--output',
            graphHeavyRoot,
        ], { cwd: repoRoot, encoding: 'utf8' });
        const repoPath = path.join(graphHeavyRoot, 'graph-heavy');

        const fullMessages: GraphExtensionToWebviewMessage[] = [];
        const fullRouter = routerFor(repoPath, fullMessages);
        let fullState = createInitialGraphState();
        const fullResponse = await requestGraphDataForState(fullRouter, fullMessages, fullState, 'graph-heavy-full-layout', 700);

        assertNoGraphError(fullMessages);
        fullState = reduceGraphState(fullState, { type: 'message', message: fullResponse });
        assert.ok(fullState.rows.length >= 500, 'Expected graph-heavy fixture to render a very large history.');
        assert.ok(Math.max(...fullState.rows.map((row) => row.laneData.lane)) >= 8, 'Expected graph-heavy fixture to open many lanes.');
        assertGraphLayout(fullState.rows, 'lookGit graph-heavy full fixture');

        const pathMessages: GraphExtensionToWebviewMessage[] = [];
        const pathRouter = routerFor(repoPath, pathMessages);
        let pathState = reduceGraphState(createInitialGraphState(), { type: 'setFilters', filters: { path: 'src/graph/shared-filter.ts' } });
        const pathResponse = await requestGraphDataForState(pathRouter, pathMessages, pathState, 'graph-heavy-path-layout', 120);

        assertNoGraphError(pathMessages);
        pathState = reduceGraphState(pathState, { type: 'message', message: pathResponse });
        assert.ok(pathState.rows.length >= 20, 'Expected graph-heavy path filter to render a sparse selected-path history.');
        assertGraphLayout(pathState.rows, 'lookGit graph-heavy path-filter fixture');

        const pagedMessages: GraphExtensionToWebviewMessage[] = [];
        const pagedRouter = routerFor(repoPath, pagedMessages);
        let pagedState = createInitialGraphState();
        const firstResponse = await requestGraphDataForState(pagedRouter, pagedMessages, pagedState, 'graph-heavy-paged', 80);
        assertNoGraphError(pagedMessages);
        pagedState = reduceGraphState(pagedState, { type: 'message', message: firstResponse });
        const lockedLanes = new Map(pagedState.rows.map((row) => [row.commit.hash, row.laneData.lane]));

        pagedState = reduceGraphState(pagedState, { type: 'startLoadMore' });
        const moreResponse = await requestGraphLoadMoreForState(pagedRouter, pagedMessages, pagedState, 'graph-heavy-paged', 420);
        assertNoGraphError(pagedMessages);
        pagedState = reduceGraphState(pagedState, { type: 'message', message: moreResponse });
        for (const [hash, lane] of lockedLanes) {
            const row = pagedState.rows.find((candidate) => candidate.commit.hash === hash);
            assert.equal(row?.laneData.lane, lane, `Expected graph-heavy loaded-more graph to preserve locked lane for ${hash}.`);
        }
        assertGraphLayout(pagedState.rows, 'lookGit graph-heavy paged fixture with locked lanes');
    } finally {
        removeDirSyncWithRetry(graphHeavyRoot);
    }
}

async function runWorktreeWipRowsE2E(): Promise<void> {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-worktrees-e2e-'));
    try {
        execFileSync('node', [
            path.join(repoRoot, 'scripts', 'look-git.ts'),
            'setup',
            'worktrees',
            '--output',
            outputRoot,
        ], { cwd: repoRoot, encoding: 'utf8' });
        const repoPath = path.join(outputRoot, 'worktrees');
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = routerFor(repoPath, messages);
        let state = createInitialGraphState();
        const response = await requestGraphDataForState(router, messages, state, 'worktree-wips');

        assertNoGraphError(messages);
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

        state = reduceGraphState(state, { type: 'message', message: response });
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
        removeDirSyncWithRetry(outputRoot);
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

        const syncCapture = await withPatchedVscode({ interceptTerminal: true }, async (capture) => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'fetch', path: worktreePath });
            await router.handle({ type: 'graph/worktreeCommand', command: 'pull', path: worktreePath });
            return capture;
        });
        assert.deepEqual(syncCapture.terminalTexts, [`git 'fetch'`, `git 'pull'`]);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fs.writeFileSync(path.join(worktreePath, 'base.txt'), 'base from worktree\n');
        fs.writeFileSync(path.join(worktreePath, 'untracked-diff.txt'), 'untracked diff\n');
        await router.handle({ type: 'graph/worktreeCommand', command: 'showDiffWithHead', path: worktreePath });
        await waitForTabLabel(`Diff ${path.basename(worktreePath)} with HEAD`);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await router.handle({ type: 'graph/worktreeCommand', command: 'showDiffWithMainWorktree', path: worktreePath });
        await waitForTabLabel(`Diff ${path.basename(worktreePath)} with ${path.basename(fixture.cwd)}`);

        fs.writeFileSync(path.join(worktreePath, 'committed.txt'), 'committed\n');
        await withPatchedVscode({ warningChoices: ['Stage All and Commit'], inputBoxValues: ['feat(worktrees): commit from context action'] }, async () => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'commit', path: worktreePath });
        });
        assert.equal(git(worktreePath, ['log', '-1', '--format=%s']), 'feat(worktrees): commit from context action');
        assert.equal(gitStatus(worktreePath), '');

        const pushCapture = await withPatchedVscode({ interceptTerminal: true }, async (capture) => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'push', path: worktreePath });
            return capture;
        });
        assert.deepEqual(pushCapture.terminalTexts, [`git 'push'`]);

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
        await waitForPathRemoved(forceWorktreePath);

        await withPatchedVscode({ warningChoices: ['Remove'] }, async () => {
            await router.handle({ type: 'graph/worktreeCommand', command: 'remove', path: worktreePath });
        });
        await waitForPathRemoved(worktreePath);
        assertNoGraphError(messages);
    } finally {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        forceLinked?.cleanup();
        linked?.cleanup();
        fixture.cleanup();
        remote.cleanup();
    }
}

async function runWorktreeAwareCommitAndBranchMenusE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const remote = createBareGitRepo();
    const messages: GraphExtensionToWebviewMessage[] = [];
    const worktreePaths: string[] = [];
    try {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.commitFile('main.txt', 'main\n', 'feat: main');
        fixture.git(['remote', 'add', 'origin', remote.cwd]);
        fixture.git(['push', '-u', 'origin', 'main']);
        fixture.git(['branch', 'feature/menu-source', base]);
        fixture.git(['push', '-u', 'origin', 'feature/menu-source']);
        const router = routerFor(fixture.cwd, messages);

        const branchWorktreePath = missingTempPath('look-git-menu-branch-');
        worktreePaths.push(branchWorktreePath);
        await withPatchedVscode({ inputBoxValues: [branchWorktreePath] }, async () => {
            await router.handle({ type: 'graph/branchCommand', command: 'newWorktreeFromBranch', branch: 'feature/menu-source', isRemote: false });
        });
        assert.equal(git(branchWorktreePath, ['branch', '--show-current']), 'feature/menu-source');
        assert.equal(git(branchWorktreePath, ['rev-parse', 'HEAD']), base);
        const canonicalBranchWorktreePath = git(branchWorktreePath, ['rev-parse', '--show-toplevel']);

        const capture = await withPatchedVscode({
            quickPickValues: ['Open in Current Window'],
            interceptOpenFolder: true,
            interceptReveal: true,
        }, async (patched) => {
            await router.handle({ type: 'graph/branchCommand', command: 'openBranchWorktree', branch: 'feature/menu-source', isRemote: false });
            await router.handle({ type: 'graph/branchCommand', command: 'revealBranchWorktree', branch: 'feature/menu-source', isRemote: false });
            return patched;
        });
        assert.deepEqual(capture.commandCalls.map((call) => call.command), ['vscode.openFolder', 'revealFileInOS']);
        assert.ok(samePath(fsPathOf(capture.commandCalls[0]?.args[0]), branchWorktreePath));
        assert.ok(samePath(fsPathOf(capture.commandCalls[1]?.args[0]), branchWorktreePath));

        const remoteCapture = await withPatchedVscode({ interceptTerminal: true }, async (patched) => {
            await router.handle({ type: 'graph/branchCommand', command: 'pullBranchWorktree', branch: 'feature/menu-source', isRemote: false });
            await router.handle({ type: 'graph/branchCommand', command: 'pushBranchWorktree', branch: 'feature/menu-source', isRemote: false });
            return patched;
        });
        assert.deepEqual(remoteCapture.terminalTexts, [
            `git 'pull'`,
            `git 'push' 'origin' 'feature/menu-source:refs/heads/feature/menu-source'`,
        ]);
        await router.handle({ type: 'graph/branchCommand', command: 'lockBranchWorktree', branch: 'feature/menu-source', isRemote: false });
        assert.match(git(fixture.cwd, ['worktree', 'list', '--porcelain']), /locked/);
        await router.handle({ type: 'graph/branchCommand', command: 'unlockBranchWorktree', branch: 'feature/menu-source', isRemote: false });
        assert.doesNotMatch(git(fixture.cwd, ['worktree', 'list', '--porcelain']), /locked/);

        fs.writeFileSync(path.join(branchWorktreePath, 'base.txt'), 'branch worktree dirty\n');
        fs.writeFileSync(path.join(branchWorktreePath, 'branch-untracked.txt'), 'branch untracked\n');
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await router.handle({ type: 'graph/branchCommand', command: 'showDiffWithBranchWorktree', branch: 'feature/menu-source', isRemote: false });
        await waitForTabLabel(`Diff feature/menu-source with ${path.basename(canonicalBranchWorktreePath)}`);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await withPatchedVscode({ quickPickValues: [canonicalBranchWorktreePath] }, async () => {
            await router.handle({ type: 'graph/branchCommand', command: 'compareBranchWithWorktree', branch: 'feature/menu-source', isRemote: false });
        });
        await waitForTabLabel(`Diff feature/menu-source with ${path.basename(canonicalBranchWorktreePath)}`);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        git(branchWorktreePath, ['checkout', '--', 'base.txt']);
        fs.rmSync(path.join(branchWorktreePath, 'branch-untracked.txt'), { force: true });
        await withPatchedVscode({ warningChoices: ['Remove'] }, async () => {
            await router.handle({ type: 'graph/branchCommand', command: 'removeBranchWorktree', branch: 'feature/menu-source', isRemote: false });
        });
        await waitForPathRemoved(branchWorktreePath);

        const remoteBranchWorktreePath = missingTempPath('look-git-menu-remote-branch-');
        worktreePaths.push(remoteBranchWorktreePath);
        await withPatchedVscode({ inputBoxValues: [remoteBranchWorktreePath] }, async () => {
            await router.handle({ type: 'graph/branchCommand', command: 'newWorktreeFromBranch', branch: 'origin/feature/menu-source', isRemote: true });
        });
        assert.equal(git(remoteBranchWorktreePath, ['branch', '--show-current']), 'feature/menu-source');
        assert.equal(git(remoteBranchWorktreePath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']), 'origin/feature/menu-source');

        const commitWorktreePath = missingTempPath('look-git-menu-commit-');
        worktreePaths.push(commitWorktreePath);
        await withPatchedVscode({ inputBoxValues: [commitWorktreePath, 'feature/menu-commit'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'newWorktreeFromCommit', hash: base, hashes: [base] });
        });
        assert.equal(git(commitWorktreePath, ['branch', '--show-current']), 'feature/menu-commit');
        assert.equal(git(commitWorktreePath, ['rev-parse', 'HEAD']), base);

        fs.writeFileSync(path.join(commitWorktreePath, 'base.txt'), 'commit worktree dirty\n');
        fs.writeFileSync(path.join(commitWorktreePath, 'commit-untracked.txt'), 'commit untracked\n');
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        const canonicalCommitWorktreePath = git(commitWorktreePath, ['rev-parse', '--show-toplevel']);
        await withPatchedVscode({ quickPickValues: [canonicalCommitWorktreePath] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'compareCommitWithWorktree', hash: base, hashes: [base] });
        });
        await waitForTabLabel(`Diff ${base.substring(0, 7)} with ${path.basename(canonicalCommitWorktreePath)}`);
        assertNoGraphError(messages);
    } finally {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        for (const worktreePath of worktreePaths) {
            try { fixture.git(['worktree', 'remove', '--force', worktreePath]); } catch {}
            removeDirSyncWithRetry(worktreePath);
        }
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

function createLargeOctopusGraphFixture(fixture: TempGitRepo): void {
    const base = fixture.commitFile('graph/octopus-base.txt', 'base\n', 'feat(graph): add octopus base', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    for (let i = 0; i < 16; i++) {
        fixture.git(['checkout', '-q', '-b', `topic/${i}`, base]);
        const author = FIXTURE_AUTHORS[i % FIXTURE_AUTHORS.length]!;
        fixture.commitFile(`graph/octopus-topic-${i}.txt`, `topic ${i}\n`, `feat(graph): add octopus topic ${i}`, author, `2024-01-02T00:${String(i).padStart(2, '0')}:00Z`);
    }
    fixture.git(['checkout', '-q', 'main']);
    fixture.git(['merge', '-q', '--no-ff', '-m', 'chore(graph): merge octopus topics', ...Array.from({ length: 16 }, (_, i) => `topic/${i}`)], {
        env: {
            GIT_AUTHOR_DATE: '2024-02-01T00:00:00Z',
            GIT_COMMITTER_DATE: '2024-02-01T00:00:00Z',
        },
    });
}

function createFilteredHistoryGraphFixture(fixture: TempGitRepo): void {
    fixture.commitFile('graph/selected.txt', 'selected 0\n', 'feat(graph): add selected path root', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    for (let i = 1; i <= 30; i++) {
        const selected = i % 2 === 0;
        const message = i === 5 || i === 28
            ? `feat(graph): add needle search commit ${i}`
            : `feat(graph): add sparse history commit ${i}`;
        const filePath = selected ? 'graph/selected.txt' : `graph/unrelated-${i}.txt`;
        fixture.commitFile(filePath, `${filePath} ${i}\n`, message, FIXTURE_AUTHORS[i % FIXTURE_AUTHORS.length], `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`);
    }
}

function createPathologicalMergeGraphFixture(fixture: TempGitRepo): void {
    const base = fixture.commitFile('graph/pathological-base.txt', 'base\n', 'feat(graph): add pathological base', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    for (const branch of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
        fixture.git(['checkout', '-q', '-b', `feature/${branch}`, base]);
        for (let i = 1; i <= 3; i++) {
            const authorIndex = i + branch.length;
            fixture.commitFile(
                `graph/${branch}-${i}.txt`,
                `${branch} ${i}\n`,
                `feat(graph): add ${branch} branch commit ${i}`,
                FIXTURE_AUTHORS[authorIndex % FIXTURE_AUTHORS.length],
                `2024-01-${String(authorIndex).padStart(2, '0')}T00:00:00Z`,
            );
        }
    }

    fixture.git(['checkout', '-q', '-b', 'integration/gamma-delta', 'feature/gamma']);
    fixture.git(['merge', '-q', '--no-ff', '-m', 'chore(graph): merge delta into gamma integration', 'feature/delta']);
    fixture.commitFile('graph/gamma-delta-followup.txt', 'followup\n', 'feat(graph): add gamma delta followup', FIXTURE_AUTHORS[6], '2024-02-01T00:00:00Z');

    fixture.git(['checkout', '-q', 'main']);
    fixture.commitFile('graph/main-before-weave.txt', 'main\n', 'feat(graph): add main before weave', FIXTURE_AUTHORS[7], '2024-02-02T00:00:00Z');
    fixture.git(['merge', '-q', '--no-ff', '-m', 'chore(graph): merge alpha and beta into main', 'feature/alpha', 'feature/beta']);
    fixture.commitFile('graph/main-between-weaves.txt', 'main\n', 'feat(graph): add main between weaves', FIXTURE_AUTHORS[8], '2024-02-03T00:00:00Z');
    fixture.git(['merge', '-q', '--no-ff', '-m', 'chore(graph): merge gamma delta integration', 'integration/gamma-delta']);
    fixture.commitFile('graph/main-before-epsilon.txt', 'main\n', 'feat(graph): add main before epsilon', FIXTURE_AUTHORS[9], '2024-02-04T00:00:00Z');
    fixture.git(['merge', '-q', '--no-ff', '-m', 'chore(graph): merge epsilon into main', 'feature/epsilon']);
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
        await waitForTabLabel('Diff main...feature/topic');

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fixture.write('base.txt', 'working tree\n');
        await router.handle({ type: 'graph/branchCommand', command: 'showDiffWithWorkingTree', branch: 'feature/topic', isRemote: false });
        await waitForTabLabel('Diff feature/topic..working tree');
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

        const pushCapture = await withPatchedVscode({ interceptTerminal: true }, async (capture) => {
            await router.handle({ type: 'graph/branchCommand', command: 'push', branch: 'feature/push', isRemote: false });
            return capture;
        });
        assert.deepEqual(pushCapture.terminalTexts, [`git 'push' '-u' 'origin' 'feature/push'`]);

        fixture.git(['push', '-q', 'origin', 'feature/push:feature/push']);
        await withPatchedVscode({ warningChoices: ['Delete Remote'] }, async () => {
            await router.handle({ type: 'graph/branchCommand', command: 'delete', branch: 'origin/feature/push', isRemote: true });
        });

        assert.equal(remote.gitTrim(['branch', '--list', 'feature/push']), '');
        assertNoGraphError(messages);
    } finally {
        fixture.cleanup();
        remote.cleanup();
    }
}

async function runRemoteContextActionsE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const remote = createBareGitRepo();
    const messages: GraphExtensionToWebviewMessage[] = [];
    try {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['remote', 'add', 'origin', remote.cwd]);
        fixture.git(['push', '-u', 'origin', 'main']);
        const checkoutHead = createRemoteOnlyBranchE2E(fixture, 'feature/e2e-checkout', base, 'remote-checkout.txt', 'remote checkout\n', 'feat(graph): add remote checkout branch');
        createRemoteOnlyBranchE2E(fixture, 'feature/e2e-rebase', base, 'remote-rebase.txt', 'remote rebase\n', 'feat(graph): add remote rebase branch');
        const mergeHead = createRemoteOnlyBranchE2E(fixture, 'feature/e2e-merge', base, 'remote-merge.txt', 'remote merge\n', 'feat(graph): add remote merge branch');
        fixture.git(['checkout', '-q', '-b', 'feature/e2e-cherry', base]);
        const older = fixture.commitFile('remote-older.txt', 'older\n', 'feat(graph): add older remote cherry commit');
        const newer = fixture.commitFile('remote-newer.txt', 'newer\n', 'feat(graph): add newer remote cherry commit');
        fixture.git(['push', '-q', 'origin', 'feature/e2e-cherry:feature/e2e-cherry']);
        fixture.git(['checkout', '-q', 'main']);
        fixture.git(['branch', '-D', 'feature/e2e-cherry']);
        fixture.git(['fetch', '-q', 'origin']);
        const mainHead = fixture.commitFile('main.txt', 'main\n', 'feat(graph): add main branch work');
        const router = routerFor(fixture.cwd, messages);

        await router.handle({ type: 'graph/branchCommand', command: 'checkout', branch: 'origin/feature/e2e-checkout', isRemote: true });
        assert.equal(git(fixture.cwd, ['branch', '--show-current']), 'feature/e2e-checkout');
        assert.equal(git(fixture.cwd, ['rev-parse', 'HEAD']), checkoutHead);
        assert.equal(git(fixture.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']), 'origin/feature/e2e-checkout');
        fixture.git(['checkout', '-q', 'main']);
        await router.handle({ type: 'graph/branchCommand', command: 'checkout', branch: 'origin/feature/e2e-checkout', isRemote: true });
        assert.equal(git(fixture.cwd, ['branch', '--show-current']), 'feature/e2e-checkout');

        fixture.git(['checkout', '-q', 'main']);
        await withPatchedVscode({ inputBoxValues: ['feature/e2e-from-remote'] }, async () => {
            await router.handle({ type: 'graph/branchCommand', command: 'newBranchFrom', branch: 'origin/feature/e2e-checkout', isRemote: true });
        });
        assert.equal(git(fixture.cwd, ['rev-parse', 'feature/e2e-from-remote']), checkoutHead);

        fixture.git(['checkout', '-q', 'main']);
        await router.handle({ type: 'graph/branchCommand', command: 'checkoutRebaseOnto', branch: 'origin/feature/e2e-rebase', isRemote: true });
        assert.equal(git(fixture.cwd, ['branch', '--show-current']), 'feature/e2e-rebase');
        assert.equal(git(fixture.cwd, ['merge-base', 'HEAD', 'main']), mainHead);

        fixture.git(['checkout', '-q', '-b', 'feature/e2e-local-topic', base]);
        fixture.commitFile('topic.txt', 'topic\n', 'feat(graph): add local rebase topic');
        await router.handle({ type: 'graph/branchCommand', command: 'rebaseOnto', branch: 'origin/feature/e2e-merge', isRemote: true });
        assert.equal(git(fixture.cwd, ['merge-base', 'HEAD', 'origin/feature/e2e-merge']), mergeHead);

        fixture.git(['checkout', '-q', 'main']);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await router.handle({ type: 'graph/branchCommand', command: 'compareWithCurrent', branch: 'origin/feature/e2e-merge', isRemote: true });
        await waitForTabLabel('Diff main...origin/feature/e2e-merge');

        await router.handle({ type: 'graph/branchCommand', command: 'mergeInto', branch: 'origin/feature/e2e-merge', isRemote: true });
        assert.equal(git(fixture.cwd, ['show', 'HEAD:remote-merge.txt']), 'remote merge');
        assert.equal(git(fixture.cwd, ['log', '-1', '--format=%P']).split(' ').length, 2);

        await router.handle({ type: 'graph/commitCommand', command: 'cherryPick', hash: newer, hashes: [newer, older] });
        assert.equal(git(fixture.cwd, ['show', 'HEAD:remote-newer.txt']), 'newer');
        assert.equal(git(fixture.cwd, ['show', 'HEAD~1:remote-older.txt']), 'older');
        assertNoGraphError(messages);
    } finally {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fixture.cleanup();
        remote.cleanup();
    }
}

function createRemoteOnlyBranchE2E(fixture: TempGitRepo, branch: string, startPoint: string, filePath: string, content: string, message: string): string {
    fixture.git(['checkout', '-q', '-b', branch, startPoint]);
    const head = fixture.commitFile(filePath, content, message);
    fixture.git(['push', '-q', 'origin', `${branch}:${branch}`]);
    fixture.git(['checkout', '-q', 'main']);
    fixture.git(['branch', '-D', branch]);
    fixture.git(['fetch', '-q', 'origin']);
    return head;
}

async function runCommitHistorySubmoduleScopeE2E(): Promise<void> {
    await runCommitHistorySubmoduleReadNavigationStoryE2E();
    await runCommitHistorySubmoduleRemoteToolbarStoryE2E();
}

async function runCommitHistorySubmoduleReadNavigationStoryE2E(): Promise<void> {
    const fixture = createCommitHistorySubmoduleFixture();
    try {
        const { view } = await historyHarnessFor(fixture.parent.cwd);

        await withPatchedVscode({ quickPickValues: ['Submodule: modules/auth-kit'] }, async () => {
            sendHistoryMessage(view, { type: 'history/toolbarCommand', command: 'selectRepositoryScope' });
            await waitForHistoryCommitMessage(view.messages, 'feat(auth-kit): add oauth support');
        });
        assert.doesNotMatch(historyMessages(lastHistoryData(view.messages)).join('\n'), /feat\(submodules\): add auth-kit module/);

        view.messages = [];
        sendHistoryMessage(view, { type: 'history/toolbarCommand', command: 'goToCurrent' });
        await waitForHistorySelectCommit(view.messages, fixture.featureHead);

        view.messages = [];
        await withPatchedVscode({ quickPickValues: ['main'] }, async () => {
            sendHistoryMessage(view, { type: 'history/toolbarCommand', command: 'selectBranch' });
            await waitForHistoryCommitMessage(view.messages, 'docs(auth-kit): add module readme');
        });
        assert.doesNotMatch(historyMessages(lastHistoryData(view.messages)).join('\n'), /feat\(auth-kit\): add oauth support/);

        view.messages = [];
        sendHistoryMessage(view, { type: 'history/toolbarCommand', command: 'goToCurrent' });
        await waitForHistorySelectCommit(view.messages, fixture.featureHead);
        await waitForHistoryCommitMessage(view.messages, 'feat(auth-kit): add oauth support');
    } finally {
        fixture.cleanup();
    }
}

async function runCommitHistorySubmoduleRemoteToolbarStoryE2E(): Promise<void> {
    const fixture = createCommitHistorySubmoduleFixture();
    const remoteBackend = capturingRemoteBackend();
    let repositoryUpdateCount = 0;
    try {
        const { view } = await historyHarnessFor(
            fixture.parent.cwd,
            remoteBackend.backend,
            async () => { repositoryUpdateCount++; },
        );
        const submoduleCwd = path.join(fixture.parent.cwd, 'modules', 'auth-kit');

        await withPatchedVscode({ quickPickValues: ['Submodule: modules/auth-kit'] }, async () => {
            sendHistoryMessage(view, { type: 'history/toolbarCommand', command: 'selectRepositoryScope' });
            await waitForHistoryCommitMessage(view.messages, 'feat(auth-kit): add oauth support');
        });

        for (const command of ['fetchAll', 'pull', 'push'] as const) {
            sendHistoryMessage(view, { type: 'history/toolbarCommand', command });
            await waitForCondition(
                () => remoteBackend.calls.some((call) => call.command === command),
                () => `Expected commit history toolbar command ${command} to run.`,
            );
        }

        assert.deepEqual(remoteBackend.calls.map((call) => ({ command: call.command, cwd: call.cwd })), [
            { command: VscodeRemoteCommand.FetchAll, cwd: submoduleCwd },
            { command: VscodeRemoteCommand.Pull, cwd: submoduleCwd },
            { command: VscodeRemoteCommand.Push, cwd: submoduleCwd },
        ]);
        await waitForCondition(
            () => repositoryUpdateCount === 3,
            () => `Expected repository update callback after each remote action, got ${repositoryUpdateCount}.`,
        );
        await waitForHistoryCommitMessage(view.messages, 'feat(auth-kit): add oauth support');
    } finally {
        fixture.cleanup();
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

async function runFloatingCommitMessageEditorE2E(): Promise<void> {
    const configuration = vscode.workspace.getConfiguration();
    const inspected = configuration.inspect<string>('lookGit.commitMessageEditor');
    const originalGlobalMode = inspected?.globalValue;
    const originalWorkspaceMode = inspected?.workspaceValue;
    await configuration.update('lookGit.commitMessageEditor', 'window', vscode.ConfigurationTarget.Global);
    await configuration.update('lookGit.commitMessageEditor', 'window', vscode.ConfigurationTarget.Workspace);
    try {
        await withTempCommitRepo(async ({ fixture, head, router, messages }) => {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await withPatchedVscode({ interceptCommitMessagePanel: true, interceptFloatingWindowMove: true }, async (capture) => {
                const edit = router.handle({ type: 'graph/commitCommand', command: 'editCommitMessage', hash: head, hashes: [head] });
                await waitForCondition(
                    () => capture.webviewPanel !== undefined,
                    () => 'Expected Look Git commit message webview panel to open.',
                );
                capture.webviewPanel?.webview.messageHandler?.({ type: 'commitMessage/ready' });
                expectLastCommitMessageInit(capture.webviewPanel, 'feat: head');

                capture.webviewPanel?.webview.messageHandler?.({ type: 'commitMessage/apply', message: 'fix: edited through floating editor\n\nbody' });
                await withTimeout(edit, 10000, () => commitMessageEditorDiagnostics('floating editor reword did not finish'));
                assert.ok(capture.commandCalls.some((call) => call.command === 'workbench.action.moveEditorToNewWindow'));
                assert.equal(capture.webviewPanel?.disposed, true);
                assert.equal(git(fixture.cwd, ['log', '-1', '--format=%B']), 'fix: edited through floating editor\n\nbody');
                assertNoGraphError(messages);
            });
        });
    } finally {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await configuration.update('lookGit.commitMessageEditor', originalWorkspaceMode, vscode.ConfigurationTarget.Workspace);
        await configuration.update('lookGit.commitMessageEditor', originalGlobalMode, vscode.ConfigurationTarget.Global);
    }
}

async function runEditMessageActionE2E(): Promise<void> {
    const configuration = vscode.workspace.getConfiguration();
    const inspected = configuration.inspect<string>('lookGit.commitMessageEditor');
    const originalGlobalMode = inspected?.globalValue;
    const originalWorkspaceMode = inspected?.workspaceValue;
    await configuration.update('lookGit.commitMessageEditor', 'input', vscode.ConfigurationTarget.Global);
    await configuration.update('lookGit.commitMessageEditor', 'input', vscode.ConfigurationTarget.Workspace);
    try {
        await runEditMessageActionE2EBody();
    } finally {
        await configuration.update('lookGit.commitMessageEditor', originalWorkspaceMode, vscode.ConfigurationTarget.Workspace);
        await configuration.update('lookGit.commitMessageEditor', originalGlobalMode, vscode.ConfigurationTarget.Global);
    }
}

async function runEditMessageActionE2EBody(): Promise<void> {
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
    await withTempCommitRepo(async ({ fixture, router, messages }) => {
        const older = fixture.commitFile('older.txt', 'older\n', 'feat: older');
        const newer = fixture.commitFile('newer.txt', 'newer\n', 'feat: newer');
        fixture.commitFile('tail.txt', 'tail\n', 'feat: tail');
        await withPatchedVscode({ inputBoxValues: ['feat: squashed selected commits'] }, async () => {
            await router.handle({ type: 'graph/commitCommand', command: 'squashInto', hash: newer, hashes: [newer, older] });
        });
        assert.equal(git(fixture.cwd, ['rev-list', '--count', 'HEAD']), '4');
        assert.equal(git(fixture.cwd, ['log', '--format=%s', '--reverse']), 'feat: base\nfeat: head\nfeat: squashed selected commits\nfeat: tail');
        assert.equal(git(fixture.cwd, ['show', 'HEAD~1:older.txt']), 'older');
        assert.equal(git(fixture.cwd, ['show', 'HEAD~1:newer.txt']), 'newer');
        assertNoGraphError(messages);
    });
}

async function runCommitHistorySquashSelectionE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    try {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        const older = fixture.commitFile('older.txt', 'older\n', 'feat: older');
        const newer = fixture.commitFile('newer.txt', 'newer\n', 'feat: newer');
        fixture.commitFile('tail.txt', 'tail\n', 'feat: tail');
        const { view, provider } = await historyHarnessFor(fixture.cwd);

        sendHistoryMessage(view, {
            type: 'history/contextTarget',
            target: {
                kind: 'commit',
                hash: newer,
                hashes: [newer],
                canUndoCommit: false,
            },
        });
        await provider.runCommitContextCommand('squashInto');
        const singleSelectionError = view.messages.find((message) => message.type === 'history/error' && message.error.operation === 'history/squashInto');
        assert.ok(singleSelectionError && singleSelectionError.type === 'history/error');
        assert.equal(singleSelectionError.message, 'Select at least two commits to squash.');
        assert.equal(git(fixture.cwd, ['log', '--format=%s', '--reverse']), 'feat: base\nfeat: older\nfeat: newer\nfeat: tail');

        view.messages.splice(0);
        sendHistoryMessage(view, {
            type: 'history/contextTarget',
            target: {
                kind: 'commit',
                hash: newer,
                hashes: [newer, older],
                canUndoCommit: false,
            },
        });
        await withPatchedVscode({ inputBoxValues: ['feat: history squash multi-select'] }, async () => {
            await provider.runCommitContextCommand('squashInto');
        });

        assert.equal(git(fixture.cwd, ['rev-list', '--count', 'HEAD']), '3');
        assert.equal(git(fixture.cwd, ['log', '--format=%s', '--reverse']), 'feat: base\nfeat: history squash multi-select\nfeat: tail');
        assert.equal(git(fixture.cwd, ['show', 'HEAD~1:older.txt']), 'older');
        assert.equal(git(fixture.cwd, ['show', 'HEAD~1:newer.txt']), 'newer');
        assert.ok(view.messages.some((message) => message.type === 'history/data'), 'Expected commit history to refresh after a successful squash.');
    } finally {
        fixture.cleanup();
    }
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

async function runGeneratedCommitMessageE2E(): Promise<void> {
    await runGeneratedCommitMessageForMainRepoE2E();
    await runGeneratedCommitMessageForSubmoduleE2E();
}

async function runGeneratedCommitMessageForMainRepoE2E(): Promise<void> {
    const fixture = createTempGitRepo();
    const messages: ChangesExtensionToWebviewMessage[] = [];
    const capturedInputs: CommitMessageGeneratorInput[] = [];
    try {
        fixture.commitFile('src/app.ts', 'old\n', 'feat(changes): seed app');
        fixture.write('src/app.ts', 'old\nnew\n');
        fixture.git(['add', 'src/app.ts']);

        const generateCommitMessage = new GenerateCommitMessageUseCase({
            generateCommitMessage: async (input) => {
                capturedInputs.push(input);
                return '{"message":"fix(changes): generate staged message"}';
            },
        });
        const router = changesRouterFor(fixture.cwd, messages, generateCommitMessage);

        await router.handle({ type: 'changes/generateCommitMessage', requestId: 'generate-main' });

        const response = generatedCommitMessageResponse(messages, 'generate-main');
        assert.equal(response.message, 'fix(changes): generate staged message');
        const input = arrayItem(capturedInputs, 0);
        assert.deepEqual(input.changedFiles, ['M src/app.ts']);
        assert.match(input.diffStat, /src\/app\.ts/);
        assert.match(input.stagedDiff, /\+new/);
        assert.deepEqual(input.recentCommitSubjects, ['feat(changes): seed app']);
        assertNoChangesError(messages);
    } finally {
        fixture.cleanup();
    }
}

async function runGeneratedCommitMessageForSubmoduleE2E(): Promise<void> {
    const fixture = createSubmoduleFixture();
    const messages: ChangesExtensionToWebviewMessage[] = [];
    const capturedInputs: CommitMessageGeneratorInput[] = [];
    try {
        const childPath = path.join(fixture.parent.cwd, fixture.subPath);
        fs.writeFileSync(path.join(childPath, 'child.txt'), 'child content\nnew child\n');
        git(childPath, ['add', 'child.txt']);

        const generateCommitMessage = new GenerateCommitMessageUseCase({
            generateCommitMessage: async (input) => {
                capturedInputs.push(input);
                return 'fix(child): generate submodule message';
            },
        });
        const router = changesRouterFor(fixture.parent.cwd, messages, generateCommitMessage);

        await router.handle({
            type: 'changes/generateSubmoduleCommitMessage',
            requestId: 'generate-submodule',
            submodulePath: fixture.subPath,
        });

        const response = submoduleGeneratedCommitMessageResponse(messages, 'generate-submodule');
        assert.equal(response.path, fixture.subPath);
        assert.equal(response.message, 'fix(child): generate submodule message');
        const input = arrayItem(capturedInputs, 0);
        assert.deepEqual(input.changedFiles, ['M child.txt']);
        assert.match(input.diffStat, /child\.txt/);
        assert.match(input.stagedDiff, /\+new child/);
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
    return new GraphMessageRouter(accessor, (message) => { messages.push(message); }, async () => {}, undefined, undefined, undefined, undefined, vscode.Uri.file(repoRoot));
}

async function historyHarnessFor(
    repoPath: string,
    remoteCommands?: RemoteCommandBackend,
    onRepositoryUpdated: () => Promise<void> = async () => {},
): Promise<{ readonly view: HistoryE2eWebviewView; readonly provider: CommitHistoryViewProvider }> {
    const repo = new GitProcessRepository(repoPath);
    const accessor: ActiveRepositoryAccessor = {
        currentRepository: repo,
        currentContext: undefined,
        requireRepository: () => repo,
    };
    const provider = new CommitHistoryViewProvider(
        vscode.Uri.file(repoRoot),
        accessor,
        onRepositoryUpdated,
        remoteCommands,
    );
    const view = makeHistoryWebviewView();

    provider.resolveWebviewView(view);
    await waitForCondition(
        () => view.messages.some((message) => message.type === 'history/data'),
        () => 'Expected commit history provider to post initial history/data.',
    );
    return { view, provider };
}

function changesRouterFor(
    repoPath: string,
    messages: ChangesExtensionToWebviewMessage[],
    generateCommitMessage?: GenerateCommitMessageUseCase,
): ChangesMessageRouter {
    const repo = new GitProcessRepository(repoPath);
    const accessor: ActiveRepositoryAccessor = {
        currentRepository: repo,
        currentContext: undefined,
        requireRepository: () => repo,
    };
    if (!generateCommitMessage) {
        return new ChangesMessageRouter(accessor, (message) => { messages.push(message); }, async () => undefined);
    }
    return new ChangesMessageRouter(
        accessor,
        (message) => { messages.push(message); },
        async () => undefined,
        async () => undefined,
        noOpRemoteCommandBackend,
        generateCommitMessage,
    );
}

const noOpRemoteCommandBackend: RemoteCommandBackend = {
    runVscode: async () => undefined,
    runCli: async () => undefined,
};

interface HistoryE2eWebviewView extends vscode.WebviewView {
    messages: HistoryExtensionToWebviewMessage[];
    messageHandler: ((message: HistoryWebviewToExtensionMessage) => void) | undefined;
}

function makeHistoryWebviewView(): HistoryE2eWebviewView {
    const view: HistoryE2eWebviewView = {
        viewType: 'lookGit.commitHistory',
        webview: {
            options: {},
            html: '',
            cspSource: 'vscode-webview:',
            postMessage(message: unknown): Thenable<boolean> {
                // The harness is wired only to CommitHistoryViewProvider.postMessage.
                view.messages.push(message as HistoryExtensionToWebviewMessage);
                return Promise.resolve(true);
            },
            onDidReceiveMessage(
                listener: (message: unknown) => unknown,
                _thisArgs?: unknown,
                _disposables?: vscode.Disposable[],
            ): vscode.Disposable {
                view.messageHandler = (message) => { listener(message); };
                return { dispose() {} };
            },
            asWebviewUri(uri: vscode.Uri): vscode.Uri { return uri; },
        },
        visible: true,
        badge: undefined,
        messages: [],
        messageHandler: undefined,
        onDidDispose(_listener: () => unknown): vscode.Disposable { return { dispose() {} }; },
        onDidChangeVisibility(_listener: () => unknown): vscode.Disposable { return { dispose() {} }; },
        show() {},
    };
    return view;
}

function sendHistoryMessage(view: HistoryE2eWebviewView, message: HistoryWebviewToExtensionMessage): void {
    assert.ok(view.messageHandler, 'Expected history webview message handler to be registered.');
    view.messageHandler(message);
}

interface CommitHistorySubmoduleFixture {
    readonly parent: TempGitRepo;
    readonly source: TempGitRepo;
    readonly featureHead: string;
    readonly mainHead: string;
    cleanup(): void;
}

function createCommitHistorySubmoduleFixture(): CommitHistorySubmoduleFixture {
    const source = createTempGitRepo();
    const parent = createTempGitRepo();
    try {
        const mainHead = source.commitFile('README.md', '# Auth Kit\n', 'docs(auth-kit): add module readme');
        source.git(['checkout', '-q', '-b', 'feature/oauth']);
        const featureHead = source.commitFile('src/oauth.ts', 'export const oauth = true;\n', 'feat(auth-kit): add oauth support');
        source.git(['checkout', '-q', 'main']);

        parent.commitFile('README.md', '# Parent\n', 'docs(parent): add readme');
        parent.git(['-c', 'protocol.file.allow=always', 'submodule', 'add', source.cwd, 'modules/auth-kit']);
        parent.git(['-C', 'modules/auth-kit', 'checkout', '-q', '-b', 'feature/oauth', 'origin/feature/oauth']);
        parent.commit('feat(submodules): add auth-kit module');

        return {
            parent,
            source,
            featureHead,
            mainHead,
            cleanup() {
                parent.cleanup();
                source.cleanup();
            },
        };
    } catch (error) {
        parent.cleanup();
        source.cleanup();
        throw error;
    }
}

function capturingRemoteBackend(): {
    readonly calls: Array<{ readonly command: VscodeRemoteCommand; readonly cwd: string }>;
    readonly backend: RemoteCommandBackend;
} {
    const calls: Array<{ readonly command: VscodeRemoteCommand; readonly cwd: string }> = [];
    const backend: RemoteCommandBackend = {
        async runVscode(repo: GitRepository, command: VscodeRemoteCommand): Promise<void> {
            calls.push({ command, cwd: repo.cwd });
        },
        async runCli(_repo: GitRepository, _command: CliRemoteCommand): Promise<void> {},
    };
    return { calls, backend };
}

async function requestGraphDataForState(
    router: GraphMessageRouter,
    messages: GraphExtensionToWebviewMessage[],
    state: GraphState,
    repoId: string,
    limit = 120,
): Promise<GraphDataResponse> {
    const requestId = state.activeGraphRequestId;
    assert.ok(requestId, 'Expected graph state to have an active graph request id.');
    await router.handle({
        type: 'graph/dataRequest',
        requestId,
        repoId,
        filters: state.filters,
        page: { offset: 0, limit },
        repositoryScope: state.repositoryScope,
    });
    return graphDataResponse(messages, requestId);
}

async function requestGraphLoadMoreForState(
    router: GraphMessageRouter,
    messages: GraphExtensionToWebviewMessage[],
    state: GraphState,
    repoId: string,
    limit: number,
): Promise<GraphDataResponse> {
    const requestId = state.activeGraphRequestId;
    assert.ok(requestId, 'Expected graph state to have an active load-more request id.');
    await router.handle({
        type: 'graph/loadMore',
        requestId,
        repoId,
        filters: state.filters,
        page: { offset: state.loadedCount, limit },
        repositoryScope: state.repositoryScope,
    });
    return graphDataResponse(messages, requestId);
}

function branchNames(state: GraphState): readonly string[] {
    return state.branches.map((branch) => branch.name).sort();
}

function assertBranchNamesInclude(state: GraphState, expected: readonly string[], label: string): void {
    const names = new Set(branchNames(state));
    for (const branch of expected) {
        assert.ok(names.has(branch), `Expected ${label} to include branch ${branch}. Actual branches: ${Array.from(names).join(', ')}`);
    }
}

function assertGraphLayout(rows: readonly GraphRow[], label: string): void {
    const nonVisibleTargetIssues = findNonVisibleLineTargetIssues(rows);
    assert.deepEqual(nonVisibleTargetIssues, [], `Expected graph lines to target visible commits in ${label}. Issues: ${JSON.stringify(nonVisibleTargetIssues)}`);

    const passThroughIssues = findCommitLanePassThroughIssues(rows);
    assert.deepEqual(passThroughIssues, [], `Expected graph pass-through lines not to cross commit lanes in ${label}. Issues: ${JSON.stringify(passThroughIssues)}`);

    const adjacentDisconnectedIssues = findAdjacentDisconnectedSameLaneIssues(rows);
    assert.deepEqual(adjacentDisconnectedIssues, [], `Expected graph rows not to reuse a disconnected lane in ${label}. Issues: ${JSON.stringify(adjacentDisconnectedIssues)}`);

    const floatingIssues = findFloatingNodeIssues(rows);
    assert.deepEqual(floatingIssues, [], `Expected all visible graph nodes to be connected in ${label}. Issues: ${JSON.stringify(floatingIssues)}`);

    const continuityIssues = findLaneContinuityIssues(rows);
    assert.deepEqual(continuityIssues, [], `Expected graph lanes to stay continuous in ${label}. Issues: ${JSON.stringify(continuityIssues)}`);
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
    readonly interceptReveal?: boolean;
    readonly interceptTerminal?: boolean;
    readonly interceptFloatingWindowMove?: boolean;
    readonly interceptCommitMessagePanel?: boolean;
}

interface VscodePatchCapture {
    readonly commandCalls: Array<{ readonly command: string; readonly args: readonly unknown[] }>;
    readonly terminalTexts: string[];
    webviewPanel?: E2EWebviewPanel;
}

interface E2EWebviewPanel {
    readonly viewType: string;
    disposed: boolean;
    readonly webview: {
        html: string;
        messages: unknown[];
        messageHandler?: (message: unknown) => void;
        postMessage(message: unknown): Promise<boolean>;
        onDidReceiveMessage(listener: (message: unknown) => unknown): vscode.Disposable;
        asWebviewUri(uri: vscode.Uri): vscode.Uri;
    };
    reveal(column?: vscode.ViewColumn): void;
    onDidDispose(listener: () => unknown): vscode.Disposable;
    dispose(): void;
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
    const originalCreateWebviewPanel = vscode.window.createWebviewPanel;

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
            if (options.interceptReveal && command === 'revealFileInOS') { return undefined; }
            if (options.interceptFloatingWindowMove && command === 'workbench.action.moveEditorToNewWindow') { return undefined; }
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
    Object.defineProperty(vscode.window, 'createWebviewPanel', {
        configurable: true,
        value: (viewType: string, title: string, showOptions: vscode.ViewColumn, panelOptions: vscode.WebviewPanelOptions & vscode.WebviewOptions) => {
            if (!options.interceptCommitMessagePanel || viewType !== 'lookGit.commitMessageEditor') {
                return originalCreateWebviewPanel.call(vscode.window, viewType, title, showOptions, panelOptions);
            }
            const panel = createE2EWebviewPanel(viewType);
            capture.webviewPanel = panel;
            return panel;
        },
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
        Object.defineProperty(vscode.window, 'createWebviewPanel', { configurable: true, value: originalCreateWebviewPanel });
    }
}

function createE2EWebviewPanel(viewType: string): E2EWebviewPanel {
    const disposeEmitter = new vscode.EventEmitter<void>();
    return {
        viewType,
        disposed: false,
        webview: {
            html: '',
            messages: [],
            postMessage(message: unknown): Promise<boolean> {
                this.messages.push(message);
                return Promise.resolve(true);
            },
            onDidReceiveMessage(listener: (message: unknown) => unknown): vscode.Disposable {
                this.messageHandler = (message: unknown) => { listener(message); };
                return { dispose() {} };
            },
            asWebviewUri(uri: vscode.Uri): vscode.Uri { return uri; },
        },
        reveal() {},
        onDidDispose(listener: () => unknown): vscode.Disposable {
            return disposeEmitter.event(listener);
        },
        dispose() {
            if (this.disposed) { return; }
            this.disposed = true;
            disposeEmitter.fire();
            disposeEmitter.dispose();
        },
    };
}

function fsPathOf(value: unknown): string {
    assert.ok(typeof value === 'object' && value !== null && 'fsPath' in value);
    const fsPath = value.fsPath;
    assert.equal(typeof fsPath, 'string');
    if (typeof fsPath !== 'string') { throw new Error('Expected URI fsPath.'); }
    return fsPath;
}

function missingTempPath(prefix: string): string {
    // realpath the tmp base so the returned path matches git output (macOS resolves /var -> /private/var).
    const tempPath = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
    fs.rmSync(tempPath, { recursive: true, force: true });
    return tempPath;
}

async function waitForGitFileContent(repoPath: string, filePath: string, ref: string, expected: string): Promise<void> {
    const uri = gitObjectUri(repoPath, filePath, ref);
    let lastError = '';

    for (let attempt = 0; attempt < 40; attempt++) {
        try {
            const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            // The built-in git: content provider may return CRLF on Windows; compare on content, not EOL.
            if (content.replace(/\r\n/g, '\n') === expected) { return; }
            lastError = `read "${content}"`;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        await sleep(100);
    }

    assert.fail(`Expected Git file content for ${filePath} at ${ref}: ${lastError}`);
}

// Windows defers directory deletion while handles are open, so a removed worktree dir can linger
// briefly after git reports success. Poll instead of asserting immediately.
async function waitForPathRemoved(target: string): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (!fs.existsSync(target)) { return; }
        await sleep(100);
    }
    assert.equal(fs.existsSync(target), false, `Expected path to be removed: ${target}`);
}

function gitObjectUri(repoPath: string, filePath: string, ref: string): vscode.Uri {
    const uri = vscode.Uri.file(path.join(repoPath, filePath));
    return uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.fsPath, ref }) });
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

async function withTimeout<T>(promise: Promise<T>, ms: number, message: () => string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_resolve, reject) => {
                timeout = setTimeout(() => { reject(new Error(message())); }, ms);
            }),
        ]);
    } finally {
        if (timeout) { clearTimeout(timeout); }
    }
}

function commitMessageEditorDiagnostics(prefix: string): string {
    const documents = vscode.workspace.textDocuments.map((document) => document.uri.toString());
    const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs).map((tab) => tab.label);
    return `${prefix}. Documents: ${documents.join(', ')}. Tabs: ${tabs.join(', ')}.`;
}

function expectLastCommitMessageInit(panel: E2EWebviewPanel | undefined, expectedMessage: string): void {
    assert.ok(panel, 'Expected commit message webview panel.');
    const message = panel.webview.messages.at(-1);
    assert.ok(typeof message === 'object' && message !== null && 'type' in message);
    assert.equal(message.type, 'commitMessage/init');
    assert.ok('message' in message);
    assert.equal(message.message, expectedMessage);
}

async function waitForCondition(predicate: () => boolean, failureMessage: () => string): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt++) {
        if (predicate()) { return; }
        await sleep(100);
    }
    assert.fail(failureMessage());
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

function lastHistoryData(messages: readonly HistoryExtensionToWebviewMessage[]): Extract<HistoryExtensionToWebviewMessage, { readonly type: 'history/data' }> {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message?.type === 'history/data') { return message; }
    }
    assert.fail('Expected history/data.');
}

function historyMessages(message: Extract<HistoryExtensionToWebviewMessage, { readonly type: 'history/data' }>): readonly string[] {
    return message.data.commits.map((commit) => commit.message);
}

async function waitForHistoryCommitMessage(
    messages: readonly HistoryExtensionToWebviewMessage[],
    expected: string,
): Promise<void> {
    await waitForCondition(
        () => messages.some((message) => message.type === 'history/data'
            && message.data.commits.some((commit) => commit.message === expected)),
        () => `Expected commit history data to include "${expected}".`,
    );
}

async function waitForHistorySelectCommit(
    messages: readonly HistoryExtensionToWebviewMessage[],
    hash: string,
): Promise<void> {
    await waitForCondition(
        () => messages.some((message) => message.type === 'history/selectCommit' && message.hash === hash),
        () => `Expected commit history to select ${hash}.`,
    );
}

function lastGraphDataPush(messages: readonly GraphExtensionToWebviewMessage[]): Extract<GraphExtensionToWebviewMessage, { readonly type: 'graph/dataPush' }> {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message?.type === 'graph/dataPush') { return message; }
    }
    assert.fail('Expected graph/dataPush.');
}

async function waitForGraphSubmodulesPush(messages: readonly GraphExtensionToWebviewMessage[], submodulePath: string): Promise<GraphSubmodulesPush> {
    await waitForCondition(
        () => messages.some((message) => message.type === 'graph/submodulesPush'
            && message.submodules.some((submodule) => submodule.path === submodulePath)),
        () => `Expected graph/submodulesPush for ${submodulePath}.`,
    );
    return lastGraphSubmodulesPush(messages, submodulePath);
}

function lastGraphSubmodulesPush(messages: readonly GraphExtensionToWebviewMessage[], submodulePath: string): GraphSubmodulesPush {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message?.type === 'graph/submodulesPush' && message.submodules.some((submodule) => submodule.path === submodulePath)) {
            return message;
        }
    }
    assert.fail(`Expected graph/submodulesPush for ${submodulePath}.`);
}

function assertNoChangesError(messages: readonly ChangesExtensionToWebviewMessage[]): void {
    const error = messages.find((message) => message.type === 'changes/error');
    assert.equal(error, undefined, error?.message);
}

function generatedCommitMessageResponse(
    messages: readonly ChangesExtensionToWebviewMessage[],
    requestId: string,
): Extract<ChangesExtensionToWebviewMessage, { readonly type: 'changes/generatedCommitMessage' }> {
    const response = messages.find((message): message is Extract<ChangesExtensionToWebviewMessage, { readonly type: 'changes/generatedCommitMessage' }> =>
        message.type === 'changes/generatedCommitMessage' && message.requestId === requestId);
    assert.ok(response, `Expected generated commit message response for ${requestId}.`);
    return response;
}

function submoduleGeneratedCommitMessageResponse(
    messages: readonly ChangesExtensionToWebviewMessage[],
    requestId: string,
): Extract<ChangesExtensionToWebviewMessage, { readonly type: 'changes/submoduleGeneratedCommitMessage' }> {
    const response = messages.find((message): message is Extract<ChangesExtensionToWebviewMessage, { readonly type: 'changes/submoduleGeneratedCommitMessage' }> =>
        message.type === 'changes/submoduleGeneratedCommitMessage' && message.requestId === requestId);
    assert.ok(response, `Expected generated submodule commit message response for ${requestId}.`);
    return response;
}

function arrayItem<T>(items: readonly T[], index: number): T {
    const item = items[index];
    if (item === undefined) { assert.fail(`Expected item at index ${index}.`); }
    return item;
}
