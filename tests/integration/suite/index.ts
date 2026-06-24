import { execFileSync } from 'node:child_process';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
    const repo = requiredEnv('LOOK_GIT_SEMANTIC_FIXTURE_REPO');
    assert.ok(fs.existsSync(path.join(repo, '.git')), `Missing semantic fixture repository at ${repo}`);

    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    assert.ok(workspaceFolders.some((folder) => samePath(folder.uri.fsPath, repo)), 'Semantic fixture repository is not open in VS Code.');

    const gitRepository = await waitForGitRepository(repo, hasSemanticFixtureState);
    assert.equal(gitRepository.state.HEAD?.name, 'main');
    assert.equal(gitRepository.state.HEAD?.upstream?.remote, 'origin');
    assert.equal(gitRepository.state.HEAD?.upstream?.name, 'main');
    assert.equal(gitRepository.state.HEAD?.ahead, 1);
    assert.ok(gitRepository.state.indexChanges.length >= 1, 'Expected staged fixture changes.');
    assert.ok(gitRepository.state.workingTreeChanges.length >= 1, 'Expected unstaged fixture changes.');

    await activateLookGit();

    const commands = await vscode.commands.getCommands(true);
    assertCommand(commands, 'lookGit.history.refresh');
    assertCommand(commands, 'lookGit.changes.refresh');
    assertCommand(commands, 'lookGit.history.resetCurrentBranchToHere');
    assertCommand(commands, 'lookGit.history.pushAllUpToHere');

    assert.equal(git(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', 'main@{u}']).trim(), 'origin/main');
    assert.equal(git(repo, ['rev-list', '--left-right', '--count', 'main...origin/main']).trim(), '1\t0');
    assert.ok(git(repo, ['worktree', 'list', '--porcelain']).includes('branch refs/heads/feature/semantic-worktree'));
    assert.ok(git(repo, ['stash', 'list', '--format=%s']).includes('wip(semantic): stash action fixture'));
    assert.ok(git(repo, ['status', '--porcelain', '--ignored', '-uall']).includes('!! build/cache.log'));

    await vscode.commands.executeCommand('lookGit.history.refresh');
    await vscode.commands.executeCommand('lookGit.changes.refresh');
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
            readonly upstream?: {
                readonly remote?: string;
                readonly name?: string;
            };
            readonly ahead?: number;
        };
        readonly indexChanges: readonly unknown[];
        readonly workingTreeChanges: readonly unknown[];
    };
}

async function activateLookGit(): Promise<void> {
    const extension = vscode.extensions.getExtension('mathias8dev.look-git');
    assert.ok(extension, 'Look Git extension is not available in the integration host.');
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

function assertCommand(commands: readonly string[], command: string): void {
    assert.ok(commands.includes(command), `Missing command ${command}`);
}

function requiredEnv(name: string): string {
    const value = process.env[name];
    assert.ok(value, `Missing environment variable ${name}`);
    return value;
}

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
