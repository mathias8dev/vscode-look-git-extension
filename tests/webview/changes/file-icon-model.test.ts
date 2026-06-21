import { describe, expect, it } from 'vitest';
import { iconKindForPath, iconKindForStatusEntry, iconKindForStashFile } from '@webview/features/changes/file-icon-model';

describe('fileIconModel', () => {
    it('resolves common file icon kinds from paths', () => {
        expect(iconKindForPath('src/app.ts')).toBe('typescript');
        expect(iconKindForPath('src/app.jsx')).toBe('javascript');
        expect(iconKindForPath('package.json')).toBe('package');
        expect(iconKindForPath('README.md')).toBe('markdown');
        expect(iconKindForPath('.gitignore')).toBe('git');
        expect(iconKindForPath('vite.config.ts')).toBe('config');
        expect(iconKindForPath('assets/logo.svg')).toBe('image');
        expect(iconKindForPath('vendor/tool.bin')).toBe('binary');
        expect(iconKindForPath('resources/files.properties')).toBe('properties');
        expect(iconKindForPath('fastlane/Fastfile')).toBe('ruby');
        expect(iconKindForPath('lib/main.dart')).toBe('dart');
        expect(iconKindForPath('pubspec.yaml')).toBe('flutter');
        expect(iconKindForPath('scripts/build.py')).toBe('python');
        expect(iconKindForPath('cmd/server.go')).toBe('go');
        expect(iconKindForPath('src/lib.rs')).toBe('rust');
        expect(iconKindForPath('Dockerfile')).toBe('docker');
        expect(iconKindForPath('tailwind.config.ts')).toBe('tailwind');
        expect(iconKindForPath('schema.prisma')).toBe('prisma');
        expect(iconKindForPath('src/App.vue')).toBe('vue');
        expect(iconKindForPath('src/App.svelte')).toBe('svelte');
        expect(iconKindForPath('ios/Info.plist')).toBe('plist');
        expect(iconKindForPath('ios/App.xcodeproj/project.pbxproj')).toBe('xcode');
        expect(iconKindForPath('android/build.gradle')).toBe('gradle');
        expect(iconKindForPath('pom.xml')).toBe('maven');
    });

    it('marks submodule status entries explicitly', () => {
        expect(iconKindForStatusEntry({
            indexStatus: 'M',
            workTreeStatus: ' ',
            filePath: 'modules/lib',
            isSubmodule: true,
        })).toBe('submodule');
    });

    it('resolves stash file icons from their file path', () => {
        expect(iconKindForStashFile({ status: 'M', filePath: 'src/styles.css' })).toBe('css');
    });
});
