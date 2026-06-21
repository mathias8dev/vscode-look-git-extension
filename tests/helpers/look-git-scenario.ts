import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { removeDirSyncWithRetry } from '@tests/helpers/git-repo';

export interface LookGitScenarioFixture {
    readonly outputRoot: string;
    readonly repo: string;
    cleanup(): void;
}

export function createLookGitScenarioFixture(scenario: string, prefix = `look-git-${scenario}-scenario-`): LookGitScenarioFixture {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    execFileSync('node', [
        path.join(process.cwd(), 'scripts', 'look-git.ts'),
        'setup',
        scenario,
        '--output',
        outputRoot,
    ], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    return {
        outputRoot,
        repo: path.join(outputRoot, scenario),
        cleanup() { removeDirSyncWithRetry(outputRoot); },
    };
}
