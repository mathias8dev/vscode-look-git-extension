const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repoRoot, 'src', 'webview');
const outputPath = path.resolve(repoRoot, process.argv[2] ?? path.join('artifacts', 'icon-gallery.html'));
const vscodeIconsPath = path.join(repoRoot, 'node_modules', '@iconify', 'icons-vscode-icons');
const vscodeIconCatalogPath = path.join(sourceRoot, 'shared', 'vscode-icon-catalog.generated.ts');
const fileIconModelPath = path.join(sourceRoot, 'shared', 'file-icon-model.ts');
const codiconCssPath = path.join(repoRoot, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
const codiconFontPath = path.join(repoRoot, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf');

const iconifyImportPattern = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"](@iconify\/icons-vscode-icons\/[^'"]+)['"];?/g;
const codiconClassPattern = /codicon-([a-z0-9]+(?:-[a-z0-9]+)*)/g;
const codiconIconPropPattern = /\bicon=["']([a-z0-9]+(?:-[a-z0-9]+)*)["']/g;
const codiconIconFieldPattern = /\bicon:\s*['"]([a-z0-9]+(?:-[a-z0-9]+)*)['"]/g;
const codiconNameUnionPattern = /\|\s*['"]([a-z0-9]+(?:-[a-z0-9]+)*)['"]/g;
const codiconCssIconPattern = /\.codicon-([a-z0-9]+(?:-[a-z0-9]+)*):before\s*\{/g;

function main() {
    const files = sourceFiles(sourceRoot);
    const fileTypeIcons = collectFileTypeIcons();
    const catalogModules = new Set(fileTypeIcons.map((entry) => entry.moduleName));
    const iconifyIcons = collectIconifyIcons(files).filter((entry) => !catalogModules.has(entry.moduleName));
    const codiconCss = readCodiconCss();
    const codicons = collectCodicons(files, availableCodicons(codiconCss));

    if (fileTypeIcons.length === 0 && iconifyIcons.length === 0 && codicons.length === 0) {
        throw new Error('No icons found under src/webview.');
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, renderHtml({ fileTypeIcons, iconifyIcons, codicons, codiconCss }), 'utf8');
    console.log(`Generated ${path.relative(repoRoot, outputPath)} with ${fileTypeIcons.length} file type icons, ${iconifyIcons.length} Iconify icons, and ${codicons.length} codicons.`);
}

function sourceFiles(root) {
    const result = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            result.push(...sourceFiles(fullPath));
            continue;
        }
        if (/\.(ts|tsx)$/.test(entry.name)) {
            result.push(fullPath);
        }
    }
    return result;
}

function collectFileTypeIcons() {
    const matchesByIcon = collectFileTypeMatches();
    return fs.readdirSync(vscodeIconsPath)
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((fileName) => {
            const kind = fileName.slice(0, -3);
            const moduleName = `@iconify/icons-vscode-icons/${kind}`;
            return {
                kind,
                moduleName,
                alias: kind,
                icon: loadIconifyIcon(moduleName),
                matches: [...(matchesByIcon.get(kind) ?? [])].sort((left, right) => left.localeCompare(right)),
                sources: [sourceEntry(path.join(vscodeIconsPath, fileName), kind)],
            };
        });
}

function collectFileTypeMatches() {
    const extensionIcons = new Map([
        ...stringRecord(fileIconModelPath, 'fallbackExtensionIcons'),
        ...stringRecord(vscodeIconCatalogPath, 'languageExtensionIcons'),
        ...stringRecord(vscodeIconCatalogPath, 'fileExtensionIcons'),
        ...stringRecord(fileIconModelPath, 'extensionIconOverrides'),
    ]);
    const matchesByIcon = new Map();
    for (const [extension, icon] of extensionIcons) {
        const matches = matchesByIcon.get(icon) ?? new Set();
        matches.add(`.${extension}`);
        matchesByIcon.set(icon, matches);
    }
    return matchesByIcon;
}

function stringRecord(filePath, variableName) {
    const source = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    let declaration;
    source.forEachChild(function visit(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName) {
            declaration = node;
            return;
        }
        node.forEachChild(visit);
    });
    const initializer = unwrapExpression(declaration?.initializer);
    if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
        throw new Error(`Unable to read ${variableName} from ${path.relative(repoRoot, filePath)}.`);
    }

    const entries = [];
    for (const property of initializer.properties) {
        if (!ts.isPropertyAssignment(property)) { continue; }
        const name = propertyName(property.name);
        const value = unwrapExpression(property.initializer);
        if (name !== undefined && value && ts.isStringLiteralLike(value)) {
            entries.push([name, value.text]);
        }
    }
    return entries;
}

function unwrapExpression(expression) {
    let current = expression;
    while (current && (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current))) {
        current = current.expression;
    }
    return current;
}

function propertyName(name) {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }
    return undefined;
}

function collectIconifyIcons(files) {
    const byModule = new Map();

    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        for (const [alias, moduleName] of iconifyImports(source)) {
            const icon = loadIconifyIcon(moduleName);
            const existing = byModule.get(moduleName);
            if (existing) {
                existing.sources.push(sourceEntry(file, alias));
                continue;
            }
            byModule.set(moduleName, {
                alias,
                moduleName,
                icon,
                sources: [sourceEntry(file, alias)],
            });
        }
    }

    return [...byModule.values()].sort((a, b) => a.moduleName.localeCompare(b.moduleName));
}

function iconifyImports(source) {
    const imports = new Map();
    for (const match of source.matchAll(iconifyImportPattern)) {
        imports.set(match[1], match[2]);
    }
    return imports;
}

function collectCodicons(files, validNames) {
    const byName = new Map();

    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        collectCodiconMatches(byName, validNames, source.matchAll(codiconClassPattern), file, 'class');
        collectCodiconMatches(byName, validNames, source.matchAll(codiconIconPropPattern), file, 'icon prop');
        collectCodiconMatches(byName, validNames, source.matchAll(codiconIconFieldPattern), file, 'icon field');
        if (path.basename(file) === 'Codicon.tsx') {
            collectCodiconMatches(byName, validNames, source.matchAll(codiconNameUnionPattern), file, 'CodiconName');
        }
    }

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function collectCodiconMatches(byName, validNames, matches, file, label) {
    for (const match of matches) {
        const name = match[1];
        if (!validNames.has(name)) {
            continue;
        }
        const existing = byName.get(name);
        if (existing) {
            existing.sources.push(sourceEntry(file, label));
            continue;
        }
        byName.set(name, {
            name,
            sources: [sourceEntry(file, label)],
        });
    }
}

function loadIconifyIcon(moduleName) {
    const loaded = require(moduleName);
    return loaded.default ?? loaded;
}

function readCodiconCss() {
    const css = fs.readFileSync(codiconCssPath, 'utf8');
    const font = fs.readFileSync(codiconFontPath).toString('base64');
    return css.replace(/src:\s*url\("[^"]+"\)\s*format\("truetype"\);/, `src: url("data:font/truetype;base64,${font}") format("truetype");`);
}

function availableCodicons(css) {
    return new Set([...css.matchAll(codiconCssIconPattern)].map((match) => match[1]));
}

function sourceEntry(file, label) {
    return {
        label,
        file: path.relative(repoRoot, file).split(path.sep).join('/'),
    };
}

function renderHtml({ fileTypeIcons, iconifyIcons, codicons, codiconCss }) {
    const generatedAt = new Date().toISOString();
    const fileTypeCards = fileTypeIcons.map((entry) => fileTypeCard(entry)).join('\n');
    const iconifyCards = iconifyIcons.map((entry) => iconifyCard(entry)).join('\n');
    const codiconCards = codicons.map((entry) => codiconCard(entry)).join('\n');
    const totalCount = fileTypeIcons.length + iconifyIcons.length + codicons.length;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Look Git Icon Gallery</title>
  <style>
${codiconCss}
    :root {
      color-scheme: dark;
      --bg: #1e1e1e;
      --panel: #252526;
      --border: #3c3c3c;
      --text: #cccccc;
      --muted: #8f8f8f;
      --accent: #3794ff;
      --input: #3c3c3c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: grid;
      gap: 10px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      background: rgba(30, 30, 30, 0.96);
    }
    h1 {
      margin: 0 0 4px;
      font-size: 1.2em;
      font-weight: 600;
    }
    .summary {
      margin: 0;
      color: var(--muted);
      font-size: 0.9em;
    }
    .search-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .search-input {
      width: min(520px, 100%);
      padding: 7px 9px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--input);
      color: var(--text);
      font: inherit;
    }
    .result-count {
      color: var(--muted);
      font-size: 0.85em;
      white-space: nowrap;
    }
    section {
      padding: 16px;
    }
    section + section {
      border-top: 1px solid var(--border);
    }
    h2 {
      margin: 0 0 12px;
      font-size: 1em;
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 10px;
    }
    .icon-card {
      min-width: 0;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--panel);
    }
    .icon-card[hidden],
    section[hidden] {
      display: none;
    }
    .icon {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
    }
    .icon svg {
      width: 32px;
      height: 32px;
      display: block;
    }
    .codicon-preview .codicon {
      width: 32px;
      height: 32px;
      font-size: 24px;
      line-height: 32px;
    }
    .meta {
      min-width: 0;
    }
    .name,
    .source,
    .matches {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .name {
      color: var(--text);
      font-size: 0.92em;
    }
    .source,
    .matches {
      color: var(--muted);
      font-size: 0.78em;
    }
    .module {
      color: var(--accent);
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Look Git Icon Gallery</h1>
      <p class="summary">${fileTypeIcons.length} supported file type icons, ${iconifyIcons.length} bundled Iconify vscode-icons, and ${codicons.length} codicons used by src/webview. Generated ${escapeHtml(generatedAt)}.</p>
    </div>
    <div class="search-row">
      <input id="icon-search" class="search-input" type="search" placeholder="Search icons, file types, extensions, or source files" autocomplete="off">
      <span id="result-count" class="result-count">${totalCount} icons</span>
    </div>
  </header>
  <section data-section>
    <h2>Supported File Type Icons</h2>
    <div class="grid">
${fileTypeCards}
    </div>
  </section>
  <section data-section>
    <h2>Iconify vscode-icons</h2>
    <div class="grid">
${iconifyCards}
    </div>
  </section>
  <section data-section>
    <h2>Codicons</h2>
    <div class="grid">
${codiconCards}
    </div>
  </section>
  <script>
    const searchInput = document.getElementById('icon-search');
    const resultCount = document.getElementById('result-count');
    const cards = Array.from(document.querySelectorAll('[data-search]'));
    const sections = Array.from(document.querySelectorAll('[data-section]'));

    function applySearch() {
      const query = searchInput.value.trim().toLowerCase();
      let visibleCount = 0;

      for (const card of cards) {
        const visible = query.length === 0 || card.dataset.search.includes(query);
        card.hidden = !visible;
        if (visible) {
          visibleCount += 1;
        }
      }

      for (const section of sections) {
        section.hidden = !section.querySelector('[data-search]:not([hidden])');
      }

      resultCount.textContent = visibleCount + (visibleCount === 1 ? ' icon' : ' icons');
    }

    searchInput.addEventListener('input', applySearch);
  </script>
</body>
</html>
`;
}

function fileTypeCard(entry) {
    const assetName = entry.moduleName.replace('@iconify/icons-vscode-icons/', '');
    const matches = entry.matches.length > 0 ? entry.matches.join(', ') : 'semantic only';
    const searchText = searchableText([entry.kind, assetName, entry.alias, matches, ...entry.sources.map((source) => `${source.label} ${source.file}`)]);
    return `      <article class="icon-card" data-search="${escapeHtml(searchText)}">
        <div class="icon">${renderIconifySvg(entry.icon)}</div>
        <div class="meta">
          <div class="name" title="${escapeHtml(entry.kind)}">${escapeHtml(entry.kind)}</div>
          <div class="matches" title="${escapeHtml(matches)}">${escapeHtml(matches)}</div>
          <div class="source" title="${escapeHtml(assetName)}"><span class="module">${escapeHtml(assetName)}</span></div>
        </div>
      </article>`;
}

function iconifyCard(entry) {
    const name = entry.moduleName.replace('@iconify/icons-vscode-icons/', '');
    const sources = entry.sources.map((source) => `${source.label} in ${source.file}`).join(', ');
    const searchText = searchableText([name, entry.alias, sources]);
    return `      <article class="icon-card" data-search="${escapeHtml(searchText)}">
        <div class="icon">${renderIconifySvg(entry.icon)}</div>
        <div class="meta">
          <div class="name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
          <div class="source" title="${escapeHtml(sources)}"><span class="module">${escapeHtml(entry.sources[0].label)}</span> ${escapeHtml(entry.sources[0].file)}</div>
        </div>
      </article>`;
}

function codiconCard(entry) {
    const sources = entry.sources.map((source) => `${source.label} in ${source.file}`).join(', ');
    const searchText = searchableText([entry.name, sources]);
    return `      <article class="icon-card" data-search="${escapeHtml(searchText)}">
        <div class="icon codicon-preview"><i class="codicon codicon-${escapeHtml(entry.name)}" aria-hidden="true"></i></div>
        <div class="meta">
          <div class="name" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</div>
          <div class="source" title="${escapeHtml(sources)}"><span class="module">${escapeHtml(entry.sources[0].label)}</span> ${escapeHtml(entry.sources[0].file)}</div>
        </div>
      </article>`;
}

function renderIconifySvg(icon) {
    const width = icon.width ?? 16;
    const height = icon.height ?? 16;
    return `<svg viewBox="0 0 ${escapeHtml(String(width))} ${escapeHtml(String(height))}" aria-hidden="true" focusable="false">${icon.body}</svg>`;
}

function searchableText(values) {
    return values.join(' ').toLowerCase();
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

if (require.main === module) {
    main();
}

module.exports = { collectFileTypeIcons };
