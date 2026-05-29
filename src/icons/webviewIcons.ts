import type { IconifyIcon } from '@iconify/types';
import defaultFileIcon from '@iconify/icons-vscode-icons/default-file';
import defaultFolderIcon from '@iconify/icons-vscode-icons/default-folder';
import defaultFolderOpenedIcon from '@iconify/icons-vscode-icons/default-folder-opened';
import fileTypeAstroIcon from '@iconify/icons-vscode-icons/file-type-astro';
import fileTypeBinaryIcon from '@iconify/icons-vscode-icons/file-type-binary';
import fileTypeCIcon from '@iconify/icons-vscode-icons/file-type-c';
import fileTypeConfigIcon from '@iconify/icons-vscode-icons/file-type-config';
import fileTypeCppIcon from '@iconify/icons-vscode-icons/file-type-cpp';
import fileTypeCsharpIcon from '@iconify/icons-vscode-icons/file-type-csharp';
import fileTypeCssIcon from '@iconify/icons-vscode-icons/file-type-css';
import fileTypeDartIcon from '@iconify/icons-vscode-icons/file-type-dartlang';
import fileTypeDockerIcon from '@iconify/icons-vscode-icons/file-type-docker';
import fileTypeDotenvIcon from '@iconify/icons-vscode-icons/file-type-dotenv';
import fileTypeEditorconfigIcon from '@iconify/icons-vscode-icons/file-type-editorconfig';
import fileTypeEslintIcon from '@iconify/icons-vscode-icons/file-type-eslint';
import fileTypeGitIcon from '@iconify/icons-vscode-icons/file-type-git';
import fileTypeGoIcon from '@iconify/icons-vscode-icons/file-type-go';
import fileTypeGraphqlIcon from '@iconify/icons-vscode-icons/file-type-graphql';
import fileTypeHtmlIcon from '@iconify/icons-vscode-icons/file-type-html';
import fileTypeImageIcon from '@iconify/icons-vscode-icons/file-type-image';
import fileTypeJavaIcon from '@iconify/icons-vscode-icons/file-type-java';
import fileTypeJsconfigIcon from '@iconify/icons-vscode-icons/file-type-jsconfig';
import fileTypeJavascriptIcon from '@iconify/icons-vscode-icons/file-type-js-official';
import fileTypeJsonIcon from '@iconify/icons-vscode-icons/file-type-json-official';
import fileTypeKotlinIcon from '@iconify/icons-vscode-icons/file-type-kotlin';
import fileTypeLessIcon from '@iconify/icons-vscode-icons/file-type-less';
import fileTypeLicenseIcon from '@iconify/icons-vscode-icons/file-type-license';
import fileTypeLogIcon from '@iconify/icons-vscode-icons/file-type-log';
import fileTypeLuaIcon from '@iconify/icons-vscode-icons/file-type-lua';
import fileTypeMarkdownIcon from '@iconify/icons-vscode-icons/file-type-markdown';
import fileTypeNpmIcon from '@iconify/icons-vscode-icons/file-type-npm';
import fileTypePackageIcon from '@iconify/icons-vscode-icons/file-type-package';
import fileTypePdfIcon from '@iconify/icons-vscode-icons/file-type-pdf2';
import fileTypePhpIcon from '@iconify/icons-vscode-icons/file-type-php';
import fileTypePnpmIcon from '@iconify/icons-vscode-icons/file-type-pnpm';
import fileTypePrettierIcon from '@iconify/icons-vscode-icons/file-type-prettier';
import fileTypeProtobufIcon from '@iconify/icons-vscode-icons/file-type-protobuf';
import fileTypePythonIcon from '@iconify/icons-vscode-icons/file-type-python';
import fileTypeReactjsIcon from '@iconify/icons-vscode-icons/file-type-reactjs';
import fileTypeReacttsIcon from '@iconify/icons-vscode-icons/file-type-reactts';
import fileTypeRubyIcon from '@iconify/icons-vscode-icons/file-type-ruby';
import fileTypeRustIcon from '@iconify/icons-vscode-icons/file-type-rust';
import fileTypeSassIcon from '@iconify/icons-vscode-icons/file-type-sass';
import fileTypeScssIcon from '@iconify/icons-vscode-icons/file-type-scss';
import fileTypeShellIcon from '@iconify/icons-vscode-icons/file-type-shell';
import fileTypeSourceIcon from '@iconify/icons-vscode-icons/file-type-source';
import fileTypeSqlIcon from '@iconify/icons-vscode-icons/file-type-sql';
import fileTypeSvelteIcon from '@iconify/icons-vscode-icons/file-type-svelte';
import fileTypeSvgIcon from '@iconify/icons-vscode-icons/file-type-svg';
import fileTypeSwiftIcon from '@iconify/icons-vscode-icons/file-type-swift';
import fileTypeTerraformIcon from '@iconify/icons-vscode-icons/file-type-terraform';
import fileTypeTextIcon from '@iconify/icons-vscode-icons/file-type-text';
import fileTypeTomlIcon from '@iconify/icons-vscode-icons/file-type-toml';
import fileTypeTsconfigIcon from '@iconify/icons-vscode-icons/file-type-tsconfig-official';
import fileTypeTypescriptIcon from '@iconify/icons-vscode-icons/file-type-typescript-official';
import fileTypeTypescriptDefIcon from '@iconify/icons-vscode-icons/file-type-typescriptdef-official';
import fileTypeViteIcon from '@iconify/icons-vscode-icons/file-type-vite';
import fileTypeVitestIcon from '@iconify/icons-vscode-icons/file-type-vitest';
import fileTypeVueIcon from '@iconify/icons-vscode-icons/file-type-vue';
import fileTypeWasmIcon from '@iconify/icons-vscode-icons/file-type-wasm';
import fileTypeWebpackIcon from '@iconify/icons-vscode-icons/file-type-webpack';
import fileTypeXmlIcon from '@iconify/icons-vscode-icons/file-type-xml';
import fileTypeYamlIcon from '@iconify/icons-vscode-icons/file-type-yaml';
import fileTypeYarnIcon from '@iconify/icons-vscode-icons/file-type-yarn';
import fileTypeZipIcon from '@iconify/icons-vscode-icons/file-type-zip';

type SvgIconOptions = {
    className?: string;
    size?: number;
    ariaHidden?: boolean;
};

type LineIconOptions = SvgIconOptions & {
    strokeWidth?: number;
};

function attrs(options: SvgIconOptions = {}, viewBox = '0 0 16 16'): string {
    const size = options.size ?? 16;
    const className = options.className ? ` class="${options.className}"` : '';
    const ariaHidden = options.ariaHidden === false ? '' : ' aria-hidden="true"';
    return `${className} width="${size}" height="${size}" viewBox="${viewBox}"${ariaHidden} xmlns="http://www.w3.org/2000/svg"`;
}

function modernIcon(content: string, options: LineIconOptions = {}): string {
    return `<svg ${attrs(options, '0 0 24 24')} fill="none" stroke="currentColor" stroke-width="${options.strokeWidth ?? 1.9}" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

function iconifyIcon(icon: IconifyIcon, iconId: string, options: SvgIconOptions = {}): string {
    const size = options.size ?? 16;
    const className = options.className ? ` class="${options.className}"` : '';
    const ariaHidden = options.ariaHidden === false ? '' : ' aria-hidden="true"';
    const width = icon.width ?? 16;
    const height = icon.height ?? 16;
    return `<svg${className} data-icon="${iconId}" width="${size}" height="${size}" viewBox="0 0 ${width} ${height}"${ariaHidden} xmlns="http://www.w3.org/2000/svg">${icon.body}</svg>`;
}

export const ICON_PLUS = modernIcon('<path d="M12 5v14"/><path d="M5 12h14"/>');
export const ICON_MINUS = modernIcon('<path d="M5 12h14"/>');
export const ICON_DISCARD = modernIcon('<path d="M3 7v5h5"/><path d="M21 17a9 9 0 0 0-15-6.7L3 12"/>');
export const ICON_OPEN_FILE = modernIcon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14h7"/><path d="m13 11 3 3-3 3"/>');
export const ICON_CHEVRON_DOWN = modernIcon('<path d="m6 9 6 6 6-6"/>', { strokeWidth: 2.2 });
export const ICON_CHEVRON_RIGHT = modernIcon('<path d="m9 18 6-6-6-6"/>', { strokeWidth: 2.2 });
export const ICON_DROPDOWN = modernIcon('<path d="m7 10 5 5 5-5"/>', { strokeWidth: 2.1 });
export const ICON_CHECK = modernIcon('<path d="M20 6 9 17l-5-5"/>', { strokeWidth: 2.1 });
export const ICON_MERGE_EDITOR = modernIcon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v16"/><path d="M7 8h2"/><path d="M15 8h2"/><path d="M7 12h2"/><path d="M15 12h2"/><path d="M7 16h2"/><path d="M15 16h2"/>');
export const ICON_ACCEPT_OURS = modernIcon('<path d="M4 12h11"/><path d="m11 8 4 4-4 4"/><path d="M19 5v14"/>');
export const ICON_ACCEPT_THEIRS = modernIcon('<path d="M20 12H9"/><path d="m13 8-4 4 4 4"/><path d="M5 5v14"/>');
export const ICON_STASH_SAVE = modernIcon('<path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M4 12h16"/><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/>');
export const ICON_STASH_POP = modernIcon('<path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M4 12h16"/><path d="M12 15V5"/><path d="m8 9 4-4 4 4"/>');
export const ICON_STASH_APPLY = modernIcon('<path d="M5 19h14"/><path d="M12 5v10"/><path d="m8 11 4 4 4-4"/><path d="M7 5h10"/>');
export const ICON_TRASH = modernIcon('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6 18 20H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>');
export const ICON_FOLDER = iconifyIcon(defaultFolderIcon, 'folder', { className: 'folder-icon' });
export const ICON_FOLDER_OPEN = iconifyIcon(defaultFolderOpenedIcon, 'folder-opened', { className: 'folder-icon' });
export const ICON_FILE = iconifyIcon(defaultFileIcon, 'file', { className: 'file-icon' });

export const ICON_BRANCH = modernIcon('<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>', { className: 'tree-branch-icon', size: 14, strokeWidth: 2 });
export const ICON_BRANCH_FOLDER = iconifyIcon(defaultFolderIcon, 'folder', { className: 'tree-folder-icon', size: 14 });
export const ICON_TREE_CHEVRON_RIGHT = modernIcon('<path d="m9 18 6-6-6-6"/>', { className: 'tree-chevron-icon', size: 14, strokeWidth: 2.2 });
export const ICON_TREE_CHEVRON_DOWN = modernIcon('<path d="m6 9 6 6 6-6"/>', { className: 'tree-chevron-icon', size: 14, strokeWidth: 2.2 });
export const ICON_INCOMING_CHANGES = modernIcon('<path d="M18 6 6 18"/><path d="M6 18h8"/><path d="M6 18v-8"/>', { className: 'branch-incoming-icon', size: 14, strokeWidth: 2 });
// Submodule: nested repo (box inside box)
export const ICON_SUBMODULE = modernIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M12 7v10"/><path d="M7 12h10"/>');
// Worktree: two overlapping branch shapes
export const ICON_WORKTREE = modernIcon('<circle cx="7" cy="18" r="2"/><circle cx="7" cy="6" r="2"/><circle cx="17" cy="10" r="2"/><line x1="7" y1="8" x2="7" y2="16"/><path d="M7 8c0-2 2-4 4-4h2a4 4 0 0 1 4 4v2"/>',  { size: 14, strokeWidth: 1.8 });
export const ICON_LIST_VIEW = modernIcon('<path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>', { size: 14, strokeWidth: 2 });
export const ICON_TREE_VIEW = modernIcon('<path d="M6 4v6"/><path d="M6 10h6"/><path d="M12 10v4"/><path d="M12 14h6"/><path d="M12 18h6"/><circle cx="6" cy="4" r="1.5"/><circle cx="18" cy="14" r="1.5"/><circle cx="18" cy="18" r="1.5"/>', { size: 14, strokeWidth: 1.8 });

const FILE_ICON_DATA = {
    astro: fileTypeAstroIcon,
    binary: fileTypeBinaryIcon,
    c: fileTypeCIcon,
    config: fileTypeConfigIcon,
    cpp: fileTypeCppIcon,
    csharp: fileTypeCsharpIcon,
    css: fileTypeCssIcon,
    dart: fileTypeDartIcon,
    docker: fileTypeDockerIcon,
    dotenv: fileTypeDotenvIcon,
    editorconfig: fileTypeEditorconfigIcon,
    eslint: fileTypeEslintIcon,
    file: defaultFileIcon,
    git: fileTypeGitIcon,
    go: fileTypeGoIcon,
    graphql: fileTypeGraphqlIcon,
    html: fileTypeHtmlIcon,
    image: fileTypeImageIcon,
    java: fileTypeJavaIcon,
    javascript: fileTypeJavascriptIcon,
    jsconfig: fileTypeJsconfigIcon,
    json: fileTypeJsonIcon,
    kotlin: fileTypeKotlinIcon,
    less: fileTypeLessIcon,
    license: fileTypeLicenseIcon,
    log: fileTypeLogIcon,
    lua: fileTypeLuaIcon,
    markdown: fileTypeMarkdownIcon,
    npm: fileTypeNpmIcon,
    package: fileTypePackageIcon,
    pdf: fileTypePdfIcon,
    php: fileTypePhpIcon,
    pnpm: fileTypePnpmIcon,
    prettier: fileTypePrettierIcon,
    protobuf: fileTypeProtobufIcon,
    python: fileTypePythonIcon,
    reactjs: fileTypeReactjsIcon,
    reactts: fileTypeReacttsIcon,
    ruby: fileTypeRubyIcon,
    rust: fileTypeRustIcon,
    sass: fileTypeSassIcon,
    scss: fileTypeScssIcon,
    shell: fileTypeShellIcon,
    source: fileTypeSourceIcon,
    sql: fileTypeSqlIcon,
    svelte: fileTypeSvelteIcon,
    svg: fileTypeSvgIcon,
    swift: fileTypeSwiftIcon,
    terraform: fileTypeTerraformIcon,
    text: fileTypeTextIcon,
    toml: fileTypeTomlIcon,
    tsconfig: fileTypeTsconfigIcon,
    typescript: fileTypeTypescriptIcon,
    typescriptdef: fileTypeTypescriptDefIcon,
    vite: fileTypeViteIcon,
    vitest: fileTypeVitestIcon,
    vue: fileTypeVueIcon,
    wasm: fileTypeWasmIcon,
    webpack: fileTypeWebpackIcon,
    xml: fileTypeXmlIcon,
    yaml: fileTypeYamlIcon,
    yarn: fileTypeYarnIcon,
    zip: fileTypeZipIcon,
} as const satisfies Record<string, IconifyIcon>;

export type FileIconId = keyof typeof FILE_ICON_DATA;
export const FILE_ICON_IDS = Object.keys(FILE_ICON_DATA) as FileIconId[];

const EXTENSION_ICON_IDS: Readonly<Partial<Record<string, FileIconId>>> = {
    astro: 'astro',
    bash: 'shell',
    c: 'c',
    cc: 'cpp',
    cjs: 'javascript',
    conf: 'config',
    config: 'config',
    cpp: 'cpp',
    cs: 'csharp',
    css: 'css',
    cts: 'typescript',
    cxx: 'cpp',
    dart: 'dart',
    dockerfile: 'docker',
    env: 'dotenv',
    gif: 'image',
    go: 'go',
    gql: 'graphql',
    graphql: 'graphql',
    h: 'c',
    hpp: 'cpp',
    htm: 'html',
    html: 'html',
    ico: 'image',
    ini: 'config',
    java: 'java',
    jpeg: 'image',
    jpg: 'image',
    js: 'javascript',
    json: 'json',
    jsonc: 'json',
    jsx: 'reactjs',
    kt: 'kotlin',
    kts: 'kotlin',
    less: 'less',
    lock: 'text',
    log: 'log',
    lua: 'lua',
    md: 'markdown',
    mdx: 'markdown',
    mjs: 'javascript',
    mts: 'typescript',
    pdf: 'pdf',
    php: 'php',
    png: 'image',
    proto: 'protobuf',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    sass: 'sass',
    scss: 'scss',
    sh: 'shell',
    sql: 'sql',
    svg: 'svg',
    svelte: 'svelte',
    swift: 'swift',
    tf: 'terraform',
    tfvars: 'terraform',
    toml: 'toml',
    ts: 'typescript',
    tsx: 'reactts',
    txt: 'text',
    vue: 'vue',
    wasm: 'wasm',
    webp: 'image',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    zsh: 'shell',
};

const FILE_NAME_ICON_IDS = new Map<string, FileIconId>([
    ['.dockerignore', 'docker'],
    ['.editorconfig', 'editorconfig'],
    ['.gitattributes', 'git'],
    ['.gitignore', 'git'],
    ['.gitmodules', 'git'],
    ['compose.yaml', 'docker'],
    ['compose.yml', 'docker'],
    ['docker-compose.yaml', 'docker'],
    ['docker-compose.yml', 'docker'],
    ['dockerfile', 'docker'],
    ['makefile', 'source'],
    ['npm-shrinkwrap.json', 'npm'],
    ['package-lock.json', 'npm'],
    ['package.json', 'npm'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['vite.config.js', 'vite'],
    ['vite.config.mjs', 'vite'],
    ['vite.config.ts', 'vite'],
    ['vitest.config.js', 'vitest'],
    ['vitest.config.mjs', 'vitest'],
    ['vitest.config.ts', 'vitest'],
    ['webpack.config.js', 'webpack'],
    ['webpack.config.ts', 'webpack'],
    ['yarn.lock', 'yarn'],
]);

const SOURCE_EXTENSIONS = new Set([
    'ex', 'exs', 'fish', 'fs', 'pl', 'r', 'scala', 'wasm', 'zsh',
]);

const ZIP_EXTENSIONS = new Set(['7z', 'br', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'xz', 'zip']);
const BINARY_EXTENSIONS = new Set(['bin', 'dll', 'dmg', 'exe', 'o', 'obj', 'so']);

function getFileName(filePath: string): string {
    return filePath.split(/[\\/]/).pop() || '';
}

function getExtension(name: string): string {
    return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
}

function isReadmeFile(nameLower: string): boolean {
    return nameLower === 'readme' || nameLower.startsWith('readme.');
}

function isLicenseFile(nameLower: string): boolean {
    return nameLower === 'license'
        || nameLower === 'licence'
        || nameLower === 'copying'
        || nameLower === 'unlicense'
        || nameLower.startsWith('license.')
        || nameLower.startsWith('licence.')
        || nameLower.startsWith('copying.')
        || nameLower.startsWith('unlicense.');
}

export function getFileIconId(filePath: string): FileIconId {
    const name = getFileName(filePath);
    const nameLower = name.toLowerCase();

    if (nameLower.endsWith('.d.ts') || nameLower.endsWith('.d.cts') || nameLower.endsWith('.d.mts')) {
        return 'typescriptdef';
    }
    if (nameLower.startsWith('.env')) { return 'dotenv'; }
    if (nameLower.startsWith('.eslintrc') || nameLower.startsWith('eslint.config.')) { return 'eslint'; }
    if (nameLower.startsWith('.prettierrc') || nameLower.startsWith('prettier.config.')) { return 'prettier'; }
    if (nameLower.startsWith('tsconfig') && nameLower.endsWith('.json')) { return 'tsconfig'; }
    if (nameLower.startsWith('jsconfig') && nameLower.endsWith('.json')) { return 'jsconfig'; }
    if (isReadmeFile(nameLower)) { return 'markdown'; }
    if (isLicenseFile(nameLower)) { return 'license'; }

    const fileNameIcon = FILE_NAME_ICON_IDS.get(nameLower);
    if (fileNameIcon) { return fileNameIcon; }

    const ext = getExtension(name);
    const extensionIcon = EXTENSION_ICON_IDS[ext];
    if (extensionIcon) { return extensionIcon; }
    if (ZIP_EXTENSIONS.has(ext)) { return 'zip'; }
    if (BINARY_EXTENSIONS.has(ext)) { return 'binary'; }
    if (SOURCE_EXTENSIONS.has(ext)) { return 'source'; }
    return 'file';
}

export function renderFileTypeIcon(filePath: string): string {
    const iconId = getFileIconId(filePath);
    return iconifyIcon(FILE_ICON_DATA[iconId], iconId, { className: 'file-icon' });
}
