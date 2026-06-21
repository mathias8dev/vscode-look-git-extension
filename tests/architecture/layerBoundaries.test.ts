import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const IMPORT_PATTERN = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const LAYER_ALIASES = new Map<string, string>([
    ['@application', 'application'],
    ['@core', 'core'],
    ['@extension', 'extension'],
    ['@protocol', 'protocol'],
    ['@webview', 'webview'],
]);

interface BoundaryRule {
    readonly layer: string;
    readonly forbiddenLayers: readonly string[];
    readonly forbiddenPackages: readonly string[];
}

const RULES: readonly BoundaryRule[] = [
    { layer: 'core', forbiddenLayers: ['application', 'protocol', 'extension', 'webview'], forbiddenPackages: ['vscode', 'react', 'react-dom', 'react-dom/client', 'fs', 'fs/promises', 'node:fs', 'node:fs/promises', 'child_process', 'node:child_process'] },
    { layer: 'application', forbiddenLayers: ['protocol', 'extension', 'webview'], forbiddenPackages: ['vscode', 'react', 'react-dom', 'react-dom/client', 'child_process', 'node:child_process'] },
    { layer: 'protocol', forbiddenLayers: ['core', 'application', 'extension', 'webview'], forbiddenPackages: ['vscode', 'react', 'react-dom', 'react-dom/client'] },
    { layer: 'webview', forbiddenLayers: ['core', 'application', 'extension'], forbiddenPackages: ['vscode'] },
    { layer: 'extension', forbiddenLayers: ['webview'], forbiddenPackages: ['react', 'react-dom', 'react-dom/client'] },
];

describe('architecture layer boundaries', () => {
    it('keeps source layers pointing in the intended direction', () => {
        const violations: string[] = [];
        for (const filePath of listSourceFiles(SRC_ROOT)) {
            const sourceLayer = layerOf(filePath);
            const rule = RULES.find((candidate) => candidate.layer === sourceLayer);
            if (!rule) { continue; }

            for (const specifier of importSpecifiers(filePath)) {
                if (rule.forbiddenPackages.includes(specifier)) {
                    violations.push(`${relative(filePath)} imports forbidden package "${specifier}"`);
                    continue;
                }

                const targetLayer = targetLayerOf(filePath, specifier);
                if (targetLayer && rule.forbiddenLayers.includes(targetLayer)) {
                    violations.push(`${relative(filePath)} imports ${targetLayer} via "${specifier}"`);
                }
            }
        }

        expect(violations).toEqual([]);
    });

    it('keeps graph protocol semantic and free of rendering layout data', () => {
        const source = fs.readFileSync(path.join(SRC_ROOT, 'protocol', 'graph', 'types.ts'), 'utf8');
        expect(source).not.toMatch(/\b(GraphRow|LaneData|LineDef)\b/);
        expect(source).not.toMatch(/\b(rows|maxLane|color|fromLane|toLane)\b/);
        expect(source).toMatch(/\bcommits: readonly GraphCommit\[]/);
    });

    it('keeps changes protocol semantic and free of webview rendering state', () => {
        const source = fs.readFileSync(path.join(SRC_ROOT, 'protocol', 'changes', 'types.ts'), 'utf8');
        expect(source).not.toMatch(/\b(ChangeSection|ChangeTree|TreeNode|ViewMode)\b/);
        expect(source).not.toMatch(/\b(label|title|className|expanded|selected)\b/);
        expect(source).toMatch(/\bstaged: readonly StatusEntry\[]/);
        expect(source).toMatch(/\bstashes: readonly StashEntry\[]/);
    });

    it('keeps reusable webview feature code free of VS Code host side effects', () => {
        const violations: string[] = [];
        const featureRoot = path.join(SRC_ROOT, 'webview', 'features');
        for (const filePath of listSourceFiles(featureRoot)) {
            const source = fs.readFileSync(filePath, 'utf8');
            if (source.includes('vscodeHost') || source.includes('vscodeApi') || source.includes('acquireVsCodeApi')) {
                violations.push(relative(filePath));
            }
        }

        expect(violations).toEqual([]);
    });

    it('keeps webview features from importing each other directly', () => {
        const violations: string[] = [];
        const featureRoot = path.join(SRC_ROOT, 'webview', 'features');
        for (const filePath of listSourceFiles(featureRoot)) {
            const sourceFeature = webviewFeatureOf(filePath);
            if (!sourceFeature) { continue; }

            for (const specifier of importSpecifiers(filePath)) {
                const targetPath = targetPathOf(filePath, specifier);
                if (!targetPath) { continue; }

                const targetFeature = webviewFeatureOf(targetPath);
                if (targetFeature && targetFeature !== sourceFeature) {
                    violations.push(`${relative(filePath)} imports ${targetFeature} feature via "${specifier}"`);
                }
            }
        }

        expect(violations).toEqual([]);
    });
});

function listSourceFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listSourceFiles(fullPath));
        } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
            files.push(fullPath);
        }
    }
    return files;
}

function importSpecifiers(filePath: string): string[] {
    const source = fs.readFileSync(filePath, 'utf8');
    const specifiers: string[] = [];
    for (const match of source.matchAll(IMPORT_PATTERN)) {
        const specifier = match[1];
        if (specifier) { specifiers.push(specifier); }
    }
    return specifiers;
}

function layerOf(filePath: string): string | undefined {
    const relativePath = relative(filePath);
    return relativePath.split(path.sep)[0];
}

function targetLayerOf(filePath: string, specifier: string): string | undefined {
    for (const [alias, layer] of LAYER_ALIASES) {
        if (specifier === alias || specifier.startsWith(`${alias}/`)) { return layer; }
    }
    if (!specifier.startsWith('.')) { return undefined; }
    const resolved = path.resolve(path.dirname(filePath), specifier);
    const relativeTarget = path.relative(SRC_ROOT, resolved);
    if (relativeTarget.startsWith('..')) { return undefined; }
    return relativeTarget.split(path.sep)[0];
}

function targetPathOf(filePath: string, specifier: string): string | undefined {
    if (specifier === '@webview') { return path.join(SRC_ROOT, 'webview'); }
    if (specifier.startsWith('@webview/')) {
        return path.join(SRC_ROOT, 'webview', ...specifier.slice('@webview/'.length).split('/'));
    }

    if (!specifier.startsWith('.')) { return undefined; }
    const resolved = path.resolve(path.dirname(filePath), specifier);
    const relativeTarget = path.relative(SRC_ROOT, resolved);
    return relativeTarget.startsWith('..') ? undefined : resolved;
}

function webviewFeatureOf(filePath: string): string | undefined {
    const relativePath = relative(filePath);
    const parts = relativePath.split(path.sep);
    return parts[0] === 'webview' && parts[1] === 'features' ? parts[2] : undefined;
}

function relative(filePath: string): string {
    return path.relative(SRC_ROOT, filePath);
}
