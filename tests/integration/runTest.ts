import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../..');
    const extensionTestsPath = path.resolve(__dirname, 'suite');

    delete process.env.ELECTRON_RUN_AS_NODE;
    for (const key of Object.keys(process.env)) {
        if (key.startsWith('VSCODE_')) {
            delete process.env[key];
        }
    }

    await runTests({
        version: '1.85.2',
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [
            '--disable-workspace-trust',
            '--skip-welcome',
            '--skip-release-notes',
        ],
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
