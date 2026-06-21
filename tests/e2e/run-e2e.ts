import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';
import { fixtureRepoLaunchArgs } from '@tests/helpers/fixture-repo';
import { sanitizeVsCodeTestEnvironment } from '@tests/helpers/vscode-test-environment';

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
    const extensionTestsPath = path.resolve(__dirname, 'suite');
    const diffFixturePath = createDiffFixtureRepo();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-e2e-user-data-'));

    sanitizeVsCodeTestEnvironment();
    process.env.LOOK_GIT_DIFF_FIXTURE_REPO = diffFixturePath;

    try {
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [...workspaceArgs(diffFixturePath), `--user-data-dir=${userDataDir}`, '--disable-workspace-trust'],
            version: '1.85.2',
        });
    } finally {
        fs.rmSync(diffFixturePath, { recursive: true, force: true });
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

function workspaceArgs(diffFixturePath: string): readonly string[] {
    return [...fixtureRepoLaunchArgs().filter((arg) => !arg.startsWith('--')), diffFixturePath];
}

function createDiffFixtureRepo(): string {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-diff-e2e-'));
    git(repoPath, ['init']);
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

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();
}
