const path = require('path');

const root = path.resolve(__dirname, '../..');
const artifactsDir = path.join(root, 'artifacts/e2e');

exports.config = {
    runner: 'local',
    specs: [
        path.join(root, 'out/e2e/tests/e2e/specs/**/*.js'),
    ],
    maxInstances: 1,
    logLevel: process.env.WDIO_LOG_LEVEL || 'warn',
    outputDir: artifactsDir,
    bail: 0,
    waitforTimeout: 20_000,
    connectionRetryTimeout: 180_000,
    connectionRetryCount: 1,
    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: {
        ui: 'bdd',
        timeout: 180_000,
    },
    services: [
        ['vscode', { cachePath: path.join(root, '.wdio-vscode') }],
    ],
    capabilities: [{
        browserName: 'vscode',
        browserVersion: process.env.LOOK_GIT_E2E_VSCODE_VERSION || '1.86.0',
        'wdio:vscodeOptions': {
            extensionPath: root,
            workspacePath: process.env.LOOK_GIT_E2E_REPO,
            verboseLogging: process.env.WDIO_VERBOSE === '1',
            vscodeArgs: {
                'disable-workspace-trust': true,
                'skip-welcome': true,
                'skip-release-notes': true,
                'no-sandbox': true,
            },
            userSettings: {
                'telemetry.telemetryLevel': 'off',
                'git.openRepositoryInParentFolders': 'never',
                'workbench.startupEditor': 'none',
            },
        },
    }],
    afterTest: async function (_test, _context, result) {
        if (!result.passed) {
            const safeTitle = String(_test.title || 'e2e-failure').replace(/[^a-z0-9._-]+/gi, '-');
            await browser.saveScreenshot(path.join(artifactsDir, `${safeTitle}.png`));
        }
    },
};
