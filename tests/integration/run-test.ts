import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';
import { createLookGitScenarioFixture } from '@tests/helpers/look-git-scenario';
import { sanitizeVsCodeTestEnvironment } from '@tests/helpers/vscode-test-environment';

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
    const extensionTestsPath = path.resolve(__dirname, 'suite');
    const semanticFixture = createLookGitScenarioFixture('semantic-actions', 'look-git-integration-semantic-');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-integration-user-data-'));

    sanitizeVsCodeTestEnvironment();
    process.env.LOOK_GIT_SEMANTIC_FIXTURE_REPO = semanticFixture.repo;

    try {
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [semanticFixture.repo, `--user-data-dir=${userDataDir}`, '--disable-workspace-trust'],
            version: '1.122.1',
        });
    } finally {
        semanticFixture.cleanup();
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
