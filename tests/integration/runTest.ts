import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import { createRichHistoryFixture } from '../helpers/gitRepo';

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../..');
    const extensionTestsPath = path.resolve(__dirname, 'suite');
    const fixtureRepo = createRichHistoryFixture({ commitCount: 120, dirty: true }).repo;

    delete process.env.ELECTRON_RUN_AS_NODE;
    for (const key of Object.keys(process.env)) {
        if (key.startsWith('VSCODE_')) {
            delete process.env[key];
        }
    }

    try {
        await runTests({
            version: '1.85.2',
            extensionDevelopmentPath,
            extensionTestsPath,
            extensionTestsEnv: {
                LOOK_GIT_INTEGRATION_REPO: fixtureRepo.cwd,
            },
            launchArgs: [
                fixtureRepo.cwd,
                '--no-sandbox',
                '--disable-workspace-trust',
                '--skip-welcome',
                '--skip-release-notes',
            ],
        });
    } finally {
        fixtureRepo.cleanup();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
