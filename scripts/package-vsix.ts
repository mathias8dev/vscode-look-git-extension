#!/usr/bin/env node
const childProcess: typeof import('node:child_process') = require('node:child_process');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');

interface PackageManifest {
    readonly name: string;
    readonly displayName: string;
    readonly version: string;
}

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');

main();

function main(): void {
    const manifest = readManifest();
    const out = path.join(repoRoot, `${manifest.name}-${manifest.version}.vsix`);
    packageVsix(out);
}

function packageVsix(out: string): void {
    childProcess.execFileSync('vsce', ['package', '--allow-missing-repository', '--no-rewrite-relative-links', '--out', out], {
        cwd: repoRoot,
        stdio: 'inherit',
    });
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
