import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('package-vsix', () => {
    it.skipIf(process.platform === 'win32')('packages the stable displayName and filename on every branch', () => {
        const repoRoot = process.cwd();
        const packageJsonPath = path.join(repoRoot, 'package.json');
        const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-package-vsix-'));
        const bin = path.join(root, 'bin');
        const capturedManifestPath = path.join(root, 'captured-package.json');
        const capturedArgsPath = path.join(root, 'captured-vsce-args.txt');
        fs.mkdirSync(bin);

        try {
            writeExecutable(path.join(bin, 'vsce'), [
                '#!/bin/sh',
                'cp package.json "$LOOK_GIT_CAPTURE_MANIFEST"',
                'printf "%s\\n" "$*" > "$LOOK_GIT_CAPTURE_ARGS"',
                '',
            ].join('\n'));

            execFileSync('node', ['scripts/package-vsix.ts'], {
                cwd: repoRoot,
                env: {
                    ...process.env,
                    LOOK_GIT_CAPTURE_ARGS: capturedArgsPath,
                    LOOK_GIT_CAPTURE_MANIFEST: capturedManifestPath,
                    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
                },
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            const capturedManifest = readJsonObject(capturedManifestPath);
            const capturedArgs = fs.readFileSync(capturedArgsPath, 'utf8');
            expect(capturedManifest.displayName).toBe('Look Git');
            expect(capturedArgs).toContain('--out');
            expect(capturedArgs).toContain('look-git-1.0.1.vsix');
            expect(capturedArgs).not.toContain('experimental');
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
