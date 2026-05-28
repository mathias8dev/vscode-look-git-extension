import { spawnSync } from 'child_process';
import * as path from 'path';
import { createRichHistoryFixture } from '../helpers/gitRepo';

const root = process.cwd();
const fixture = createRichHistoryFixture({ commitCount: 120, dirty: true }).repo;
const wdioPackageJson = require.resolve('@wdio/cli/package.json');
const wdioBin = path.join(path.dirname(wdioPackageJson), 'bin/wdio.js');

function createCleanEnvironment(repoPath: string): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
        if (key === 'ELECTRON_RUN_AS_NODE' || key.startsWith('VSCODE_')) {
            delete env[key];
        }
    }
    env.LOOK_GIT_E2E_REPO = repoPath;
    return env;
}

try {
    const result = spawnSync(
        process.execPath,
        [wdioBin, 'run', path.join(root, 'tests/e2e/wdio.conf.js')],
        {
            cwd: root,
            stdio: 'inherit',
            env: createCleanEnvironment(fixture.cwd),
        },
    );

    if (result.error) {
        throw result.error;
    }
    process.exitCode = result.status ?? 1;
} finally {
    fixture.cleanup();
}
