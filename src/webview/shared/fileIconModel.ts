export type WebviewFileIconKind =
    | 'typescript'
    | 'javascript'
    | 'json'
    | 'markdown'
    | 'css'
    | 'html'
    | 'image'
    | 'dart'
    | 'flutter'
    | 'python'
    | 'go'
    | 'rust'
    | 'java'
    | 'kotlin'
    | 'swift'
    | 'php'
    | 'ruby'
    | 'csharp'
    | 'c'
    | 'cpp'
    | 'yaml'
    | 'xml'
    | 'vue'
    | 'svelte'
    | 'astro'
    | 'shell'
    | 'powershell'
    | 'docker'
    | 'toml'
    | 'sql'
    | 'graphql'
    | 'prisma'
    | 'tailwind'
    | 'config'
    | 'package'
    | 'git'
    | 'submodule'
    | 'file';

export function iconKindForPath(filePath: string): WebviewFileIconKind {
    const name = fileName(filePath).toLowerCase();
    const extension = name.includes('.') ? name.split('.').pop() ?? '' : '';

    if (name === 'package.json') { return 'package'; }
    if (name.startsWith('.git') || name === 'gitignore' || name === 'gitattributes') { return 'git'; }
    if (name === 'pubspec.yaml' || name === 'pubspec.yml' || name === 'pubspec.lock') { return 'flutter'; }
    if (name === 'dockerfile' || name.startsWith('dockerfile.') || name === 'docker-compose.yml' || name === 'docker-compose.yaml') { return 'docker'; }
    if (name.startsWith('tailwind.config.')) { return 'tailwind'; }
    if (name === 'rust-toolchain' || name === 'rust-toolchain.toml') { return 'rust'; }
    if (isConfigFile(name)) { return 'config'; }

    switch (extension) {
        case 'ts':
        case 'tsx':
            return 'typescript';
        case 'js':
        case 'jsx':
        case 'mjs':
        case 'cjs':
            return 'javascript';
        case 'json':
        case 'jsonc':
            return 'json';
        case 'md':
        case 'mdx':
            return 'markdown';
        case 'css':
        case 'scss':
        case 'sass':
        case 'less':
            return 'css';
        case 'html':
        case 'htm':
            return 'html';
        case 'dart':
            return 'dart';
        case 'py':
        case 'pyw':
            return 'python';
        case 'go':
            return 'go';
        case 'rs':
            return 'rust';
        case 'java':
            return 'java';
        case 'kt':
        case 'kts':
            return 'kotlin';
        case 'swift':
            return 'swift';
        case 'php':
            return 'php';
        case 'rb':
            return 'ruby';
        case 'cs':
            return 'csharp';
        case 'c':
        case 'h':
            return 'c';
        case 'cc':
        case 'cpp':
        case 'cxx':
        case 'hh':
        case 'hpp':
        case 'hxx':
            return 'cpp';
        case 'yaml':
        case 'yml':
            return 'yaml';
        case 'xml':
            return 'xml';
        case 'vue':
            return 'vue';
        case 'svelte':
            return 'svelte';
        case 'astro':
            return 'astro';
        case 'sh':
        case 'bash':
        case 'zsh':
        case 'fish':
            return 'shell';
        case 'ps1':
        case 'psm1':
        case 'psd1':
            return 'powershell';
        case 'toml':
            return 'toml';
        case 'sql':
        case 'sqlite':
        case 'sqlite3':
            return 'sql';
        case 'graphql':
        case 'gql':
            return 'graphql';
        case 'prisma':
            return 'prisma';
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'webp':
        case 'svg':
            return 'image';
        default:
            return 'file';
    }
}

function fileName(filePath: string): string {
    return filePath.split('/').pop() || filePath;
}

function isConfigFile(name: string): boolean {
    return name.endsWith('config.js')
        || name.endsWith('config.ts')
        || name.endsWith('config.json')
        || name.endsWith('rc')
        || name.includes('.config.')
        || name.startsWith('.');
}
