import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const extensionPath = path.resolve(__dirname, '../..');
const testRoot = process.env.LOOK_GIT_INSTALLED_VSIX_E2E_ROOT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-installed-vsix-e2e-'));
process.env.LOOK_GIT_INSTALLED_VSIX_E2E_ROOT = testRoot;
const fixtureRoot = path.join(testRoot, 'fixtures');
const installUserData = path.join(testRoot, 'install-user-data');
const installExtensions = path.join(testRoot, 'installed-extensions');
const storagePath = path.join(testRoot, 'wdio-storage');
const scenarioName = 'basics';
const scenarioRepo = path.join(fixtureRoot, scenarioName);
const codeBinary = process.env.LOOK_GIT_WDIO_CODE_BIN ?? 'code';
const packageManifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'package.json'), 'utf8')) as {
    readonly publisher: string;
    readonly name: string;
    readonly version: string;
};

fs.mkdirSync(installUserData, { recursive: true });
fs.mkdirSync(installExtensions, { recursive: true });

if (!fs.existsSync(path.join(scenarioRepo, '.git'))) {
    execFileSync('node', [
        path.join(extensionPath, 'scripts', 'look-git.ts'),
        'setup',
        scenarioName,
        '--output',
        fixtureRoot,
    ], { cwd: extensionPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const vsixPath = process.env.LOOK_GIT_INSTALLED_VSIX_PATH ?? packageCurrentVsix();

const installedExtensionPath = path.join(installExtensions, `${packageManifest.publisher}.${packageManifest.name}-${artifactVersionFromVsixPath(vsixPath)}`);
if (!fs.existsSync(path.join(installedExtensionPath, 'dist', 'extension.cjs'))) {
    execFileSync(codeBinary, [
        '--user-data-dir',
        installUserData,
        '--extensions-dir',
        installExtensions,
        '--install-extension',
        vsixPath,
        '--force',
    ], { cwd: extensionPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
if (!fs.existsSync(path.join(installedExtensionPath, 'dist', 'extension.cjs'))) {
    throw new Error(`Packaged extension entrypoint missing after VSIX install: ${installedExtensionPath}`);
}

process.env.LOOK_GIT_INSTALLED_VSIX_REPO = scenarioRepo;
process.env.LOOK_GIT_INSTALLED_VSIX_PATH = vsixPath;
process.env.LOOK_GIT_INSTALLED_EXTENSION_PATH = installedExtensionPath;

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
        extensionPath: installedExtensionPath,
        workspacePath: scenarioRepo,
        storagePath,
        userSettings: {
            'workbench.startupEditor': 'none',
            'git.autofetch': false,
            'git.confirmSync': false,
        },
        verboseLogging: false,
    },
};

export const config: WebdriverIO.Config = {
    runner: 'local',
    specs: [path.join(__dirname, 'wdio/installed-vsix-startup.e2e.ts')],
    maxInstances: 1,
    logLevel: 'info',
    framework: 'mocha',
    capabilities: [vscodeCapabilities],
    services: [['vscode', { cachePath: path.join(extensionPath, '.wdio-vscode') }]],
    mochaOpts: {
        ui: 'bdd',
    },
    onComplete: () => {
        fs.rmSync(testRoot, { recursive: true, force: true });
    },
};

function packageCurrentVsix(): string {
    const before = new Set(vsixFiles());
    execFileSync('npm', ['run', 'vsix'], { cwd: extensionPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const created = vsixFiles()
        .filter((filePath) => !before.has(filePath))
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
    const vsixPath = created[0];
    if (!vsixPath) {
        throw new Error('npm run vsix did not create a new VSIX artifact.');
    }
    return vsixPath;
}

function vsixFiles(): readonly string[] {
    return fs.readdirSync(extensionPath)
        .filter((entry) => entry.endsWith('.vsix'))
        .map((entry) => path.join(extensionPath, entry));
}

function artifactVersionFromVsixPath(vsixPath: string): string {
    const fileName = path.basename(vsixPath);
    const prefix = `${packageManifest.name}-`;
    const suffix = '.vsix';
    if (!fileName.startsWith(prefix) || !fileName.endsWith(suffix)) {
        return packageManifest.version;
    }
    return fileName.slice(prefix.length, -suffix.length);
}
