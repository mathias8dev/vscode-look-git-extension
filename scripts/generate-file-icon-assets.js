const fs = require('fs');
const path = require('path');

function icon(moduleName) {
    const mod = require(`@iconify/icons-vscode-icons/${moduleName}`);
    return mod.default ?? mod;
}

const icons = {
    astro: icon('file-type-astro'),
    binary: icon('file-type-binary'),
    c: icon('file-type-c'),
    config: icon('file-type-config'),
    cpp: icon('file-type-cpp'),
    csharp: icon('file-type-csharp'),
    css: icon('file-type-css'),
    dart: icon('file-type-dartlang'),
    docker: icon('file-type-docker'),
    dotenv: icon('file-type-dotenv'),
    editorconfig: icon('file-type-editorconfig'),
    eslint: icon('file-type-eslint'),
    file: icon('default-file'),
    folder: icon('default-folder'),
    'folder-opened': icon('default-folder-opened'),
    git: icon('file-type-git'),
    go: icon('file-type-go'),
    graphql: icon('file-type-graphql'),
    html: icon('file-type-html'),
    image: icon('file-type-image'),
    java: icon('file-type-java'),
    javascript: icon('file-type-js-official'),
    jsconfig: icon('file-type-jsconfig'),
    json: icon('file-type-json-official'),
    kotlin: icon('file-type-kotlin'),
    less: icon('file-type-less'),
    license: icon('file-type-license'),
    log: icon('file-type-log'),
    lua: icon('file-type-lua'),
    markdown: icon('file-type-markdown'),
    npm: icon('file-type-npm'),
    package: icon('file-type-package'),
    pdf: icon('file-type-pdf2'),
    php: icon('file-type-php'),
    pnpm: icon('file-type-pnpm'),
    prettier: icon('file-type-prettier'),
    protobuf: icon('file-type-protobuf'),
    python: icon('file-type-python'),
    reactjs: icon('file-type-reactjs'),
    reactts: icon('file-type-reactts'),
    ruby: icon('file-type-ruby'),
    rust: icon('file-type-rust'),
    sass: icon('file-type-sass'),
    scss: icon('file-type-scss'),
    shell: icon('file-type-shell'),
    source: icon('file-type-source'),
    sql: icon('file-type-sql'),
    svelte: icon('file-type-svelte'),
    svg: icon('file-type-svg'),
    swift: icon('file-type-swift'),
    terraform: icon('file-type-terraform'),
    text: icon('file-type-text'),
    toml: icon('file-type-toml'),
    tsconfig: icon('file-type-tsconfig-official'),
    typescript: icon('file-type-typescript-official'),
    typescriptdef: icon('file-type-typescriptdef-official'),
    vite: icon('file-type-vite'),
    vitest: icon('file-type-vitest'),
    vue: icon('file-type-vue'),
    wasm: icon('file-type-wasm'),
    webpack: icon('file-type-webpack'),
    xml: icon('file-type-xml'),
    yaml: icon('file-type-yaml'),
    yarn: icon('file-type-yarn'),
    zip: icon('file-type-zip'),
};

function renderSvg(data) {
    const width = data.width ?? 16;
    const height = data.height ?? 16;
    return `<svg width="16" height="16" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${data.body}</svg>\n`;
}

const targetDir = path.join(__dirname, '..', 'resources', 'file-icons');
fs.mkdirSync(targetDir, { recursive: true });

for (const [name, data] of Object.entries(icons)) {
    fs.writeFileSync(path.join(targetDir, `${name}.svg`), renderSvg(data));
}

console.log(`Generated ${Object.keys(icons).length} file icon assets in ${path.relative(process.cwd(), targetDir)}`);
