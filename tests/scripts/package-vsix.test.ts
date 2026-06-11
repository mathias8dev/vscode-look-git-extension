import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('package-vsix', () => {
    it('packages the stable displayName and filename on every branch', () => {
        const repoRoot = process.cwd();
        const packageJsonPath = path.join(repoRoot, 'package.json');
        const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-package-vsix-'));
        const vsceCliPath = path.join(root, 'vsce-test.js');
        const capturedManifestPath = path.join(root, 'captured-package.json');
        const capturedArgsPath = path.join(root, 'captured-vsce-args.txt');

        try {
            fs.writeFileSync(vsceCliPath, [
                "const fs = require('node:fs');",
                "fs.copyFileSync('package.json', process.env.LOOK_GIT_CAPTURE_MANIFEST);",
                "fs.writeFileSync(process.env.LOOK_GIT_CAPTURE_ARGS, process.argv.slice(2).join('\\n'));",
                '',
            ].join('\n'));

            execFileSync('node', ['scripts/package-vsix.ts'], {
                cwd: repoRoot,
                env: {
                    ...process.env,
                    LOOK_GIT_VSCE_CLI: vsceCliPath,
                    LOOK_GIT_CAPTURE_ARGS: capturedArgsPath,
                    LOOK_GIT_CAPTURE_MANIFEST: capturedManifestPath,
                },
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            const manifest = readJsonObject(packageJsonPath);
            const expectedVsixName = `${String(manifest.name)}-${String(manifest.version)}.vsix`;
            const capturedManifest = readJsonObject(capturedManifestPath);
            const capturedArgs = fs.readFileSync(capturedArgsPath, 'utf8');
            expect(capturedManifest.displayName).toBe('Look Git');
            expect(capturedArgs).toContain('--out');
            expect(capturedArgs).toContain(expectedVsixName);
            expect(capturedArgs).not.toContain('experimental');
            expect(fs.readFileSync(packageJsonPath, 'utf8')).toBe(originalPackageJson);
        } finally {
            fs.writeFileSync(packageJsonPath, originalPackageJson);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

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
