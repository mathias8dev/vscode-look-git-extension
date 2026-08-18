import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    downloadAndUnzipVSCode,
    resolveCliArgsFromVSCodeExecutablePath,
    runTests,
} from '@vscode/test-electron';
import { removeDirSyncWithRetry } from '@tests/helpers/git-repo';
import { createLookGitScenarioFixture } from '@tests/helpers/look-git-scenario';
import { sanitizeVsCodeTestEnvironment } from '@tests/helpers/vscode-test-environment';

const TEST_VSCODE_VERSION = '1.122.1';

async function main(): Promise<void> {
    const extensionRoot = path.resolve(__dirname, '../../..');
    const extensionTestsPath = path.resolve(__dirname, 'suite', 'installed-vsix');
    const fixture = createLookGitScenarioFixture('basics', 'look-git-installed-vsix-fixture-');
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-installed-vsix-e2e-'));
    const extensionsDir = path.join(testRoot, 'extensions');
    const installUserDataDir = path.join(testRoot, 'install-user-data');
    const runUserDataDir = path.join(testRoot, 'run-user-data');
    let vsixPath: string | undefined;

    sanitizeVsCodeTestEnvironment();
    fs.mkdirSync(extensionsDir, { recursive: true });

    try {
        vsixPath = packageCurrentVsix(extensionRoot);
        const vscodeExecutablePath = await downloadAndUnzipVSCode(TEST_VSCODE_VERSION);
        installVsix(vscodeExecutablePath, vsixPath, extensionsDir, installUserDataDir);
        const installedExtensionPath = findInstalledExtension(extensionsDir);

        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath: installedExtensionPath,
            extensionTestsPath,
            extensionTestsEnv: {
                LOOK_GIT_INSTALLED_EXTENSION_PATH: installedExtensionPath,
                LOOK_GIT_INSTALLED_VSIX_REPO: fixture.repo,
            },
            launchArgs: [
                fixture.repo,
                `--extensions-dir=${extensionsDir}`,
                `--user-data-dir=${runUserDataDir}`,
                '--disable-workspace-trust',
            ],
        });
    } finally {
        if (vsixPath) { fs.rmSync(vsixPath, { force: true }); }
        fixture.cleanup();
        removeDirSyncWithRetry(testRoot);
    }
}

function packageCurrentVsix(extensionRoot: string): string {
    const before = new Map(vsixFiles(extensionRoot).map((filePath) => {
        const stat = fs.statSync(filePath);
        return [filePath, { mtimeMs: stat.mtimeMs, size: stat.size }] as const;
    }));
    execFileSync(process.execPath, [path.join(extensionRoot, 'scripts', 'package-vsix.ts')], {
        cwd: extensionRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const created = vsixFiles(extensionRoot)
        .filter((filePath) => {
            const previous = before.get(filePath);
            if (!previous) { return true; }
            const stat = fs.statSync(filePath);
            return stat.mtimeMs !== previous.mtimeMs || stat.size !== previous.size;
        })
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
    const vsixPath = created[0];
    if (!vsixPath) { throw new Error('VSIX packaging did not create an artifact.'); }
    return vsixPath;
}

function vsixFiles(extensionRoot: string): readonly string[] {
    return fs.readdirSync(extensionRoot)
        .filter((entry) => entry.endsWith('.vsix'))
        .map((entry) => path.join(extensionRoot, entry));
}

function installVsix(
    vscodeExecutablePath: string,
    vsixPath: string,
    extensionsDir: string,
    userDataDir: string,
): void {
    const [command, ...baseArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
    if (!command) { throw new Error('VS Code CLI command could not be resolved.'); }
    const result = spawnSync(command, [
        ...baseArgs,
        `--extensions-dir=${extensionsDir}`,
        `--user-data-dir=${userDataDir}`,
        '--install-extension',
        vsixPath,
        '--force',
    ], {
        cwd: path.dirname(vscodeExecutablePath),
        encoding: 'utf8',
        shell: process.platform === 'win32',
    });
    if (result.error) { throw result.error; }
    if (result.status !== 0) {
        throw new Error(`VSIX installation failed (${result.status ?? 'unknown'}): ${result.stderr || result.stdout}`);
    }
}

function findInstalledExtension(extensionsDir: string): string {
    const candidates = fs.readdirSync(extensionsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('mathias8dev.look-git-'))
        .map((entry) => path.join(extensionsDir, entry.name));
    const installedExtensionPath = candidates[0];
    if (!installedExtensionPath) { throw new Error('Installed Look Git extension directory was not found.'); }
    if (!fs.existsSync(path.join(installedExtensionPath, 'dist', 'extension.cjs'))) {
        throw new Error(`Packaged extension entrypoint is missing: ${installedExtensionPath}`);
    }
    return installedExtensionPath;
}

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
