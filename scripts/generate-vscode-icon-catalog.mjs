import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [themePath, languagesModulePath, vscodeExtensionsPath] = process.argv.slice(2);
const outputPath = path.join(repoRoot, 'src', 'webview', 'shared', 'vscode-icon-catalog.generated.ts');

if (!themePath || !languagesModulePath || !vscodeExtensionsPath) {
    throw new Error('Usage: node scripts/generate-vscode-icon-catalog.mjs <vsicons-icon-theme.json> <compiled-languages.js> <vscode-extensions>');
}

const iconPackagePath = path.join(repoRoot, 'node_modules', '@iconify', 'icons-vscode-icons');
const iconPackage = readJson(path.join(iconPackagePath, 'package.json'));
const theme = readJson(path.resolve(themePath));
const languageModule = require(path.resolve(languagesModulePath));
const languages = languageModule.languages;

if (iconPackage.iconSetInfo?.version !== '12.6.0') {
    throw new Error(`Expected vscode-icons 12.6.0, received ${String(iconPackage.iconSetInfo?.version)}.`);
}
if (!isRecord(languages)) {
    throw new Error('The compiled vscode-icons language module does not export a languages object.');
}

const iconNames = fs.readdirSync(iconPackagePath)
    .filter((name) => name.endsWith('.js'))
    .map((name) => name.slice(0, -3))
    .sort();
const iconNameSet = new Set(iconNames);
const lightIconByDarkName = new Map();
const eagerIconNames = ['default-file', 'default-folder', 'default-folder-opened'];
const eagerIconImports = eagerIconNames.map((name, index) => `import eagerIcon${index} from '@iconify/icons-vscode-icons/${name}';`);

const fileNameIcons = associationsFor('fileNames');
const fileExtensionIcons = associationsFor('fileExtensions');
const languageAssociations = buildLanguageAssociations();
const folderIcons = folderAssociations();
const defaultFolderIcons = {
    closed: iconNameForDefinition(theme.folder),
    opened: iconNameForDefinition(theme.folderExpanded),
};

const source = [
    ...eagerIconImports,
    "import type { IconifySvgData } from '@webview/shared/iconify-svg';",
    '',
    `export const vscodeIconCatalogVersion = ${JSON.stringify(iconPackage.iconSetInfo.version)};`,
    `export const vscodeIconNames = ${render(iconNames)} as const;`,
    '',
    'export type VscodeIconName = (typeof vscodeIconNames)[number];',
    '',
    'export interface VscodeIconModule {',
    '    readonly default: IconifySvgData;',
    '}',
    '',
    `export const vscodeIconLoaders: Readonly<Record<VscodeIconName, () => Promise<VscodeIconModule>>> = ${renderIconLoaders(iconNames, eagerIconNames)};`,
    '',
    'export const fallbackFileIconAsset = eagerIcon0;',
    'export const fallbackFolderIconAsset = eagerIcon1;',
    'export const fallbackOpenedFolderIconAsset = eagerIcon2;',
    '',
    'export interface VscodeFolderIconNames {',
    '    readonly closed: VscodeIconName;',
    '    readonly opened: VscodeIconName;',
    '}',
    '',
    'export interface VscodeFileIconPattern {',
    '    readonly pattern: string;',
    '    readonly icon: VscodeIconName;',
    '}',
    '',
    `export const defaultFileIcon = ${JSON.stringify(iconNameForDefinition(theme.file))} satisfies VscodeIconName;`,
    `export const defaultFolderIcons = ${render(defaultFolderIcons)} as const satisfies VscodeFolderIconNames;`,
    '',
    `export const fileNameIcons: Readonly<Record<string, VscodeIconName>> = ${render(fileNameIcons)};`,
    '',
    `export const fileExtensionIcons: Readonly<Record<string, VscodeIconName>> = ${render(fileExtensionIcons)};`,
    '',
    `export const languageFileNameIcons: Readonly<Record<string, VscodeIconName>> = ${render(languageAssociations.fileNames)};`,
    '',
    `export const languageFilePatterns: readonly VscodeFileIconPattern[] = ${render(languageAssociations.patterns)};`,
    '',
    `export const languageExtensionIcons: Readonly<Record<string, VscodeIconName>> = ${render(languageAssociations.extensions)};`,
    '',
    `export const folderIcons: Readonly<Record<string, VscodeFolderIconNames>> = ${render(folderIcons)};`,
    '',
    `export const lightIconByDarkName: Partial<Readonly<Record<VscodeIconName, VscodeIconName>>> = ${render(Object.fromEntries([...lightIconByDarkName].sort(([left], [right]) => left.localeCompare(right))))};`,
    '',
].join('\n');

fs.writeFileSync(outputPath, source, 'utf8');
console.log(`Generated ${path.relative(repoRoot, outputPath)} with ${iconNames.length} icon names.`);

function associationsFor(sectionName) {
    const result = {};
    const dark = theme[sectionName] ?? {};
    const light = theme.light?.[sectionName] ?? {};
    for (const key of Object.keys(dark).sort()) {
        result[key] = registerPair(dark[key], light[key]);
    }
    return result;
}

function buildLanguageAssociations() {
    const extensions = {};
    const scores = {};
    const fileNames = {};
    const patterns = [];
    for (const [languageName, language] of Object.entries(languages)) {
        if (!isRecord(language) || typeof language.defaultExtension !== 'string') { continue; }
        const languageIds = Array.isArray(language.ids) ? language.ids : [language.ids];
        const languageId = languageIds.find((id) => typeof id === 'string' && theme.languageIds?.[id]);
        if (typeof languageId !== 'string') { continue; }
        const normalizedExtension = language.defaultExtension.replace(/^\./, '').toLowerCase();
        const score = languageAssociationScore(languageName, languageIds, normalizedExtension);
        if ((scores[normalizedExtension] ?? 0) <= score) {
            extensions[normalizedExtension] = registerLanguagePair(languageId);
            scores[normalizedExtension] = score;
        }
    }

    const extensionRoot = path.resolve(vscodeExtensionsPath);
    for (const entry of fs.readdirSync(extensionRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) { continue; }
        const manifestPath = path.join(extensionRoot, entry.name, 'package.json');
        if (!fs.existsSync(manifestPath)) { continue; }
        const manifest = readJson(manifestPath);
        const contributedLanguages = manifest.contributes?.languages;
        if (!Array.isArray(contributedLanguages)) { continue; }
        for (const language of contributedLanguages) {
            if (!isRecord(language) || typeof language.id !== 'string' || !theme.languageIds?.[language.id]) { continue; }
            const icon = registerLanguagePair(language.id);
            for (const extension of stringsFrom(language.extensions)) {
                extensions[extension.replace(/^\./, '').toLowerCase()] = icon;
            }
            for (const fileName of stringsFrom(language.filenames)) {
                fileNames[fileName.toLowerCase()] = icon;
            }
            for (const pattern of stringsFrom(language.filenamePatterns)) {
                patterns.push({ pattern: pattern.toLowerCase(), icon });
            }
        }
    }

    patterns.sort((left, right) => right.pattern.length - left.pattern.length || left.pattern.localeCompare(right.pattern));
    return {
        extensions: sortRecord(extensions),
        fileNames: sortRecord(fileNames),
        patterns,
    };
}

function registerLanguagePair(languageId) {
    return registerPair(theme.languageIds[languageId], theme.light?.languageIds?.[languageId]);
}

function languageAssociationScore(languageName, languageIds, extension) {
    if (languageName.toLowerCase() === extension) { return 3; }
    if (languageIds.some((id) => typeof id === 'string' && id.toLowerCase() === extension)) { return 2; }
    return 1;
}

function folderAssociations() {
    const result = {};
    for (const key of Object.keys(theme.folderNames ?? {}).sort()) {
        const closed = registerPair(theme.folderNames[key], theme.light?.folderNames?.[key]);
        const opened = registerPair(theme.folderNamesExpanded[key], theme.light?.folderNamesExpanded?.[key]);
        result[key] = { closed, opened };
    }
    return result;
}

function registerPair(darkDefinition, lightDefinition) {
    const dark = iconNameForDefinition(darkDefinition);
    if (lightDefinition) {
        const light = iconNameForDefinition(lightDefinition);
        if (light !== dark) {
            const previous = lightIconByDarkName.get(dark);
            if (previous && previous !== light) {
                throw new Error(`Conflicting light icons for ${dark}: ${previous} and ${light}.`);
            }
            lightIconByDarkName.set(dark, light);
        }
    }
    return dark;
}

function iconNameForDefinition(definitionName) {
    if (typeof definitionName !== 'string') {
        throw new Error(`Invalid icon definition ${String(definitionName)}.`);
    }
    const iconPath = theme.iconDefinitions?.[definitionName]?.iconPath;
    if (typeof iconPath !== 'string' || iconPath.length === 0) {
        throw new Error(`Icon definition ${definitionName} has no path.`);
    }
    const iconName = path.basename(iconPath, path.extname(iconPath)).replaceAll('_', '-').toLowerCase();
    if (iconNameSet.has(iconName)) { return iconName; }
    const fallback = fallbackIconNameForMissingAsset(iconName);
    console.warn(`Using ${fallback} because ${iconName} from ${definitionName} is absent from the Iconify catalog.`);
    return fallback;
}

function fallbackIconNameForMissingAsset(iconName) {
    if (iconNameSet.has(`${iconName}2`)) { return `${iconName}2`; }
    if (iconName.startsWith('folder-type-') && iconName.endsWith('-opened')) { return 'default-folder-opened'; }
    if (iconName.startsWith('folder-type-')) { return 'default-folder'; }
    return 'default-file';
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function render(value) {
    return JSON.stringify(value, null, 4);
}

function renderIconLoaders(names, eagerNames) {
    const eagerIndexByName = new Map(eagerNames.map((name, index) => [name, index]));
    const entries = names.map((name) => {
        const eagerIndex = eagerIndexByName.get(name);
        const loader = eagerIndex === undefined
            ? `() => import('@iconify/icons-vscode-icons/${name}')`
            : `() => Promise.resolve({ default: eagerIcon${eagerIndex} })`;
        return `    ${JSON.stringify(name)}: ${loader},`;
    });
    return `{\n${entries.join('\n')}\n}`;
}

function sortRecord(value) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringsFrom(value) {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}
