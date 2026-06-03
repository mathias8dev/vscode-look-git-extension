import type { CommitFileChange } from '../../../protocol/graph/types';

export function filterCommitDetailFiles(files: readonly CommitFileChange[], search: string): readonly CommitFileChange[] {
    const needle = search.trim().toLowerCase();
    if (!needle) { return files; }
    return files.filter((file) =>
        file.filePath.toLowerCase().includes(needle)
        || (file.origPath?.toLowerCase().includes(needle) ?? false),
    );
}
