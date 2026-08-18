import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';
import { removeDirSyncWithRetry } from '@tests/helpers/git-repo';
import { createLookGitScenarioFixture } from '@tests/helpers/look-git-scenario';
import { sanitizeVsCodeTestEnvironment } from '@tests/helpers/vscode-test-environment';

const TEST_VSCODE_VERSION = '1.122.1';

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
    const extensionTestsPath = path.resolve(__dirname, 'suite');
    const diffFixturePath = createDiffFixtureRepo();
    const semanticFixture = createLookGitScenarioFixture('semantic-actions', 'look-git-e2e-semantic-');
    const repositoryFixture = createRepositoryFixture(semanticFixture.repo, diffFixturePath);
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-e2e-user-data-'));

    sanitizeVsCodeTestEnvironment();

    try {
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            extensionTestsEnv: {
                LOOK_GIT_DIFF_FIXTURE_REPO: diffFixturePath,
                LOOK_GIT_LIFECYCLE_FIXTURE: repositoryFixture.lifecycleWorkspace,
                LOOK_GIT_MULTIREPO_FIXTURE: repositoryFixture.multiRepositoryWorkspace,
                LOOK_GIT_SEMANTIC_FIXTURE_REPO: semanticFixture.repo,
            },
            launchArgs: [
                repositoryFixture.workspaceFile,
                `--user-data-dir=${userDataDir}`,
                '--disable-workspace-trust',
            ],
            version: TEST_VSCODE_VERSION,
        });
    } finally {
        removeDirSyncWithRetry(diffFixturePath);
        semanticFixture.cleanup();
        removeDirSyncWithRetry(repositoryFixture.root);
        removeDirSyncWithRetry(userDataDir);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

function createDiffFixtureRepo(): string {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-diff-e2e-'));
    git(repoPath, ['init']);
    git(repoPath, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    git(repoPath, ['config', 'user.email', 'e2e@example.com']);
    git(repoPath, ['config', 'user.name', 'Look Git E2E']);
    // Keep fixture file content byte-identical across OSes (Windows git defaults to autocrlf=true).
    git(repoPath, ['config', 'core.autocrlf', 'false']);
    git(repoPath, ['config', 'core.eol', 'lf']);

    fs.writeFileSync(path.join(repoPath, 'deleted.txt'), 'base content\n');
    fs.writeFileSync(path.join(repoPath, 'kept.txt'), 'kept content\n');
    git(repoPath, ['add', '.']);
    git(repoPath, ['commit', '-m', 'feat(graph): add base fixture files']);

    fs.writeFileSync(path.join(repoPath, 'added.txt'), 'added content\n');
    fs.rmSync(path.join(repoPath, 'deleted.txt'));
    git(repoPath, ['add', '-A']);
    git(repoPath, ['commit', '-m', 'feat(graph): change fixture files']);

    return repoPath;
}

interface RepositoryFixture {
    readonly root: string;
    readonly workspaceFile: string;
    readonly lifecycleWorkspace: string;
    readonly multiRepositoryWorkspace: string;
}

function createRepositoryFixture(semanticRepo: string, diffRepo: string): RepositoryFixture {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-e2e-repositories-'));
    const lifecycleWorkspace = path.join(root, 'repository-lifecycle');
    const multiRepositoryWorkspace = path.join(root, 'multi-repository');
    const workspaceFile = path.join(root, 'look-git-e2e.code-workspace');

    fs.mkdirSync(lifecycleWorkspace, { recursive: true });
    fs.writeFileSync(path.join(lifecycleWorkspace, 'test.py'), 'print("hello world")\n');

    createRepository(multiRepositoryWorkspace, 'main', 'README.md', 'workspace parent change\n');
    createRepository(path.join(multiRepositoryWorkspace, 'app'), 'feature/app-work', 'src/app.ts', 'app working change\n');
    createRepository(path.join(multiRepositoryWorkspace, 'api'), 'main', 'src/api.ts', 'api working change\n');
    createRepository(path.join(multiRepositoryWorkspace, 'app', 'plugin'), 'main', 'src/plugin.ts', 'plugin working change\n');
    createRepository(path.join(multiRepositoryWorkspace, 'containers', 'deep-repository'), 'main', 'src/deep.ts', 'deep repository working change\n');

    fs.writeFileSync(workspaceFile, JSON.stringify({
        folders: [
            { path: semanticRepo },
            { path: diffRepo },
            { path: multiRepositoryWorkspace },
            { path: lifecycleWorkspace },
        ],
        settings: {
            'git.autofetch': false,
            'git.confirmSync': false,
            'workbench.startupEditor': 'none',
        },
    }), 'utf8');

    return { root, workspaceFile, lifecycleWorkspace, multiRepositoryWorkspace };
}

function createRepository(repoPath: string, branch: string, dirtyFile: string, dirtyContent: string): void {
    fs.mkdirSync(repoPath, { recursive: true });
    git(repoPath, ['init', '-q']);
    git(repoPath, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    git(repoPath, ['config', 'user.email', 'e2e@example.com']);
    git(repoPath, ['config', 'user.name', 'Look Git E2E']);
    git(repoPath, ['config', 'core.autocrlf', 'false']);
    git(repoPath, ['config', 'core.eol', 'lf']);
    fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'README.md'), `${path.basename(repoPath)} repository\n`);
    const dirtyFilePath = path.join(repoPath, dirtyFile);
    fs.mkdirSync(path.dirname(dirtyFilePath), { recursive: true });
    fs.writeFileSync(dirtyFilePath, 'initial content\n');
    git(repoPath, ['add', '.']);
    git(repoPath, ['commit', '-q', '-m', `initial ${path.basename(repoPath)}`]);
    if (branch !== 'main') {
        git(repoPath, ['checkout', '-q', '-b', branch]);
    }
    fs.writeFileSync(dirtyFilePath, dirtyContent);
}

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], {
        cwd,
        encoding: 'utf8',
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Look Git E2E',
            GIT_AUTHOR_EMAIL: 'e2e@example.com',
            GIT_COMMITTER_NAME: 'Look Git E2E',
            GIT_COMMITTER_EMAIL: 'e2e@example.com',
        },
    }).trim();
}
