#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const defaultOutputPath = path.join(repoRoot, 'artifacts', 'icon-preview.html');

function parseArgs(argv) {
    const args = { outputPath: defaultOutputPath };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if ((arg === '--out' || arg === '-o') && argv[i + 1]) {
            args.outputPath = path.resolve(repoRoot, argv[i + 1]);
            i += 1;
        } else if (arg === '--help' || arg === '-h') {
            args.help = true;
        }
    }

    return args;
}

function printHelp() {
    console.log([
        'Generate a standalone HTML preview for Look Git icons.',
        '',
        'Usage:',
        '  npm run preview:icons',
        '  npm run preview:icons -- --out artifacts/custom-icon-preview.html',
    ].join('\n'));
}

function loadTypeScriptModule(filePath, stubs = {}) {
    const source = fs.readFileSync(filePath, 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: filePath,
    });

    const module = { exports: {} };
    const sandbox = {
        console,
        exports: module.exports,
        module,
        require(id) {
            if (Object.prototype.hasOwnProperty.call(stubs, id)) {
                return stubs[id];
            }

            return require(id);
        },
    };

    vm.runInNewContext(compiled.outputText, sandbox, { filename: filePath });
    return module.exports;
}

function createVscodeStub() {
    class ThemeColor {
        constructor(id) {
            this.id = id;
        }
    }

    class ThemeIcon {
        constructor(id, color) {
            this.id = id;
            this.color = color;
        }
    }

    ThemeIcon.File = { id: 'file' };
    ThemeIcon.Folder = { id: 'folder' };

    return { ThemeColor, ThemeIcon };
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function toTitle(name) {
    return name
        .replace(/^ICON_/, '')
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function renderIconStages(icon, extraClass = '') {
    return `<div class="icon-stages${extraClass ? ` ${extraClass}` : ''}">
        <div class="icon-stage icon-stage-dark">${icon}</div>
        <div class="icon-stage icon-stage-light">${icon}</div>
    </div>`;
}

function renderIconCard(label, icon, meta = '') {
    return `<article class="icon-card">
        ${renderIconStages(icon)}
        <div class="icon-name">${escapeHtml(label)}</div>
        ${meta ? `<div class="icon-meta">${escapeHtml(meta)}</div>` : ''}
    </article>`;
}

function codiconSvg(name) {
    const baseName = name.replace(/~.+$/, '');
    const attrs = 'width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
    const icons = {
        'arrow-down': `<svg ${attrs}><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
        'arrow-up': `<svg ${attrs}><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`,
        'cloud-download': `<svg ${attrs}><path d="M12 13v8"/><path d="m8 17 4 4 4-4"/><path d="M20.4 16.5A5 5 0 0 0 18 7h-1.3A7 7 0 1 0 5.1 14.6"/></svg>`,
        ellipsis: `<svg ${attrs}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>`,
        'git-branch': `<svg ${attrs}><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
        'git-commit': `<svg ${attrs}><circle cx="12" cy="12" r="3.5"/><path d="M3 12h5.5"/><path d="M15.5 12H21"/></svg>`,
        refresh: `<svg ${attrs}><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.4 5.6L21 8"/><path d="M21 3v5h-5"/></svg>`,
        sync: `<svg ${attrs} class="spin-icon"><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.4 5.6L21 8"/><path d="M21 3v5h-5"/></svg>`,
    };

    return icons[baseName] || `<span class="missing-icon">$(${escapeHtml(name)})</span>`;
}

function renderCodiconCard(label, codicon) {
    return `<article class="icon-card codicon-card">
        ${renderIconStages(codiconSvg(codicon), 'codicon-stage')}
        <div class="icon-name">${escapeHtml(label)}</div>
        <div class="icon-meta">VS Code codicon</div>
    </article>`;
}

function collectContributedIcons(manifest) {
    const resourceIcons = new Set();
    const codicons = new Map();

    function visit(value, key = '') {
        if (key === 'icon' && typeof value === 'string') {
            const codiconMatch = value.match(/^\$\(([^)]+)\)$/);

            if (codiconMatch) {
                codicons.set(codiconMatch[1], value);
            } else {
                resourceIcons.add(value);
            }

            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => visit(item));
            return;
        }

        if (value && typeof value === 'object') {
            Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey));
        }
    }

    visit(manifest.contributes);
    return { resourceIcons: [...resourceIcons].sort(), codicons: [...codicons.entries()].sort() };
}

function readResourceIcon(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);

    if (!fs.existsSync(absolutePath)) {
        return `<span class="missing-icon">Missing</span>`;
    }

    return fs.readFileSync(absolutePath, 'utf8');
}

function renderSection(title, subtitle, cards) {
    if (cards.length === 0) {
        return '';
    }

    return `<section class="preview-section">
        <div class="section-heading">
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="icon-grid">${cards.join('\n')}</div>
    </section>`;
}

function buildPreviewHtml({ webviewIcons, fileTypeIcons, codicons, resourceIcons, outputPath }) {
    const generatedAt = new Date().toISOString();

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Look Git Icon Preview</title>
    <style>
        :root {
            color-scheme: dark light;
            --bg: #1e1e1e;
            --panel: #252526;
            --panel-border: #3c3c3c;
            --text: #cccccc;
            --muted: #8f8f8f;
            --accent: #4fc1ff;
            --shadow: rgba(0, 0, 0, 0.22);
            --stage-dark: #141414;
            --stage-dark-text: #f3f3f3;
            --stage-light: #f8f8f8;
            --stage-light-text: #242424;
        }

        @media (prefers-color-scheme: light) {
            :root {
                --bg: #f3f3f3;
                --panel: #ffffff;
                --panel-border: #d6d6d6;
                --text: #1f1f1f;
                --muted: #656565;
                --accent: #007acc;
                --shadow: rgba(0, 0, 0, 0.08);
            }
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-width: 320px;
            background: var(--bg);
            color: var(--text);
            font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        main {
            width: min(1180px, calc(100% - 32px));
            margin: 0 auto;
            padding: 28px 0 44px;
        }

        header {
            display: flex;
            flex-wrap: wrap;
            gap: 12px 24px;
            align-items: end;
            justify-content: space-between;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--panel-border);
        }

        h1,
        h2,
        p {
            margin: 0;
        }

        h1 {
            font-size: 24px;
            font-weight: 650;
        }

        h2 {
            font-size: 16px;
            font-weight: 650;
        }

        .header-meta,
        .header-subtitle,
        .section-heading p,
        .icon-meta {
            color: var(--muted);
        }

        .header-meta {
            text-align: right;
            font-size: 12px;
        }

        .preview-section {
            margin-top: 28px;
        }

        .section-heading {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 16px;
            align-items: baseline;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .icon-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
            gap: 12px;
        }

        .icon-card {
            display: grid;
            grid-template-rows: 58px auto auto;
            gap: 8px;
            min-width: 0;
            padding: 12px;
            border: 1px solid var(--panel-border);
            border-radius: 6px;
            background: var(--panel);
            box-shadow: 0 1px 2px var(--shadow);
        }

        .icon-stages {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            min-width: 0;
        }

        .icon-stage {
            display: grid;
            place-items: center;
            min-width: 0;
            border: 1px solid var(--panel-border);
            border-radius: 4px;
        }

        .icon-stage-dark {
            background: var(--stage-dark);
            color: var(--stage-dark-text);
        }

        .icon-stage-light {
            background: var(--stage-light);
            color: var(--stage-light-text);
        }

        .icon-stage svg {
            width: 30px;
            height: 30px;
            flex: 0 0 auto;
        }

        .icon-name,
        .icon-meta {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .icon-name {
            font-weight: 600;
        }

        .icon-meta {
            font-size: 11px;
        }

        .codicon-stage {
            color: var(--accent);
        }

        .spin-icon {
            animation: spin 1.4s linear infinite;
            transform-origin: center;
        }

        .missing-icon {
            color: #f48771;
            font-size: 12px;
            font-weight: 600;
        }

        @keyframes spin {
            to {
                transform: rotate(360deg);
            }
        }
    </style>
</head>
<body>
    <main>
        <header>
            <div>
                <h1>Look Git Icon Preview</h1>
                <p class="header-subtitle">Generated from the current local icon modules.</p>
            </div>
            <p class="header-meta">
                ${escapeHtml(path.relative(repoRoot, outputPath))}<br>
                ${escapeHtml(generatedAt)}
            </p>
        </header>

        ${renderSection('Webview Icons', 'SVG constants exported from src/icons/webviewIcons.ts.', webviewIcons)}
        ${renderSection('Generated File Icons', 'Sample outputs from renderFileTypeIcon(filePath).', fileTypeIcons)}
        ${renderSection('Resource Icons', 'SVG files referenced by package.json contributions.', resourceIcons)}
        ${renderSection('Codicons', 'Icon names contributed to VS Code through package.json or src/icons/vscodeIcons.ts.', codicons)}
    </main>
</body>
</html>`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        printHelp();
        return;
    }

    const webviewModule = loadTypeScriptModule(path.join(repoRoot, 'src/icons/webviewIcons.ts'));
    const vscodeModule = loadTypeScriptModule(path.join(repoRoot, 'src/icons/vscodeIcons.ts'), {
        vscode: createVscodeStub(),
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const contributedIcons = collectContributedIcons(manifest);

    const webviewIcons = Object.entries(webviewModule)
        .filter(([name, value]) => name.startsWith('ICON_') && typeof value === 'string')
        .map(([name, icon]) => renderIconCard(toTitle(name), icon, name));

    const fileSamples = [
        'src/extension.ts',
        'src/webview/graph.ts',
        'src/App.vue',
        'src/routes/+page.svelte',
        'src/pages/index.astro',
        'notebooks/analysis.ipynb',
        'server/main.go',
        'server/lib.rs',
        'server/app.py',
        'server/api.graphql',
        'android/MainActivity.kt',
        'ios/AppDelegate.swift',
        'lib/main.dart',
        'scripts/deploy.sh',
        'scripts/task.ps1',
        'package.json',
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        'tsconfig.json',
        'vite.config.ts',
        'eslint.config.mjs',
        '.prettierrc',
        'README.md',
        'LICENSE',
        'index.html',
        'styles.css',
        'theme.scss',
        'Dockerfile',
        'docker-compose.yml',
        '.env.local',
        'image.svg',
        'photo.webp',
        'archive.zip',
        'docs/spec.pdf',
        'archive.unknown',
    ];
    const fileTypeIcons = fileSamples.map((sample) => renderIconCard(sample, webviewModule.renderFileTypeIcon(sample), 'file type'));

    const codiconNames = new Set([
        ...Object.values(vscodeModule.CODICON || {}),
        ...contributedIcons.codicons.map(([name]) => name),
    ]);
    const codicons = [...codiconNames].sort().map((name) => renderCodiconCard(name, name));

    const resourceIcons = contributedIcons.resourceIcons.map((relativePath) => {
        return renderIconCard(relativePath, readResourceIcon(relativePath), 'package resource');
    });

    const html = buildPreviewHtml({
        webviewIcons,
        fileTypeIcons,
        codicons,
        resourceIcons,
        outputPath: args.outputPath,
    });

    fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
    fs.writeFileSync(args.outputPath, html);
    console.log(`Icon preview written to ${path.relative(repoRoot, args.outputPath)}`);
}

main();
