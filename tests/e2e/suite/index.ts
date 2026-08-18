import { execFileSync } from 'node:child_process';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { discoverRepositoryContexts } from '@extension/repositories/repository-discovery';
import { getRepositoryScanMaxDepth } from '@extension/repositories/repository-discovery-settings';
import { VscodeGitRemoteRuntime } from '@extension/git/vscode-git-remote-runtime';
import { GitPushOutcome } from '@application/ports/git-capabilities';
import { removeDirSyncWithRetry, samePath } from '@tests/helpers/git-repo';

export async function run(): Promise<void> {
    report('validating workspace fixtures');
    const semanticRepo = requiredRepoEnv('LOOK_GIT_SEMANTIC_FIXTURE_REPO');
    const diffRepo = requiredRepoEnv('LOOK_GIT_DIFF_FIXTURE_REPO');
    const lifecycleWorkspace = requiredDirectoryEnv('LOOK_GIT_LIFECYCLE_FIXTURE');
    const multiRepositoryWorkspace = requiredRepoEnv('LOOK_GIT_MULTIREPO_FIXTURE');

    assertWorkspaceFolder(semanticRepo);
    assertWorkspaceFolder(diffRepo);
    assertWorkspaceFolder(lifecycleWorkspace);
    assertWorkspaceFolder(multiRepositoryWorkspace);

    const semanticGitRepository = await waitForGitRepository(semanticRepo, hasSemanticFixtureState);
    assert.equal(semanticGitRepository.state.HEAD?.name, 'main');
    assert.equal(semanticGitRepository.state.HEAD?.ahead, 1);
    assert.ok(semanticGitRepository.state.indexChanges.length >= 1, 'Expected staged semantic fixture changes.');
    assert.ok(semanticGitRepository.state.workingTreeChanges.length >= 1, 'Expected unstaged semantic fixture changes.');

    const diffGitRepository = await waitForGitRepository(diffRepo);
    assert.equal(diffGitRepository.state.HEAD?.name, 'main');

    report('activating Look Git');
    await activateLookGit();
    report('validating registered commands');

    const commands = await vscode.commands.getCommands(true);
    assertCommand(commands, 'lookGit.history.refresh');
    assertCommand(commands, 'lookGit.changes.refresh');
    assertCommand(commands, 'lookGit.history.openFileDiff');

    await vscode.commands.executeCommand('workbench.view.extension.look-git');
    await vscode.commands.executeCommand('lookGit.changes.refresh');
    await vscode.commands.executeCommand('lookGit.history.refresh');
    await vscode.commands.executeCommand('workbench.view.extension.look-git-graph');

    report('validating multi-repository discovery');
    await verifyRepositoryScanDepth(multiRepositoryWorkspace);
    report('validating native publish cancellation');
    await verifyNativePublishCancellation(multiRepositoryWorkspace);
    report('validating repository lifecycle');
    await verifyRepositoryLifecycle(lifecycleWorkspace);
    report('completed');
}

interface NativeGitExtension {
    getAPI(version: 1): NativeGitApi;
}

interface NativeGitApi {
    readonly repositories: readonly NativeGitApiRepository[];
    registerRemoteSourcePublisher(publisher: NativeRemoteSourcePublisher): vscode.Disposable;
}

interface NativeGitApiRepository {
    readonly rootUri: vscode.Uri;
    readonly state: {
        readonly HEAD?: {
            readonly name?: string;
            readonly ahead?: number;
        };
        readonly remotes: readonly { readonly name: string }[];
        readonly indexChanges: readonly unknown[];
        readonly workingTreeChanges: readonly unknown[];
    };
}

interface NativeRemoteSourcePublisher {
    readonly name: string;
    publishRepository(repository: NativeGitApiRepository): Promise<void>;
}

async function verifyRepositoryScanDepth(workspacePath: string): Promise<void> {
    const workspaceFolder = findWorkspaceFolder(workspacePath);
    const configuration = vscode.workspace.getConfiguration('lookGit', workspaceFolder.uri);

    try {
        await configuration.update('repositoryScanMaxDepth', 1, vscode.ConfigurationTarget.WorkspaceFolder);
        const shallowContexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder],
            resolveRepositoryScanMaxDepth: (folder) => getRepositoryScanMaxDepth(folder.uri),
        });
        assertContextLabels(shallowContexts, ['api', 'app', 'multi-repository']);

        await configuration.update('repositoryScanMaxDepth', 2, vscode.ConfigurationTarget.WorkspaceFolder);
        const deepContexts = await discoverRepositoryContexts({
            workspaceFolders: [workspaceFolder],
            resolveRepositoryScanMaxDepth: (folder) => getRepositoryScanMaxDepth(folder.uri),
        });
        assertContextLabels(deepContexts, ['api', 'app', 'deep-repository', 'multi-repository', 'plugin']);

        const inspection = configuration.inspect<number>('repositoryScanMaxDepth');
        assert.equal(inspection?.workspaceFolderValue, 2);
        assert.equal(inspection?.globalValue, undefined);

        const root = deepContexts.find((context) => samePath(context.cwd, workspacePath));
        const app = deepContexts.find((context) => path.basename(context.cwd) === 'app');
        const plugin = deepContexts.find((context) => path.basename(context.cwd) === 'plugin');
        const deepRepository = deepContexts.find((context) => path.basename(context.cwd) === 'deep-repository');
        assert.ok(root);
        assert.ok(app);
        assert.ok(plugin);
        assert.ok(deepRepository);
        assert.equal(app.parentId, root.id);
        assert.equal(plugin.parentId, app.id);
        assert.equal(deepRepository.parentId, root.id);
    } finally {
        await configuration.update('repositoryScanMaxDepth', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    }
}

async function verifyNativePublishCancellation(repoPath: string): Promise<void> {
    const gitApi = await nativeGitApi();
    const repository = await waitForGitRepository(repoPath);
    assert.deepEqual(repository.state.remotes, []);
    let publishedRepositoryPath: string | undefined;
    let notifyPickerOpened: (() => void) | undefined;
    const pickerOpened = new Promise<void>((resolve) => { notifyPickerOpened = resolve; });
    const publisher = gitApi.registerRemoteSourcePublisher({
        name: 'Look Git E2E Publisher',
        async publishRepository(repositoryToPublish): Promise<void> {
            publishedRepositoryPath = repositoryToPublish.rootUri.fsPath;
            notifyPickerOpened?.();
            const selection = await vscode.window.showQuickPick(['Publish'], {
                placeHolder: 'Look Git E2E native publish',
            });
            if (selection) { return; }
            await new Promise<void>(() => {});
        },
    });

    try {
        const runtime = new VscodeGitRemoteRuntime();
        const push = runtime.execute<unknown, GitPushOutcome>('push', {
            cwd: repoPath,
            gitDir: git(repoPath, ['rev-parse', '--absolute-git-dir']),
            repositoryId: 'native-publish-e2e',
            kind: 'main',
        }, { options: {} });
        await withTimeout(pickerOpened, 'Native publish picker did not open.');
        await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
        const outcome = await withTimeout(push, 'Look Git push remained pending after native publish cancellation.');

        assert.equal(outcome, GitPushOutcome.Delegated);
        assert.ok(publishedRepositoryPath && samePath(publishedRepositoryPath, repoPath));
        assert.equal(git(repoPath, ['remote']), '');
    } finally {
        publisher.dispose();
    }
}

async function verifyRepositoryLifecycle(workspacePath: string): Promise<void> {
    assert.equal(fs.existsSync(path.join(workspacePath, '.git')), false);

    report('lifecycle: initializing repository');
    initializeRepository(workspacePath);
    assertUnbornRepository(workspacePath);

    await vscode.window.showTextDocument(vscode.Uri.file(path.join(workspacePath, 'test.py')));
    await delay(500);
    await refreshLookGitViews();

    report('lifecycle: committing through external Git');
    git(workspacePath, ['add', 'test.py']);
    git(workspacePath, ['commit', '-q', '-m', 'feat(test): initial commit']);
    assert.equal(git(workspacePath, ['log', '-1', '--format=%s']), 'feat(test): initial commit');
    assert.equal(git(workspacePath, ['status', '--short']), '');
    await delay(500);
    await refreshLookGitViews();

    report('lifecycle: committing another external change');
    fs.appendFileSync(path.join(workspacePath, 'test.py'), 'print("external change")\n');
    git(workspacePath, ['add', 'test.py']);
    git(workspacePath, ['commit', '-q', '-m', 'feat(test): external commit']);
    assert.equal(git(workspacePath, ['log', '-1', '--format=%s']), 'feat(test): external commit');
    assert.equal(git(workspacePath, ['status', '--short']), '');
    await delay(500);
    await refreshLookGitViews();

    report('lifecycle: removing repository metadata');
    removeDirSyncWithRetry(path.join(workspacePath, '.git'));
    assert.equal(fs.existsSync(path.join(workspacePath, '.git')), false);
    await delay(500);
    await refreshLookGitViews();

    report('lifecycle: reinitializing repository');
    initializeRepository(workspacePath);
    assertUnbornRepository(workspacePath);
    await delay(500);
    await refreshLookGitViews();
}

async function refreshLookGitViews(): Promise<void> {
    await executeCommandWithTimeout('lookGit.changes.refresh');
    await executeCommandWithTimeout('lookGit.history.refresh');
}

async function executeCommandWithTimeout(command: string): Promise<void> {
    await withTimeout(vscode.commands.executeCommand(command), `VS Code command timed out: ${command}`);
}

async function withTimeout<T>(promise: PromiseLike<T>, message: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            Promise.resolve(promise),
            new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => reject(new Error(message)), 10_000);
            }),
        ]);
    } finally {
        if (timeout) { clearTimeout(timeout); }
    }
}

function initializeRepository(workspacePath: string): void {
    git(workspacePath, ['init', '-q']);
    git(workspacePath, ['symbolic-ref', 'HEAD', 'refs/heads/master']);
    git(workspacePath, ['config', 'user.name', 'Look Git E2E']);
    git(workspacePath, ['config', 'user.email', 'look-git-e2e@example.com']);
    git(workspacePath, ['config', 'core.autocrlf', 'false']);
}

function assertUnbornRepository(workspacePath: string): void {
    assert.equal(git(workspacePath, ['symbolic-ref', '--short', 'HEAD']), 'master');
    assert.throws(() => git(workspacePath, ['rev-parse', '--verify', 'HEAD']));
    assert.ok(git(workspacePath, ['status', '--short']).includes('?? test.py'));
}

function assertContextLabels(
    contexts: readonly { readonly cwd: string }[],
    expectedLabels: readonly string[],
): void {
    const labels = contexts.map((context) => path.basename(context.cwd)).sort();
    assert.deepEqual(labels, [...expectedLabels].sort());
}

async function activateLookGit(): Promise<void> {
    const extension = vscode.extensions.getExtension('mathias8dev.look-git');
    assert.ok(extension, 'Look Git extension is not available in the e2e host.');
    await extension.activate();
}

async function waitForGitRepository(
    repo: string,
    isReady: (repository: NativeGitApiRepository) => boolean = (repository) => repository.state.HEAD?.name !== undefined,
): Promise<NativeGitApiRepository> {
    const gitApi = await nativeGitApi();
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10_000) {
        const repository = gitApi.repositories.find((candidate) => samePath(candidate.rootUri.fsPath, repo));
        if (repository && isReady(repository)) {
            return repository;
        }
        await delay(100);
    }
    throw new Error(`VS Code Git extension did not open ${repo}.`);
}

async function nativeGitApi(): Promise<NativeGitApi> {
    const extension = vscode.extensions.getExtension<NativeGitExtension>('vscode.git');
    assert.ok(extension, 'VS Code Git extension is not available.');
    return extension.isActive ? extension.exports.getAPI(1) : (await extension.activate()).getAPI(1);
}

function hasSemanticFixtureState(repository: NativeGitApiRepository): boolean {
    return repository.state.HEAD?.name !== undefined
        && repository.state.indexChanges.length >= 1
        && repository.state.workingTreeChanges.length >= 1;
}

function requiredRepoEnv(name: string): string {
    const value = requiredDirectoryEnv(name);
    assert.ok(fs.existsSync(path.join(value, '.git')), `Missing repository for ${name}: ${value}`);
    return value;
}

function requiredDirectoryEnv(name: string): string {
    const value = process.env[name];
    assert.ok(value, `Missing environment variable ${name}`);
    assert.ok(fs.statSync(value).isDirectory(), `Missing directory for ${name}: ${value}`);
    return value;
}

function assertWorkspaceFolder(repo: string): void {
    findWorkspaceFolder(repo);
}

function findWorkspaceFolder(repo: string): vscode.WorkspaceFolder {
    const folder = (vscode.workspace.workspaceFolders ?? []).find((candidate) => samePath(candidate.uri.fsPath, repo));
    assert.ok(folder, `Repository is not open in VS Code: ${repo}`);
    return folder;
}

function assertCommand(commands: readonly string[], command: string): void {
    assert.ok(commands.includes(command), `Missing command ${command}`);
}

async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Look Git E2E',
            GIT_AUTHOR_EMAIL: 'look-git-e2e@example.com',
            GIT_COMMITTER_NAME: 'Look Git E2E',
            GIT_COMMITTER_EMAIL: 'look-git-e2e@example.com',
        },
    }).trim();
}

function report(stage: string): void {
    console.log(`[look-git-e2e] ${stage}`);
}
