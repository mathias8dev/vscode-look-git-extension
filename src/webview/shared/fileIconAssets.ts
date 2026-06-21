import defaultFile from '@iconify/icons-vscode-icons/default-file';
import fileTypeAstro from '@iconify/icons-vscode-icons/file-type-astro';
import fileTypeBinary from '@iconify/icons-vscode-icons/file-type-binary';
import fileTypeC from '@iconify/icons-vscode-icons/file-type-c';
import fileTypeConfig from '@iconify/icons-vscode-icons/file-type-config';
import fileTypeCpp from '@iconify/icons-vscode-icons/file-type-cpp';
import fileTypeCss from '@iconify/icons-vscode-icons/file-type-css';
import fileTypeCsharp from '@iconify/icons-vscode-icons/file-type-csharp';
import fileTypeDartlang from '@iconify/icons-vscode-icons/file-type-dartlang';
import fileTypeDocker from '@iconify/icons-vscode-icons/file-type-docker';
import fileTypeFlutter from '@iconify/icons-vscode-icons/file-type-flutter';
import fileTypeGit from '@iconify/icons-vscode-icons/file-type-git';
import fileTypeGo from '@iconify/icons-vscode-icons/file-type-go';
import fileTypeGradle from '@iconify/icons-vscode-icons/file-type-gradle';
import fileTypeGraphql from '@iconify/icons-vscode-icons/file-type-graphql';
import fileTypeHtml from '@iconify/icons-vscode-icons/file-type-html';
import fileTypeImage from '@iconify/icons-vscode-icons/file-type-image';
import fileTypeIni from '@iconify/icons-vscode-icons/file-type-ini';
import fileTypeJava from '@iconify/icons-vscode-icons/file-type-java';
import fileTypeJsOfficial from '@iconify/icons-vscode-icons/file-type-js-official';
import fileTypeJson from '@iconify/icons-vscode-icons/file-type-json';
import fileTypeKotlin from '@iconify/icons-vscode-icons/file-type-kotlin';
import fileTypeMarkdown from '@iconify/icons-vscode-icons/file-type-markdown';
import fileTypeMaven from '@iconify/icons-vscode-icons/file-type-maven';
import fileTypeNpm from '@iconify/icons-vscode-icons/file-type-npm';
import fileTypePhp from '@iconify/icons-vscode-icons/file-type-php';
import fileTypePowershell from '@iconify/icons-vscode-icons/file-type-powershell';
import fileTypePrisma from '@iconify/icons-vscode-icons/file-type-prisma';
import fileTypePython from '@iconify/icons-vscode-icons/file-type-python';
import fileTypeRuby from '@iconify/icons-vscode-icons/file-type-ruby';
import fileTypeRust from '@iconify/icons-vscode-icons/file-type-rust';
import fileTypeShell from '@iconify/icons-vscode-icons/file-type-shell';
import fileTypeSql from '@iconify/icons-vscode-icons/file-type-sql';
import fileTypeSvelte from '@iconify/icons-vscode-icons/file-type-svelte';
import fileTypeSwift from '@iconify/icons-vscode-icons/file-type-swift';
import fileTypeTailwind from '@iconify/icons-vscode-icons/file-type-tailwind';
import fileTypeToml from '@iconify/icons-vscode-icons/file-type-toml';
import fileTypeTypescriptOfficial from '@iconify/icons-vscode-icons/file-type-typescript-official';
import fileTypeVue from '@iconify/icons-vscode-icons/file-type-vue';
import fileTypeXml from '@iconify/icons-vscode-icons/file-type-xml';
import fileTypeXcode from '@iconify/icons-vscode-icons/file-type-xcode';
import fileTypeYaml from '@iconify/icons-vscode-icons/file-type-yaml';
import type { IconifySvgData } from '@webview/shared/IconifySvg';
import type { WebviewFileIconKind } from '@webview/shared/fileIconModel';

export function iconForFileKind(kind: WebviewFileIconKind): IconifySvgData {
    switch (kind) {
        case 'typescript':
            return fileTypeTypescriptOfficial;
        case 'javascript':
            return fileTypeJsOfficial;
        case 'json':
            return fileTypeJson;
        case 'markdown':
            return fileTypeMarkdown;
        case 'css':
            return fileTypeCss;
        case 'html':
            return fileTypeHtml;
        case 'image':
            return fileTypeImage;
        case 'binary':
            return fileTypeBinary;
        case 'dart':
            return fileTypeDartlang;
        case 'flutter':
            return fileTypeFlutter;
        case 'python':
            return fileTypePython;
        case 'go':
            return fileTypeGo;
        case 'rust':
            return fileTypeRust;
        case 'java':
            return fileTypeJava;
        case 'kotlin':
            return fileTypeKotlin;
        case 'swift':
            return fileTypeSwift;
        case 'php':
            return fileTypePhp;
        case 'ruby':
            return fileTypeRuby;
        case 'csharp':
            return fileTypeCsharp;
        case 'c':
            return fileTypeC;
        case 'cpp':
            return fileTypeCpp;
        case 'yaml':
            return fileTypeYaml;
        case 'xml':
            return fileTypeXml;
        case 'vue':
            return fileTypeVue;
        case 'svelte':
            return fileTypeSvelte;
        case 'astro':
            return fileTypeAstro;
        case 'shell':
            return fileTypeShell;
        case 'powershell':
            return fileTypePowershell;
        case 'docker':
            return fileTypeDocker;
        case 'toml':
            return fileTypeToml;
        case 'sql':
            return fileTypeSql;
        case 'graphql':
            return fileTypeGraphql;
        case 'prisma':
            return fileTypePrisma;
        case 'tailwind':
            return fileTypeTailwind;
        case 'xcode':
            return fileTypeXcode;
        case 'plist':
            return fileTypeConfig;
        case 'gradle':
            return fileTypeGradle;
        case 'maven':
            return fileTypeMaven;
        case 'package':
            return fileTypeNpm;
        case 'git':
        case 'submodule':
            return fileTypeGit;
        case 'config':
            return fileTypeConfig;
        case 'properties':
            return fileTypeIni;
        case 'file':
            return defaultFile;
    }
}
