import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('package-vsix', () => {
    it('packages a timestamped filename by default without mutating package.json', () => {
        const result = runPackageVsix([]);
        expect(result.capturedManifest.displayName).toBe('Look Git');
        expect(result.capturedManifest.version).toMatch(new RegExp(`${String(result.manifest.version)}-\\d{14}`));
        expect(result.capturedArgs).toContain('--no-dependencies');
        expect(result.capturedArgs).toContain('--out');
        expect(result.capturedArgs).toMatch(new RegExp(`${String(result.manifest.name)}-${String(result.manifest.version)}-\\d{14}\\.vsix`));
        expect(result.capturedArgs).not.toContain('experimental');
        expect(fs.readFileSync(result.packageJsonPath, 'utf8')).toBe(result.originalPackageJson);
    });

    it('packages experimental display name and timestamped version without mutating package.json', () => {
        const result = runPackageVsix(['experimental']);
        expect(result.capturedManifest.displayName).toBe('Look Git Experimental');
        expect(result.capturedManifest.version).toMatch(new RegExp(`${String(result.manifest.version)}-experimental-\\d{14}`));
        expect(result.capturedArgs).toMatch(new RegExp(`${String(result.manifest.name)}-${String(result.manifest.version)}-experimental-\\d{14}\\.vsix`));
        expect(fs.readFileSync(result.packageJsonPath, 'utf8')).toBe(result.originalPackageJson);
    });
});

function runPackageVsix(args: readonly string[]): {
    readonly packageJsonPath: string;
    readonly originalPackageJson: string;
    readonly manifest: Record<string, unknown>;
    readonly capturedManifest: Record<string, unknown>;
    readonly capturedArgs: string;
} {
    const repoRoot = process.cwd();
    const packageJsonPath = path.join(repoRoot, 'package.json');
    const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-package-vsix-'));
    const vsceCliPath = path.join(root, 'vsce-test.js');
    const capturedManifestPath = path.join(root, 'captured-package.json');
    const capturedArgsPath = path.join(root, 'captured-vsce-args.txt');

    try {
        fs.writeFileSync(vsceCliPath, [
            '#!/usr/bin/env node',
            "const fs = require('node:fs');",
            "fs.copyFileSync('package.json', process.env.LOOK_GIT_CAPTURE_MANIFEST);",
            "fs.writeFileSync(process.env.LOOK_GIT_CAPTURE_ARGS, process.argv.slice(2).join('\\n'));",
            '',
        ].join('\n'));
        fs.chmodSync(vsceCliPath, 0o755);

        execFileSync('node', ['scripts/package-vsix.ts', ...args], {
            cwd: repoRoot,
            env: {
                ...process.env,
                LOOK_GIT_VSCE_CLI: vsceCliPath,
                LOOK_GIT_CAPTURE_ARGS: capturedArgsPath,
                LOOK_GIT_CAPTURE_MANIFEST: capturedManifestPath,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        return {
            packageJsonPath,
            originalPackageJson,
            manifest: readJsonObject(packageJsonPath),
            capturedManifest: readJsonObject(capturedManifestPath),
            capturedArgs: fs.readFileSync(capturedArgsPath, 'utf8'),
        };
    } finally {
        fs.writeFileSync(packageJsonPath, originalPackageJson);
        fs.rmSync(root, { recursive: true, force: true });
    }
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
