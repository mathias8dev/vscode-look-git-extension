import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('package-vsix', () => {
    it.skipIf(process.platform === 'win32')('adds Experimental to the packaged displayName on the experimental branch', () => {
        const repoRoot = process.cwd();
        const packageJsonPath = path.join(repoRoot, 'package.json');
        const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-package-vsix-'));
        const bin = path.join(root, 'bin');
        const capturedManifestPath = path.join(root, 'captured-package.json');
        fs.mkdirSync(bin);

        try {
            writeExecutable(path.join(bin, 'git'), [
                '#!/bin/sh',
                'if [ "$1" = "branch" ] && [ "$2" = "--show-current" ]; then',
                '  printf "experimental\\n"',
                '  exit 0',
                'fi',
                'printf "unexpected git invocation: %s\\n" "$*" >&2',
                'exit 1',
                '',
            ].join('\n'));
            writeExecutable(path.join(bin, 'vsce'), [
                '#!/bin/sh',
                'cp package.json "$LOOK_GIT_CAPTURE_MANIFEST"',
                '',
            ].join('\n'));

            execFileSync('node', ['scripts/package-vsix.ts'], {
                cwd: repoRoot,
                env: {
                    ...process.env,
                    LOOK_GIT_CAPTURE_MANIFEST: capturedManifestPath,
                    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
                },
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            const capturedManifest = readJsonObject(capturedManifestPath);
            expect(capturedManifest.displayName).toBe('Look Git Experimental');
            expect(fs.readFileSync(packageJsonPath, 'utf8')).toBe(originalPackageJson);
        } finally {
            fs.writeFileSync(packageJsonPath, originalPackageJson);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

function writeExecutable(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content, { mode: 0o755 });
}

function readJsonObject(filePath: string): Record<string, unknown> {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!isRecord(value)) {
        throw new Error(`${filePath} must contain a JSON object.`);
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
