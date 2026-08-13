import { describe, expect, it } from 'vitest';
import { iconKindForPath, iconKindForStatusEntry, iconKindForStashFile } from '@webview/features/changes/file-icon-model';

describe('fileIconModel', () => {
    it('resolves common file icon kinds from paths', () => {
        expect(iconKindForPath('src/app.ts')).toBe('file-type-typescript-official');
        expect(iconKindForPath('src/app.cts')).toBe('file-type-typescript-official');
        expect(iconKindForPath('src/app.mts')).toBe('file-type-typescript-official');
        expect(iconKindForPath('src/app.tsx')).toBe('file-type-reactts');
        expect(iconKindForPath('src/types.d.ts')).toBe('file-type-typescriptdef-official');
        expect(iconKindForPath('src/types.d.cts')).toBe('file-type-typescriptdef-official');
        expect(iconKindForPath('src/types.d.mts')).toBe('file-type-typescriptdef-official');
        expect(iconKindForPath('src/app.js')).toBe('file-type-js-official');
        expect(iconKindForPath('src/app.mjs')).toBe('file-type-js-official');
        expect(iconKindForPath('src/app.cjs')).toBe('file-type-js-official');
        expect(iconKindForPath('src/app.jsx')).toBe('file-type-reactjs');
        expect(iconKindForPath('package.json')).toBe('file-type-npm');
        expect(iconKindForPath('README.md')).toBe('file-type-markdown');
        expect(iconKindForPath('.gitignore')).toBe('file-type-git');
        expect(iconKindForPath('vite.config.ts')).toBe('file-type-vite');
        expect(iconKindForPath('assets/logo.svg')).toBe('file-type-svg');
        expect(iconKindForPath('vendor/tool.bin')).toBe('file-type-binary');
        expect(iconKindForPath('resources/files.properties')).toBe('file-type-config');
        expect(iconKindForPath('fastlane/Fastfile')).toBe('file-type-ruby');
        expect(iconKindForPath('lib/main.dart')).toBe('file-type-dartlang');
        expect(iconKindForPath('pubspec.yaml')).toBe('file-type-flutter-package');
        expect(iconKindForPath('scripts/build.py')).toBe('file-type-python');
        expect(iconKindForPath('cmd/server.go')).toBe('file-type-go');
        expect(iconKindForPath('src/lib.rs')).toBe('file-type-rust');
        expect(iconKindForPath('Dockerfile')).toBe('file-type-docker');
        expect(iconKindForPath('tailwind.config.ts')).toBe('file-type-tailwind');
        expect(iconKindForPath('schema.prisma')).toBe('file-type-prisma');
        expect(iconKindForPath('src/App.vue')).toBe('file-type-vue');
        expect(iconKindForPath('src/App.svelte')).toBe('file-type-svelte');
        expect(iconKindForPath('ios/Info.plist')).toBe('file-type-config');
        expect(iconKindForPath('ios/App.xcodeproj/project.pbxproj')).toBe('file-type-xcode');
        expect(iconKindForPath('android/build.gradle')).toBe('file-type-gradle');
        expect(iconKindForPath('pom.xml')).toBe('file-type-maven');
        expect(iconKindForPath('src/build.kts')).toBe('file-type-kotlin');
        expect(iconKindForPath('schema.graphql')).toBe('file-type-graphql');
        expect(iconKindForPath('schema.gql')).toBe('file-type-graphql');
    });

    it('resolves the extended language and format catalog', () => {
        expect(iconKindForPath('lib/server.ex')).toBe('file-type-elixir');
        expect(iconKindForPath('scripts/server.exs')).toBe('file-type-elixir');
        expect(iconKindForPath('src/server.erl')).toBe('file-type-erlang');
        expect(iconKindForPath('include/server.hrl')).toBe('file-type-erlang');
        expect(iconKindForPath('src/Main.scala')).toBe('file-type-scala');
        expect(iconKindForPath('scripts/Main.sc')).toBe('file-type-scala');
        expect(iconKindForPath('scripts/init.lua')).toBe('file-type-lua');
        expect(iconKindForPath('analysis/model.r')).toBe('file-type-r');
        expect(iconKindForPath('schema/api.proto')).toBe('file-type-protobuf');
        expect(iconKindForPath('notebooks/report.ipynb')).toBe('file-type-jupyter');
        expect(iconKindForPath('release/archive.zip')).toBe('file-type-zip');
        expect(iconKindForPath('fonts/inter.woff')).toBe('file-type-font');
        expect(iconKindForPath('src/widget.spec.ts')).toBe('file-type-testts');
        expect(iconKindForPath('containers/Dockerfile.development')).toBe('file-type-docker');
        expect(iconKindForPath('src\\windows.ts')).toBe('file-type-typescript-official');
    });

    it('uses generic config icons only when no specialized association exists', () => {
        expect(iconKindForPath('custom.config.ts')).toBe('file-type-config');
        expect(iconKindForPath('.customrc')).toBe('file-type-config');
        expect(iconKindForPath('vite.config.ts')).toBe('file-type-vite');
        expect(iconKindForPath('.eslintrc')).toBe('file-type-eslint');
    });

    it('marks submodule status entries explicitly', () => {
        expect(iconKindForStatusEntry({
            indexStatus: 'M',
            workTreeStatus: ' ',
            filePath: 'modules/lib',
            isSubmodule: true,
        })).toBe('file-type-git');
    });

    it('resolves stash file icons from their file path', () => {
        expect(iconKindForStashFile({ status: 'M', filePath: 'src/styles.css' })).toBe('file-type-css');
    });
});
