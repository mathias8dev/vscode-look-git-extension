import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';
import { fixtureRepoLaunchArgs } from '../helpers/fixtureRepo';
import { sanitizeVsCodeTestEnvironment } from '../helpers/vscodeTestEnvironment';

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
    const extensionTestsPath = path.resolve(__dirname, 'suite');

    sanitizeVsCodeTestEnvironment();

    await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [...fixtureRepoLaunchArgs()],
        version: '1.85.2',
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
