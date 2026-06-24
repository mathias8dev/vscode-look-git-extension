import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const extensionPath = path.resolve(__dirname, '../..');
const providedFixtureRoot = process.env.LOOK_GIT_WDIO_MULTIREPO_ROOT;
const fixtureRoot = providedFixtureRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-wdio-multirepo-'));
process.env.LOOK_GIT_WDIO_MULTIREPO_ROOT = fixtureRoot;
const workspacePath = path.join(fixtureRoot, 'workspace');
const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-wdio-multirepo-storage-'));
const vscodeProxyTimeout = positiveIntegerEnv('LOOK_GIT_E2E_VSCODE_PROXY_TIMEOUT_MS');
const WDIO_RUNNER_TIMEOUT_MS = 600_000;

if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
    createRepository(workspacePath, 'main', 'README.md', 'workspace parent\n');
    createRepository(path.join(workspacePath, 'modules', 'app'), 'feature/app-work', 'src/app.ts', 'app working change\n');
    createRepository(path.join(workspacePath, 'modules', 'api'), 'main', 'src/api.ts', 'api working change\n');
    createRepository(path.join(workspacePath, 'modules', 'app', 'modules', 'plugin'), 'main', 'src/plugin.ts', 'plugin working change\n');
}

process.env.LOOK_GIT_WDIO_MULTIREPO_WORKSPACE = workspacePath;

type LookGitVscodeCapability = WebdriverIO.Capabilities & WebdriverIO.WDIOVSCodeServiceOptions & {
    readonly browserName: 'vscode';
    readonly browserVersion: string;
    readonly 'wdio:enforceWebDriverClassic': boolean;
};

const vscodeCapabilities: LookGitVscodeCapability = {
    browserName: 'vscode',
    browserVersion: '1.123.0',
    'wdio:enforceWebDriverClassic': true,
    'wdio:vscodeOptions': {
        extensionPath,
        workspacePath,
        storagePath,
        userSettings: {
            'workbench.startupEditor': 'none',
            'git.autofetch': false,
            'git.autorefresh': false,
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
    specs: [path.join(__dirname, 'wdio/multi-repo-navigator.e2e.ts')],
    maxInstances: 1,
    logLevel: 'error',
    framework: 'mocha',
    capabilities: [vscodeCapabilities],
    services: [['vscode', { cachePath: path.join(extensionPath, '.wdio-vscode') }]],
    mochaOpts: {
        ui: 'bdd',
        timeout: WDIO_RUNNER_TIMEOUT_MS,
    },
    onComplete: () => {
        if (!providedFixtureRoot) {
            fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
        fs.rmSync(storagePath, { recursive: true, force: true });
    },
};

function createRepository(repoPath: string, branch: string, dirtyFile: string, dirtyContent: string): void {
    fs.mkdirSync(repoPath, { recursive: true });
    git(repoPath, ['init', '-q']);
    git(repoPath, ['checkout', '-q', '-b', 'main']);
    git(repoPath, ['config', 'user.email', 'wdio@example.com']);
    git(repoPath, ['config', 'user.name', 'Look Git WDIO']);
    git(repoPath, ['config', 'core.autocrlf', 'false']);
    git(repoPath, ['config', 'core.eol', 'lf']);
    fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'README.md'), `${path.basename(repoPath)} repository\n`);
    fs.writeFileSync(path.join(repoPath, dirtyFile), 'initial content\n');
    git(repoPath, ['add', '.']);
    git(repoPath, ['commit', '-q', '-m', `initial ${path.basename(repoPath)}`]);
    if (branch !== 'main') {
        git(repoPath, ['checkout', '-q', '-b', branch]);
    }
    fs.writeFileSync(path.join(repoPath, dirtyFile), dirtyContent);
}

function git(repoPath: string, args: readonly string[]): string {
    return execFileSync('git', [...args], {
        cwd: repoPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Look Git WDIO',
            GIT_AUTHOR_EMAIL: 'wdio@example.com',
            GIT_COMMITTER_NAME: 'Look Git WDIO',
            GIT_COMMITTER_EMAIL: 'wdio@example.com',
        },
    });
}

function positiveIntegerEnv(name: string): number | undefined {
    const rawValue = process.env[name];
    if (!rawValue) { return undefined; }
    const value = Number.parseInt(rawValue, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}
