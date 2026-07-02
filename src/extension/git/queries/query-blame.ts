import type { GitBlameLine } from '@core/git/domain/git-blame';
import { parseBlame } from '@core/parsing/parse-blame';
import type { GitExec } from '@extension/git/git-exec';

export async function queryBlame(
    execRawReadonly: GitExec,
    filePath: string,
    signal?: AbortSignal,
): Promise<GitBlameLine[]> {
    const output = await execRawReadonly(['blame', '--line-porcelain', '--', filePath], signal);
    return parseBlame(output);
}
