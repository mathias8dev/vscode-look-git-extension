import {
    defaultFileIcon,
    fileExtensionIcons,
    fileNameIcons,
    languageFileNameIcons,
    languageFilePatterns,
    languageExtensionIcons,
    type VscodeIconName,
} from '@webview/shared/vscode-icon-catalog.generated';

export type WebviewFileIconKind = VscodeIconName;

const fallbackExtensionIcons: Readonly<Record<string, VscodeIconName>> = {
    exs: 'file-type-elixir',
    graphql: 'file-type-graphql',
    hrl: 'file-type-erlang',
    kts: 'file-type-kotlin',
    pbxproj: 'file-type-xcode',
    sc: 'file-type-scala',
};

const extensionIconOverrides: Readonly<Record<string, VscodeIconName>> = {
    cjs: 'file-type-js-official',
    cts: 'file-type-typescript-official',
    'd.cts': 'file-type-typescriptdef-official',
    'd.mts': 'file-type-typescriptdef-official',
    'd.ts': 'file-type-typescriptdef-official',
    js: 'file-type-js-official',
    mjs: 'file-type-js-official',
    mts: 'file-type-typescript-official',
    ts: 'file-type-typescript-official',
};

export function iconKindForPath(filePath: string): WebviewFileIconKind {
    const name = fileName(filePath);
    const normalizedName = name.toLowerCase();
    const exact = fileNameIcons[name] ?? fileNameIcons[normalizedName] ?? languageFileNameIcons[normalizedName];
    if (exact) { return exact; }

    const normalizedPath = filePath.replaceAll('\\', '/').toLowerCase();
    const pattern = languageFilePatterns.find((entry) => matchesWildcard(
        entry.pattern.includes('/') ? normalizedPath : normalizedName,
        entry.pattern,
    ));
    if (pattern) { return pattern.icon; }
    if (isGenericConfigFile(normalizedName)) { return 'file-type-config'; }

    for (const suffix of suffixesForName(normalizedName)) {
        const icon = extensionIconOverrides[suffix]
            ?? fileExtensionIcons[suffix]
            ?? languageExtensionIcons[suffix]
            ?? fallbackExtensionIcons[suffix];
        if (icon) { return icon; }
    }
    return defaultFileIcon;
}

function matchesWildcard(value: string, pattern: string): boolean {
    const parts = pattern.split('*');
    let offset = 0;
    if (!pattern.startsWith('*') && !value.startsWith(parts[0] ?? '')) { return false; }
    for (const part of parts) {
        if (!part) { continue; }
        const index = value.indexOf(part, offset);
        if (index < 0) { return false; }
        offset = index + part.length;
    }
    const last = parts.at(-1) ?? '';
    return pattern.endsWith('*') || value.endsWith(last);
}

function fileName(filePath: string): string {
    return filePath.split(/[\\/]/).pop() || filePath;
}

function isGenericConfigFile(name: string): boolean {
    return name.endsWith('config.js')
        || name.endsWith('config.ts')
        || name.endsWith('config.json')
        || name.endsWith('rc')
        || name.includes('.config.')
        || name.startsWith('.');
}

function suffixesForName(name: string): readonly string[] {
    const parts = name.split('.');
    const suffixes: string[] = [];
    for (let index = 0; index < parts.length; index += 1) {
        const suffix = parts.slice(index).join('.');
        if (suffix) { suffixes.push(suffix); }
    }
    return suffixes;
}
