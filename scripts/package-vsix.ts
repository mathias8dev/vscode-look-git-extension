#!/usr/bin/env node
const childProcess: typeof import('node:child_process') = require('node:child_process');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');

interface PackageManifest {
    readonly name: string;
    readonly version: string;
}

const repoRoot = path.resolve(__dirname, '..');

main();

function main(): void {
    const manifest = readManifest();
    const branch = currentBranch();
    const suffix = branch === 'experimental' ? '-experimental' : '';
    const out = path.join(repoRoot, `${manifest.name}-${manifest.version}${suffix}.vsix`);

    childProcess.execFileSync('vsce', ['package', '--allow-missing-repository', '--no-rewrite-relative-links', '--out', out], {
        cwd: repoRoot,
        stdio: 'inherit',
    });
}

function readManifest(): PackageManifest {
    const value: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    if (!isRecord(value) || typeof value.name !== 'string' || typeof value.version !== 'string') {
        throw new Error('package.json must contain string name and version fields.');
    }
    return {
        name: value.name,
        version: value.version,
    };
}

function currentBranch(): string {
    return childProcess.execFileSync('git', ['branch', '--show-current'], {
        cwd: repoRoot,
        encoding: 'utf8',
    }).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
