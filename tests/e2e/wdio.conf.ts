import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const extensionPath = path.resolve(__dirname, '../..');
const semanticFixtureRoot = process.env.LOOK_GIT_WDIO_FIXTURE_ROOT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-wdio-semantic-'));
process.env.LOOK_GIT_WDIO_FIXTURE_ROOT = semanticFixtureRoot;
const semanticRepo = path.join(semanticFixtureRoot, 'semantic-actions');
const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-wdio-storage-'));
const vscodeProxyTimeout = positiveIntegerEnv('LOOK_GIT_E2E_VSCODE_PROXY_TIMEOUT_MS');
const mochaTimeout = positiveIntegerEnv('LOOK_GIT_E2E_MOCHA_TIMEOUT_MS');

if (!fs.existsSync(path.join(semanticRepo, '.git'))) {
    execFileSync('node', [
        path.join(extensionPath, 'scripts', 'look-git.ts'),
        'setup',
        'semantic-actions',
        '--output',
        semanticFixtureRoot,
    ], { cwd: extensionPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

process.env.LOOK_GIT_WDIO_SEMANTIC_REPO = semanticRepo;

type LookGitVscodeCapability = WebdriverIO.Capabilities & WebdriverIO.WDIOVSCodeServiceOptions & {
    readonly browserName: 'vscode';
    readonly browserVersion: string;
    readonly 'wdio:enforceWebDriverClassic': boolean;
};

const vscodeCapabilities: LookGitVscodeCapability = {
    browserName: 'vscode',
    browserVersion: '1.87.0',
    'wdio:enforceWebDriverClassic': true,
    'wdio:vscodeOptions': {
        extensionPath,
        workspacePath: semanticRepo,
        storagePath,
        userSettings: {
            'workbench.startupEditor': 'none',
            'git.autofetch': false,
            'git.confirmSync': false,
        },
        verboseLogging: false,
        ...(vscodeProxyTimeout === undefined ? {} : {
            vscodeProxyOptions: {
                commandTimeout: vscodeProxyTimeout,
                connectionTimeout: vscodeProxyTimeout,
            },
        }),
    },
};

export const config: WebdriverIO.Config = {
    runner: 'local',
    specs: [path.join(__dirname, 'wdio/changes-webview.e2e.ts')],
    maxInstances: 1,
    logLevel: 'error',
    framework: 'mocha',
    capabilities: [vscodeCapabilities],
    services: [['vscode', { cachePath: path.join(extensionPath, '.wdio-vscode') }]],
    mochaOpts: {
        ui: 'bdd',
        ...(mochaTimeout === undefined ? {} : { timeout: mochaTimeout }),
    },
    onComplete: () => {
        fs.rmSync(semanticFixtureRoot, { recursive: true, force: true });
        fs.rmSync(storagePath, { recursive: true, force: true });
    },
};

function positiveIntegerEnv(name: string): number | undefined {
    const rawValue = process.env[name];
    if (!rawValue) { return undefined; }
    const value = Number.parseInt(rawValue, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}
