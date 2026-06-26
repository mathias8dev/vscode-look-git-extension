import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const testsRoot = path.join(root, 'tests');
const sourceExtensions = new Set(['.ts', '.tsx']);
const importPattern = /((?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"])([^'"]+)(['"])/g;
const dynamicImportPattern = /(import\(\s*['"])([^'"]+)(['"]\s*\))/g;
const srcAliases = new Map([
    ['application', '@application'],
    ['core', '@core'],
    ['extension', '@extension'],
    ['protocol', '@protocol'],
    ['webview', '@webview'],
]);

const sourceFiles = [...listSourceFiles(srcRoot), ...listSourceFiles(testsRoot)];
let changedCount = 0;

for (const filePath of sourceFiles) {
    const before = fs.readFileSync(filePath, 'utf8');
    const after = replaceImportSpecifiers(before, filePath);

    if (after !== before) {
        fs.writeFileSync(filePath, after);
        changedCount += 1;
    }
}

console.log(`Normalized import aliases in ${changedCount} file${changedCount === 1 ? '' : 's'}.`);

function replaceImportSpecifiers(source, filePath) {
    return source
        .replace(importPattern, (match, prefix, specifier, suffix) => replaceSpecifier(match, prefix, specifier, suffix, filePath))
        .replace(dynamicImportPattern, (match, prefix, specifier, suffix) => replaceSpecifier(match, prefix, specifier, suffix, filePath));
}

function replaceSpecifier(match, prefix, specifier, suffix, filePath) {
        const target = resolveSourceFile(filePath, specifier);
        if (!target) { return match; }

        const alias = aliasFor(target);
        return alias ? `${prefix}${alias}${suffix}` : match;
}

function listSourceFiles(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...listSourceFiles(fullPath));
        } else if (sourceExtensions.has(path.extname(entry.name))) {
            files.push(fullPath);
        }
    }
    return files;
}

function resolveSourceFile(fromFile, specifier) {
    if (!specifier.startsWith('.')) { return undefined; }

    const basePath = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.d.ts`,
        path.join(basePath, 'index.ts'),
        path.join(basePath, 'index.tsx'),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function aliasFor(target) {
    const srcRelative = path.relative(srcRoot, target);
    if (!srcRelative.startsWith('..') && !path.isAbsolute(srcRelative)) {
        const [layer, ...rest] = srcRelative.split(path.sep);
        const alias = srcAliases.get(layer);
        if (!alias) { return undefined; }
        const targetWithoutExtension = path.join(...rest).replace(/\.d\.ts$|\.(tsx?|jsx?)$/, '');
        return targetWithoutExtension ? `${alias}/${toPosix(targetWithoutExtension)}` : alias;
    }

    const testsRelative = path.relative(testsRoot, target);
    if (!testsRelative.startsWith('..') && !path.isAbsolute(testsRelative)) {
        const targetWithoutExtension = testsRelative.replace(/\.d\.ts$|\.(tsx?|jsx?)$/, '');
        return targetWithoutExtension ? `@tests/${toPosix(targetWithoutExtension)}` : '@tests';
    }

    return undefined;
}

function toPosix(value) {
    return value.split(path.sep).join('/');
}
