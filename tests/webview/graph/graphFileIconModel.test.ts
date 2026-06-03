import { describe, expect, it } from 'vitest';
import type { CommitFileChange } from '../../../src/protocol/graph/types';
import { iconKindForCommitFile } from '../../../src/webview/features/graph/graphFileIconModel';

describe('graphFileIconModel', () => {
    it('resolves richer commit file icon kinds from paths', () => {
        expect(iconKindForCommitFile(file('lib/main.dart'))).toBe('dart');
        expect(iconKindForCommitFile(file('pubspec.yaml'))).toBe('flutter');
        expect(iconKindForCommitFile(file('src/service.py'))).toBe('python');
        expect(iconKindForCommitFile(file('Dockerfile'))).toBe('docker');
        expect(iconKindForCommitFile(file('schema.prisma'))).toBe('prisma');
    });
});

function file(filePath: string): CommitFileChange {
    return { status: 'M', filePath };
}
