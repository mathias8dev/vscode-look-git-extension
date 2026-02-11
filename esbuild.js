const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`\u2718 [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
    },
};

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
    entryPoints: ['src/webview/graph.ts'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outfile: 'dist/webview/graph.js',
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
};

/** @type {import('esbuild').BuildOptions} */
const changesWebviewConfig = {
    entryPoints: ['src/webview/changes.ts'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outfile: 'dist/webview/changes.js',
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
};

async function main() {
    const extCtx = await esbuild.context(extensionConfig);
    const webCtx = await esbuild.context(webviewConfig);
    const changesCtx = await esbuild.context(changesWebviewConfig);
    if (watch) {
        await Promise.all([extCtx.watch(), webCtx.watch(), changesCtx.watch()]);
    } else {
        await Promise.all([extCtx.rebuild(), webCtx.rebuild(), changesCtx.rebuild()]);
        await Promise.all([extCtx.dispose(), webCtx.dispose(), changesCtx.dispose()]);
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
