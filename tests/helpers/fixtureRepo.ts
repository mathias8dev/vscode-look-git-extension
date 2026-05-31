import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function getFixtureRepoPath(): string | undefined {
    const candidate = process.env.LOOK_GIT_FIXTURE_REPO
        ?? path.join(os.homedir(), 'CodeProjects', 'look-git-fixture-repo');
    return fs.existsSync(path.join(candidate, '.git')) ? candidate : undefined;
}

export function fixtureRepoLaunchArgs(): readonly string[] {
    const fixturePath = getFixtureRepoPath();
    return fixturePath ? [fixturePath, '--disable-workspace-trust'] : ['--disable-workspace-trust'];
}

export function gitFixtureOutput(args: readonly string[]): string {
    const fixturePath = getFixtureRepoPath();
    if (!fixturePath) { throw new Error('Fixture repo not found. Set LOOK_GIT_FIXTURE_REPO or create ~/CodeProjects/look-git-fixture-repo.'); }
    return execFileSync('git', [...args], { cwd: fixturePath, encoding: 'utf8' });
}
