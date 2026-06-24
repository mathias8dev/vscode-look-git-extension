import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
    const semanticRepo = requiredRepoEnv('LOOK_GIT_SEMANTIC_FIXTURE_REPO');
    const diffRepo = requiredRepoEnv('LOOK_GIT_DIFF_FIXTURE_REPO');

    assertWorkspaceFolder(semanticRepo);
    assertWorkspaceFolder(diffRepo);

    const semanticGitRepository = await waitForGitRepository(semanticRepo, hasSemanticFixtureState);
    assert.equal(semanticGitRepository.state.HEAD?.name, 'main');
    assert.equal(semanticGitRepository.state.HEAD?.ahead, 1);
    assert.ok(semanticGitRepository.state.indexChanges.length >= 1, 'Expected staged semantic fixture changes.');
    assert.ok(semanticGitRepository.state.workingTreeChanges.length >= 1, 'Expected unstaged semantic fixture changes.');

    const diffGitRepository = await waitForGitRepository(diffRepo);
    assert.equal(diffGitRepository.state.HEAD?.name, 'main');

    await activateLookGit();

    const commands = await vscode.commands.getCommands(true);
    assertCommand(commands, 'lookGit.history.refresh');
    assertCommand(commands, 'lookGit.changes.refresh');
    assertCommand(commands, 'lookGit.history.openFileDiff');

    await vscode.commands.executeCommand('workbench.view.extension.look-git');
    await vscode.commands.executeCommand('lookGit.changes.refresh');
    await vscode.commands.executeCommand('lookGit.history.refresh');
    await vscode.commands.executeCommand('workbench.view.extension.look-git-graph');
}

interface NativeGitExtension {
    getAPI(version: 1): NativeGitApi;
}

interface NativeGitApi {
    readonly repositories: readonly NativeGitApiRepository[];
}

interface NativeGitApiRepository {
    readonly rootUri: vscode.Uri;
    readonly state: {
        readonly HEAD?: {
            readonly name?: string;
            readonly ahead?: number;
        };
        readonly indexChanges: readonly unknown[];
        readonly workingTreeChanges: readonly unknown[];
    };
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
    const extension = vscode.extensions.getExtension<NativeGitExtension>('vscode.git');
    assert.ok(extension, 'VS Code Git extension is not available.');
    const gitApi = extension.isActive ? extension.exports.getAPI(1) : (await extension.activate()).getAPI(1);
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

function hasSemanticFixtureState(repository: NativeGitApiRepository): boolean {
    return repository.state.HEAD?.name !== undefined
        && repository.state.indexChanges.length >= 1
        && repository.state.workingTreeChanges.length >= 1;
}

function requiredRepoEnv(name: string): string {
    const value = process.env[name];
    assert.ok(value, `Missing environment variable ${name}`);
    assert.ok(fs.existsSync(path.join(value, '.git')), `Missing repository for ${name}: ${value}`);
    return value;
}

function assertWorkspaceFolder(repo: string): void {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    assert.ok(workspaceFolders.some((folder) => samePath(folder.uri.fsPath, repo)), `Repository is not open in VS Code: ${repo}`);
}

function assertCommand(commands: readonly string[], command: string): void {
    assert.ok(commands.includes(command), `Missing command ${command}`);
}

function samePath(left: string, right: string): boolean {
    return normalizePath(left) === normalizePath(right);
}

function normalizePath(value: string): string {
    let resolved = path.resolve(value);
    try {
        resolved = fs.realpathSync.native(resolved);
    } catch {
        resolved = path.resolve(value);
    }
    return resolved.replace(/[\\/]+/g, '/').replace(/^([a-zA-Z]):/, (_match, drive: string) => `${drive.toLowerCase()}:`);
}

async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
