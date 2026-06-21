import { describe, expect, it } from 'vitest';
import type { CommitFileChange } from '@protocol/graph/types';
import { iconKindForCommitFile } from '@webview/features/graph/graph-file-icon-model';

describe('graphFileIconModel', () => {
    it('resolves richer commit file icon kinds from paths', () => {
        expect(iconKindForCommitFile(file('lib/main.dart'))).toBe('dart');
        expect(iconKindForCommitFile(file('pubspec.yaml'))).toBe('flutter');
        expect(iconKindForCommitFile(file('src/service.py'))).toBe('python');
        expect(iconKindForCommitFile(file('Dockerfile'))).toBe('docker');
        expect(iconKindForCommitFile(file('schema.prisma'))).toBe('prisma');
        expect(iconKindForCommitFile(file('fastlane/Fastfile'))).toBe('ruby');
        expect(iconKindForCommitFile(file('bin/tool.bin'))).toBe('binary');
        expect(iconKindForCommitFile(file('src/main/resources/files.properties'))).toBe('properties');
    });
});

function file(filePath: string): CommitFileChange {
    return { status: 'M', filePath };
}
