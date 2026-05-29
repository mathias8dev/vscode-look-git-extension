const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const config = {
    entryPoints: ['src/extension/activate.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    platform: 'node',
    external: ['vscode'],
    sourcemap: !production,
    sourcesContent: false,
    outfile: 'dist/extension.cjs',
    logLevel: 'info',
};

async function main() {
    if (watch) {
        const context = await esbuild.context(config);
        await context.watch();
        return;
    }

    await esbuild.build(config);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
