import { describe, expect, it } from 'vitest';
import type { CommitFileChange } from '@protocol/graph/types';
import { iconKindForCommitFile } from '@webview/shared/commit-file-icon-model';

describe('graphFileIconModel', () => {
    it('resolves richer commit file icon kinds from paths', () => {
        expect(iconKindForCommitFile(file('lib/main.dart'))).toBe('file-type-dartlang');
        expect(iconKindForCommitFile(file('pubspec.yaml'))).toBe('file-type-flutter-package');
        expect(iconKindForCommitFile(file('src/service.py'))).toBe('file-type-python');
        expect(iconKindForCommitFile(file('Dockerfile'))).toBe('file-type-docker');
        expect(iconKindForCommitFile(file('schema.prisma'))).toBe('file-type-prisma');
        expect(iconKindForCommitFile(file('fastlane/Fastfile'))).toBe('file-type-ruby');
        expect(iconKindForCommitFile(file('bin/tool.bin'))).toBe('file-type-binary');
        expect(iconKindForCommitFile(file('src/main/resources/files.properties'))).toBe('file-type-config');
    });
});

function file(filePath: string): CommitFileChange {
    return { status: 'M', filePath };
}
