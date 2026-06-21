import { execFileSync } from 'node:child_process';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { buildStatusData } from '@extension/messaging/changes-message-router';
import type { StatusDataPush } from '@protocol/changes/messages';
import { createLookGitScenarioFixture, type LookGitScenarioFixture } from '@tests/helpers/look-git-scenario';

export interface SemanticRuntimeFixture {
    readonly fixture: LookGitScenarioFixture;
    readonly runtime: CliGitRuntime;
    readonly repository: RuntimeGitRepository;
    readonly worktree: RuntimeWorktree;
    readonly backend: GitCliBackend;
    git(args: readonly string[]): string;
    refreshStatusMessage(): Promise<StatusDataPush>;
    cleanup(): void;
}

export async function createSemanticRuntimeFixture(prefix = 'look-git-semantic-runtime-'): Promise<SemanticRuntimeFixture> {
    const fixture = createLookGitScenarioFixture('semantic-actions', prefix);
    const runtime = new CliGitRuntime((args, context, options) => new GitCliBackend(context.cwd).run(args, options));
    const backend = new GitCliBackend(fixture.repo);
    const gitDir = (await backend.run(['rev-parse', '--absolute-git-dir'])).trim();
    const head = (await backend.run(['rev-parse', 'HEAD'])).trim();
    const repository = new RuntimeGitRepository({
        repoId: 'semantic-actions',
        cwd: fixture.repo,
        gitDir,
        kind: 'main',
        label: 'semantic-actions',
    }, runtime);
    const worktree = new RuntimeWorktree({
        repoId: 'semantic-actions',
        worktreeId: 'semantic-actions-main',
        path: fixture.repo,
        gitDir,
        repositoryKind: 'main',
        isMain: true,
        head,
        branch: 'main',
        dirty: true,
    }, runtime);

    return {
        fixture,
        runtime,
        repository,
        worktree,
        backend,
        git(args) {
            return execFileSync('git', [...args], { cwd: fixture.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        },
        async refreshStatusMessage() {
            const [status, stashes, submodules] = await Promise.all([
                worktree.getStatus(),
                worktree.listStashes({ limit: Number.MAX_SAFE_INTEGER }),
                repository.listSubmodules(),
            ]);
            const currentBranch = execFileSync('git', ['branch', '--show-current'], {
                cwd: fixture.repo,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
            }).trim();
            return buildStatusData(status, stashes.items, submodules, currentBranch || undefined);
        },
        cleanup() {
            fixture.cleanup();
        },
    };
}
