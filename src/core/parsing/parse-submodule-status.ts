import type { GitSubmodule } from '@core/git/domain/git-worktree';

/** Parse the output of `git submodule status`. Returns one entry per submodule. */
export function parseSubmoduleStatus(output: string): GitSubmodule[] {
    if (!output) { return []; }
    const result: GitSubmodule[] = [];

    for (const line of output.split(/\r?\n/)) {
        if (!line) { continue; }
        // Format: [+-U ]<sha> <path> [(<desc>)]
        const match = line.match(/^([ +\-U])[0-9a-f]+ (.+?)( \(.*\))?$/);
        if (match && match[1] && match[2]) {
            result.push({
                path: match[2].trim(),
                status: match[1] as GitSubmodule['status'],
            });
        }
    }

    return result;
}
