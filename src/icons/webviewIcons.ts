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

function lineIcon(path: string, options: LineIconOptions = {}, viewBox?: string): string {
    return `<svg ${attrs(options, viewBox)}><path d="${path}" stroke="currentColor" stroke-width="${options.strokeWidth ?? 1.4}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function folderIcon(options?: SvgIconOptions): string {
    return `<svg ${attrs(options)}><path d="M1.75 4.25A1.75 1.75 0 0 1 3.5 2.5h2.35c.46 0 .9.18 1.24.5l.84.75h4.57a1.75 1.75 0 0 1 1.75 1.75v6A1.75 1.75 0 0 1 12.5 13.25h-9a1.75 1.75 0 0 1-1.75-1.75V4.25zm1.5.25v7c0 .14.11.25.25.25h9a.25.25 0 0 0 .25-.25v-6a.25.25 0 0 0-.25-.25H7.35L6.08 4.1a.35.35 0 0 0-.23-.1H3.5a.25.25 0 0 0-.25.25z" fill="currentColor"/></svg>`;
}

export const ICON_PLUS = `<svg ${attrs()}><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`;
export const ICON_MINUS = `<svg ${attrs()}><path d="M3 8h10" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`;
export const ICON_DISCARD = lineIcon('M4.5 3L3 4.5M3 4.5L4.5 6M3 4.5h6a3.5 3.5 0 0 1 0 7H5');
export const ICON_OPEN_FILE = `<svg ${attrs()}><path d="M3 2h7l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M10 2v3h3" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>`;
export const ICON_CHEVRON_DOWN = lineIcon('M4 6l4 4 4-4');
export const ICON_CHEVRON_RIGHT = lineIcon('M6 4l4 4-4 4');
export const ICON_DROPDOWN = lineIcon('M5 7l3 3 3-3');
export const ICON_CHECK = `<svg ${attrs()}><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const ICON_MERGE_EDITOR = `<svg ${attrs()}><path d="M3 3v10M13 3v10M3 8h10" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`;
export const ICON_ACCEPT_OURS = `<svg ${attrs()}><path d="M2 8h9M8 5l3 3-3 3" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="13" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
export const ICON_ACCEPT_THEIRS = `<svg ${attrs()}><path d="M14 8H5M8 5L5 8l3 3" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="3" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
export const ICON_STASH_SAVE = `<svg ${attrs()}><rect x="2" y="9" width="12" height="4" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M8 2v6M5.5 5.5L8 8l2.5-2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
export const ICON_STASH_POP = lineIcon('M8 12V4M5 7l3-3 3 3');
export const ICON_STASH_APPLY = `<svg ${attrs()}><path d="M8 11V5M5.5 8l2.5-3 2.5 3" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 13h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
export const ICON_TRASH = lineIcon('M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M3 4h10M5 4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4');
export const ICON_FOLDER = folderIcon({ className: 'folder-icon' });
export const ICON_FOLDER_OPEN = ICON_FOLDER;
export const ICON_FILE = `<svg ${attrs({ className: 'file-icon' })}><path d="M4 1.5A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V6L10 1.5H4zm6 1.5 3 3h-2.5a.5.5 0 0 1-.5-.5V3z" fill="currentColor"/></svg>`;

export const ICON_BRANCH = `<svg ${attrs({ className: 'tree-branch-icon', size: 14 })} fill="none"><path d="M4 3v5a3 3 0 0 0 3 3h5M4 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
export const ICON_BRANCH_FOLDER = folderIcon({ className: 'tree-folder-icon', size: 14 });
export const ICON_TREE_CHEVRON_RIGHT = lineIcon('M6 4.25 9.75 8 6 11.75', { className: 'tree-chevron-icon', size: 14 });
export const ICON_TREE_CHEVRON_DOWN = lineIcon('M4.25 6 8 9.75 11.75 6', { className: 'tree-chevron-icon', size: 14 });
export const ICON_INCOMING_CHANGES = `<svg ${attrs({ className: 'branch-incoming-icon', size: 14 }, '0 0 24 24')} fill="none"><path d="M18 6L6 18M6 18L6 9M6 18L15 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const ICON_LIST_VIEW = `<svg ${attrs({ size: 14 })}><path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
export const ICON_TREE_VIEW = `<svg ${attrs({ size: 14 })}><path d="M4 3v3.5M4 6.5h3M7 6.5v3M7 9.5h5M7 12.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="3" r="1" fill="currentColor"/><circle cx="12" cy="9.5" r="1" fill="currentColor"/><circle cx="12" cy="12.5" r="1" fill="currentColor"/></svg>`;

const FILE_ICON_MAP: Record<string, FileIconInfo> = {
    ts: { color: '#3178c6', letter: 'TS' },
    tsx: { color: '#3178c6', letter: 'TX' },
    js: { color: '#f1e05a', letter: 'JS' },
    jsx: { color: '#f1e05a', letter: 'JX' },
    json: { color: '#a8b34b', letter: '{}' },
    css: { color: '#563d7c', letter: '#' },
    scss: { color: '#c6538c', letter: '#' },
    less: { color: '#1d365d', letter: '#' },
    html: { color: '#e34c26', letter: '<>' },
    md: { color: '#519aba', letter: 'M' },
    py: { color: '#3572a5', letter: 'Py' },
    rb: { color: '#cc342d', letter: 'Rb' },
    go: { color: '#00add8', letter: 'Go' },
    rs: { color: '#dea584', letter: 'Rs' },
    java: { color: '#b07219', letter: 'J' },
    kt: { color: '#a97bff', letter: 'Kt' },
    swift: { color: '#f05138', letter: 'Sw' },
    c: { color: '#555555', letter: 'C' },
    cpp: { color: '#f34b7d', letter: 'C+' },
    h: { color: '#555555', letter: 'H' },
    cs: { color: '#178600', letter: 'C#' },
    php: { color: '#4f5d95', letter: 'P' },
    sh: { color: '#89e051', letter: '$' },
    bash: { color: '#89e051', letter: '$' },
    yml: { color: '#cb171e', letter: 'Y' },
    yaml: { color: '#cb171e', letter: 'Y' },
    toml: { color: '#9c4221', letter: 'T' },
    xml: { color: '#e34c26', letter: '<>' },
    svg: { color: '#ffb13b', letter: 'Sv' },
    png: { color: '#a074c4', letter: 'Im' },
    jpg: { color: '#a074c4', letter: 'Im' },
    jpeg: { color: '#a074c4', letter: 'Im' },
    gif: { color: '#a074c4', letter: 'Im' },
    sql: { color: '#e38c00', letter: 'Sq' },
    graphql: { color: '#e10098', letter: 'Gq' },
    vue: { color: '#41b883', letter: 'V' },
    svelte: { color: '#ff3e00', letter: 'Sv' },
    lock: { color: '#6a737d', letter: 'Lk' },
    env: { color: '#6a737d', letter: 'Ev' },
    gitignore: { color: '#6a737d', letter: 'Gi' },
    dockerfile: { color: '#384d54', letter: 'Dk' },
    makefile: { color: '#427819', letter: 'Mk' },
};

const DEFAULT_FILE_ICON: FileIconInfo = { color: '#6a737d', letter: 'F' };

export function getFileIconInfo(filePath: string): FileIconInfo {
    const name = filePath.split('/').pop() || '';
    const nameLower = name.toLowerCase();

    if (nameLower === 'dockerfile') { return FILE_ICON_MAP.dockerfile; }
    if (nameLower === 'makefile') { return FILE_ICON_MAP.makefile; }
    if (nameLower.startsWith('.env')) { return FILE_ICON_MAP.env; }
    if (nameLower === '.gitignore') { return FILE_ICON_MAP.gitignore; }

    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
    return FILE_ICON_MAP[ext] ?? DEFAULT_FILE_ICON;
}

export function renderFileTypeIcon(filePath: string): string {
    const info = getFileIconInfo(filePath);
    return `<svg ${attrs({ className: 'file-icon' })}>
        <rect x="2" y="1" width="12" height="14" rx="1.5" fill="${info.color}" opacity="0.15" stroke="${info.color}" stroke-width="0.5"/>
        <text x="8" y="10.5" text-anchor="middle" font-size="6" font-weight="600" fill="${info.color}">${info.letter}</text>
    </svg>`;
}
