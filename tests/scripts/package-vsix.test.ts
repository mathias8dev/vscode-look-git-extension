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
        expect(result.restoredPackageJson).toBe(result.originalPackageJson);
        expect(result.sourcePackageJsonAfter).toBe(result.sourcePackageJsonBefore);
    });

    it('packages experimental display name and timestamped version without mutating package.json', () => {
        const result = runPackageVsix(['experimental']);
        expect(result.capturedManifest.displayName).toBe('Look Git Experimental');
        expect(result.capturedManifest.version).toMatch(new RegExp(`${String(result.manifest.version)}-experimental-\\d{14}`));
        expect(result.capturedArgs).toMatch(new RegExp(`${String(result.manifest.name)}-${String(result.manifest.version)}-experimental-\\d{14}\\.vsix`));
        expect(result.restoredPackageJson).toBe(result.originalPackageJson);
        expect(result.sourcePackageJsonAfter).toBe(result.sourcePackageJsonBefore);
    });
});

function runPackageVsix(args: readonly string[]): {
    readonly originalPackageJson: string;
    readonly restoredPackageJson: string;
    readonly sourcePackageJsonBefore: string;
    readonly sourcePackageJsonAfter: string;
    readonly manifest: Record<string, unknown>;
    readonly capturedManifest: Record<string, unknown>;
    readonly capturedArgs: string;
} {
    const sourceRoot = process.cwd();
    const sourcePackageJsonPath = path.join(sourceRoot, 'package.json');
    const sourcePackageJsonBefore = fs.readFileSync(sourcePackageJsonPath, 'utf8');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-package-vsix-'));
    const workspaceRoot = path.join(root, 'workspace');
    const scriptsPath = path.join(workspaceRoot, 'scripts');
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    const packageScriptPath = path.join(scriptsPath, 'package-vsix.ts');
    const vsceCliPath = path.join(root, 'vsce-test.js');
    const capturedManifestPath = path.join(root, 'captured-package.json');
    const capturedArgsPath = path.join(root, 'captured-vsce-args.txt');

    try {
        fs.mkdirSync(scriptsPath, { recursive: true });
        fs.writeFileSync(packageJsonPath, sourcePackageJsonBefore);
        fs.copyFileSync(path.join(sourceRoot, 'scripts', 'package-vsix.ts'), packageScriptPath);
        fs.writeFileSync(vsceCliPath, [
            "const fs = require('node:fs');",
            "fs.copyFileSync('package.json', process.env.LOOK_GIT_CAPTURE_MANIFEST);",
            "fs.writeFileSync(process.env.LOOK_GIT_CAPTURE_ARGS, process.argv.slice(2).join('\\n'));",
            '',
        ].join('\n'));

        execFileSync(process.execPath, [packageScriptPath, ...args], {
            cwd: workspaceRoot,
            env: {
                ...process.env,
                LOOK_GIT_VSCE_CLI: vsceCliPath,
                LOOK_GIT_CAPTURE_ARGS: capturedArgsPath,
                LOOK_GIT_CAPTURE_MANIFEST: capturedManifestPath,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        return {
            originalPackageJson: sourcePackageJsonBefore,
            restoredPackageJson: fs.readFileSync(packageJsonPath, 'utf8'),
            sourcePackageJsonBefore,
            sourcePackageJsonAfter: fs.readFileSync(sourcePackageJsonPath, 'utf8'),
            manifest: readJsonObject(packageJsonPath),
            capturedManifest: readJsonObject(capturedManifestPath),
            capturedArgs: fs.readFileSync(capturedArgsPath, 'utf8'),
        };
    } finally {
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
