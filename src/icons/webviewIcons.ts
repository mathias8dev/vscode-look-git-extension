type SvgIconOptions = {
    className?: string;
    size?: number;
    ariaHidden?: boolean;
};

type FileIconInfo = {
    color: string;
    letter: string;
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

function folderIcon(options?: SvgIconOptions): string {
    return modernIcon('<path d="M3 7.75A2.75 2.75 0 0 1 5.75 5h4.2l2 2.25h6.3A2.75 2.75 0 0 1 21 10v6.25A2.75 2.75 0 0 1 18.25 19H5.75A2.75 2.75 0 0 1 3 16.25z"/><path d="M3.4 8h7.7"/>', { ...options, strokeWidth: 1.7 });
}

function escapeSvgText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
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
export const ICON_FOLDER = folderIcon({ className: 'folder-icon' });
export const ICON_FOLDER_OPEN = ICON_FOLDER;
export const ICON_FILE = modernIcon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>', { className: 'file-icon', strokeWidth: 1.7 });

export const ICON_BRANCH = modernIcon('<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>', { className: 'tree-branch-icon', size: 14, strokeWidth: 2 });
export const ICON_BRANCH_FOLDER = folderIcon({ className: 'tree-folder-icon', size: 14 });
export const ICON_TREE_CHEVRON_RIGHT = modernIcon('<path d="m9 18 6-6-6-6"/>', { className: 'tree-chevron-icon', size: 14, strokeWidth: 2.2 });
export const ICON_TREE_CHEVRON_DOWN = modernIcon('<path d="m6 9 6 6 6-6"/>', { className: 'tree-chevron-icon', size: 14, strokeWidth: 2.2 });
export const ICON_INCOMING_CHANGES = modernIcon('<path d="M18 6 6 18"/><path d="M6 18h8"/><path d="M6 18v-8"/>', { className: 'branch-incoming-icon', size: 14, strokeWidth: 2 });
export const ICON_LIST_VIEW = modernIcon('<path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>', { size: 14, strokeWidth: 2 });
export const ICON_TREE_VIEW = modernIcon('<path d="M6 4v6"/><path d="M6 10h6"/><path d="M12 10v4"/><path d="M12 14h6"/><path d="M12 18h6"/><circle cx="6" cy="4" r="1.5"/><circle cx="18" cy="14" r="1.5"/><circle cx="18" cy="18" r="1.5"/>', { size: 14, strokeWidth: 1.8 });

const FILE_ICON_MAP: Record<string, FileIconInfo> = {
    ts: { color: '#3178c6', letter: 'TS' },
    tsx: { color: '#3178c6', letter: 'TX' },
    js: { color: '#f1e05a', letter: 'JS' },
    jsx: { color: '#f1e05a', letter: 'JX' },
    mjs: { color: '#f1e05a', letter: 'JS' },
    cjs: { color: '#f1e05a', letter: 'JS' },
    mts: { color: '#3178c6', letter: 'TS' },
    cts: { color: '#3178c6', letter: 'TS' },
    json: { color: '#a8b34b', letter: '{}' },
    jsonc: { color: '#a8b34b', letter: '{}' },
    css: { color: '#563d7c', letter: '#' },
    scss: { color: '#c6538c', letter: '#' },
    sass: { color: '#c6538c', letter: '#' },
    less: { color: '#1d365d', letter: '#' },
    html: { color: '#e34c26', letter: '<>' },
    htm: { color: '#e34c26', letter: '<>' },
    md: { color: '#519aba', letter: 'M' },
    mdx: { color: '#519aba', letter: 'MX' },
    py: { color: '#3572a5', letter: 'Py' },
    ipynb: { color: '#f37626', letter: 'Nb' },
    rb: { color: '#cc342d', letter: 'Rb' },
    go: { color: '#00add8', letter: 'Go' },
    rs: { color: '#dea584', letter: 'Rs' },
    java: { color: '#b07219', letter: 'J' },
    kt: { color: '#a97bff', letter: 'Kt' },
    kts: { color: '#a97bff', letter: 'Kt' },
    swift: { color: '#f05138', letter: 'Sw' },
    c: { color: '#555555', letter: 'C' },
    cpp: { color: '#f34b7d', letter: 'C+' },
    cxx: { color: '#f34b7d', letter: 'C+' },
    cc: { color: '#f34b7d', letter: 'C+' },
    h: { color: '#555555', letter: 'H' },
    hpp: { color: '#f34b7d', letter: 'H+' },
    cs: { color: '#178600', letter: 'C#' },
    fs: { color: '#378bba', letter: 'F#' },
    php: { color: '#4f5d95', letter: 'P' },
    ex: { color: '#6e4a7e', letter: 'Ex' },
    exs: { color: '#6e4a7e', letter: 'Ex' },
    dart: { color: '#00b4ab', letter: 'Da' },
    scala: { color: '#dc322f', letter: 'Sc' },
    r: { color: '#198ce7', letter: 'R' },
    lua: { color: '#000080', letter: 'Lu' },
    pl: { color: '#0298c3', letter: 'Pl' },
    sh: { color: '#89e051', letter: '$' },
    bash: { color: '#89e051', letter: '$' },
    zsh: { color: '#89e051', letter: '$' },
    fish: { color: '#89e051', letter: '$' },
    ps1: { color: '#012456', letter: 'PS' },
    yml: { color: '#cb171e', letter: 'Y' },
    yaml: { color: '#cb171e', letter: 'Y' },
    toml: { color: '#9c4221', letter: 'T' },
    ini: { color: '#6a737d', letter: 'In' },
    conf: { color: '#6a737d', letter: 'Cf' },
    config: { color: '#6a737d', letter: 'Cf' },
    xml: { color: '#e34c26', letter: '<>' },
    svg: { color: '#ffb13b', letter: 'Sv' },
    png: { color: '#a074c4', letter: 'Im' },
    jpg: { color: '#a074c4', letter: 'Im' },
    jpeg: { color: '#a074c4', letter: 'Im' },
    gif: { color: '#a074c4', letter: 'Im' },
    webp: { color: '#a074c4', letter: 'Im' },
    avif: { color: '#a074c4', letter: 'Im' },
    ico: { color: '#a074c4', letter: 'Ic' },
    pdf: { color: '#d73a49', letter: 'Pdf' },
    zip: { color: '#6f42c1', letter: 'Zip' },
    gz: { color: '#6f42c1', letter: 'Gz' },
    tar: { color: '#6f42c1', letter: 'Tar' },
    sql: { color: '#e38c00', letter: 'Sq' },
    graphql: { color: '#e10098', letter: 'Gq' },
    gql: { color: '#e10098', letter: 'Gq' },
    vue: { color: '#41b883', letter: 'V' },
    svelte: { color: '#ff3e00', letter: 'Sv' },
    astro: { color: '#ff5d01', letter: 'As' },
    wasm: { color: '#654ff0', letter: 'Wa' },
    proto: { color: '#336791', letter: 'Pr' },
    lock: { color: '#6a737d', letter: 'Lk' },
    env: { color: '#6a737d', letter: 'Ev' },
    gitignore: { color: '#6a737d', letter: 'Gi' },
    dockerfile: { color: '#384d54', letter: 'Dk' },
    makefile: { color: '#427819', letter: 'Mk' },
};

const FILE_NAME_ICON_MAP: Record<string, FileIconInfo> = {
    '.dockerignore': { color: '#2496ed', letter: 'Dk' },
    '.editorconfig': { color: '#6a737d', letter: 'Ed' },
    '.eslintrc': { color: '#4b32c3', letter: 'Es' },
    '.gitignore': FILE_ICON_MAP.gitignore,
    '.prettierrc': { color: '#f7b93e', letter: 'Pr' },
    'compose.yml': { color: '#2496ed', letter: 'Dk' },
    'compose.yaml': { color: '#2496ed', letter: 'Dk' },
    'docker-compose.yml': { color: '#2496ed', letter: 'Dk' },
    'docker-compose.yaml': { color: '#2496ed', letter: 'Dk' },
    'dockerfile': FILE_ICON_MAP.dockerfile,
    'eslint.config.js': { color: '#4b32c3', letter: 'Es' },
    'eslint.config.mjs': { color: '#4b32c3', letter: 'Es' },
    'license': { color: '#d4a72c', letter: 'Li' },
    'makefile': FILE_ICON_MAP.makefile,
    'package-lock.json': { color: '#cb3837', letter: 'Npm' },
    'package.json': { color: '#cb3837', letter: 'Npm' },
    'pnpm-lock.yaml': { color: '#f69220', letter: 'Pn' },
    'readme': FILE_ICON_MAP.md,
    'tsconfig.json': { color: '#3178c6', letter: 'TS' },
    'vite.config.js': { color: '#646cff', letter: 'Vi' },
    'vite.config.mjs': { color: '#646cff', letter: 'Vi' },
    'vite.config.ts': { color: '#646cff', letter: 'Vi' },
    'webpack.config.js': { color: '#1c78c0', letter: 'Wp' },
    'webpack.config.ts': { color: '#1c78c0', letter: 'Wp' },
    'yarn.lock': { color: '#2c8ebb', letter: 'Yn' },
};

const DEFAULT_FILE_ICON: FileIconInfo = { color: '#6a737d', letter: 'F' };

export function getFileIconInfo(filePath: string): FileIconInfo {
    const name = filePath.split('/').pop() || '';
    const nameLower = name.toLowerCase();

    if (FILE_NAME_ICON_MAP[nameLower]) { return FILE_NAME_ICON_MAP[nameLower]; }
    if (nameLower.startsWith('.env')) { return FILE_ICON_MAP.env; }
    if (nameLower.startsWith('.eslintrc')) { return FILE_NAME_ICON_MAP['.eslintrc']; }
    if (nameLower.startsWith('.prettierrc')) { return FILE_NAME_ICON_MAP['.prettierrc']; }
    if (nameLower.startsWith('readme.')) { return FILE_ICON_MAP.md; }
    if (nameLower.startsWith('license.')) { return FILE_NAME_ICON_MAP.license; }

    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
    return FILE_ICON_MAP[ext] ?? DEFAULT_FILE_ICON;
}

export function renderFileTypeIcon(filePath: string): string {
    const info = getFileIconInfo(filePath);
    const fontSize = info.letter.length > 2 ? 5.6 : 7;
    return `<svg ${attrs({ className: 'file-icon' }, '0 0 24 24')}>
        <path d="M6 2.75h8l4 4v14.5H6z" fill="${info.color}" opacity="0.12"/>
        <path d="M6 2.75h8l4 4v14.5H6z" fill="none" stroke="${info.color}" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M14 2.75v4h4" fill="none" stroke="${info.color}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="12" y="16" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="${info.color}">${escapeSvgText(info.letter)}</text>
    </svg>`;
}
