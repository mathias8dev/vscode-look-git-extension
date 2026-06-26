#!/usr/bin/env node
const childProcess: typeof import('node:child_process') = require('node:child_process');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');

interface PackageManifest {
    readonly name: string;
    readonly displayName: string;
    readonly version: string;
}

interface PackageOptions {
    readonly mode: PackageMode;
    readonly createTag: boolean;
    readonly help: boolean;
}

type PackageMode = 'timestamped' | 'experimental' | 'release';

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const TIMESTAMP_PART_LENGTH = 2;

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});

async function main(): Promise<void> {
    const options = packageOptions(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }
    const manifest = readManifest();
    const artifactVersion = artifactVersionFor(manifest.version, options.mode);
    const packageDisplayName = packageDisplayNameFor(manifest.displayName, options.mode);
    const out = path.join(repoRoot, `${manifest.name}-${artifactVersion}.vsix`);
    await withPackagedManifest({ version: artifactVersion, displayName: packageDisplayName }, () => packageVsix(out));
    if (options.createTag) {
        createGitTag(`v${artifactVersion}`);
    }
}

function packageOptions(args: readonly string[]): PackageOptions {
    let mode: PackageMode = 'timestamped';
    let createTag = false;
    let help = false;
    for (const arg of args) {
        if ((arg === '--help' || arg === '-h') && !help) {
            help = true;
            continue;
        }
        if (isPackageMode(arg) && mode === 'timestamped') {
            mode = arg;
            continue;
        }
        if (arg === '--tag' && !createTag) {
            createTag = true;
            continue;
        }
        throw new Error('Usage: npm run vsix -- [experimental|release] [--tag] [--help]');
    }
    return { mode, createTag, help };
}

function isPackageMode(value: string): value is Exclude<PackageMode, 'timestamped'> {
    return value === 'experimental' || value === 'release';
}

function artifactVersionFor(baseVersion: string, mode: PackageMode): string {
    if (mode === 'release') { return baseVersion; }
    const suffix = timestampSuffix(new Date());
    return mode === 'experimental'
        ? `${baseVersion}-experimental-${suffix}`
        : `${baseVersion}-${suffix}`;
}

function packageDisplayNameFor(baseDisplayName: string, mode: PackageMode): string {
    return mode === 'experimental'
        ? `${baseDisplayName} Experimental`
        : baseDisplayName;
}

function printHelp(): void {
    process.stdout.write(`Usage:
  npm run vsix -- [experimental|release] [--tag]

Modes:
  default        Package to look-git-<current>-YYYYMMDDhhmmss.vsix.
  experimental  Package to look-git-<current>-experimental-YYYYMMDDhhmmss.vsix and display name "Look Git Experimental".
  release       Package with the current package.json version unchanged.

Options:
  --tag          After a successful package, create git tag v<artifact-version>.
  -h, --help     Show this help.
`);
}

function timestampSuffix(date: Date): string {
    const pad = (value: number) => value.toString().padStart(TIMESTAMP_PART_LENGTH, '0');
    return [
        date.getFullYear().toString(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join('');
}

async function packageVsix(out: string): Promise<void> {
    const command = process.env.LOOK_GIT_VSCE_CLI;
    const args = ['package', '--no-dependencies', '--allow-missing-repository', '--no-rewrite-relative-links', '--out', out];
    if (command) {
        const invocation = executableInvocation(command, args);
        childProcess.execFileSync(invocation.command, invocation.args, {
            cwd: repoRoot,
            stdio: 'inherit',
        });
        return;
    }
    childProcess.execFileSync(process.execPath, [vsceCliPath(), ...args], {
        cwd: repoRoot,
        stdio: 'inherit',
    });
}

function executableInvocation(command: string, args: readonly string[]): { readonly command: string; readonly args: readonly string[] } {
    return path.extname(command).toLowerCase() === '.js'
        ? { command: process.execPath, args: [command, ...args] }
        : { command, args };
}

async function withPackagedManifest(overrides: Pick<PackageManifest, 'version' | 'displayName'>, run: () => Promise<void>): Promise<void> {
    const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
    try {
        const packageJson = parseManifestRecord(originalPackageJson);
        fs.writeFileSync(packageJsonPath, `${JSON.stringify({ ...packageJson, ...overrides }, null, 2)}\n`);
        await run();
    } finally {
        fs.writeFileSync(packageJsonPath, originalPackageJson);
    }
}

function vsceCliPath(): string {
    return require.resolve('@vscode/vsce/vsce');
}

function createGitTag(tagName: string): void {
    childProcess.execFileSync(gitCliPath(), ['tag', tagName], {
        cwd: repoRoot,
        stdio: 'inherit',
    });
}

function gitCliPath(): string {
    return process.env.LOOK_GIT_GIT_CLI ?? 'git';
}

function readManifest(): PackageManifest {
    const value = parseManifestRecord(fs.readFileSync(packageJsonPath, 'utf8'));
    if (typeof value.name !== 'string' || typeof value.displayName !== 'string' || typeof value.version !== 'string') {
        throw new Error('package.json must contain string name, displayName, and version fields.');
    }
    return {
        name: value.name,
        displayName: value.displayName,
        version: value.version,
    };
}

function parseManifestRecord(raw: string): Record<string, unknown> {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) {
        throw new Error('package.json must contain a JSON object.');
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
