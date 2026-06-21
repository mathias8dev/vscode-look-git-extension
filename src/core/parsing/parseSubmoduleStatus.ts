import type { GitSubmodule } from '@core/git/domain/GitWorktree';

/** Parse the output of `git submodule status`. Returns one entry per submodule. */
export function parseSubmoduleStatus(output: string): GitSubmodule[] {
    if (!output) { return []; }
    const result: GitSubmodule[] = [];

    for (const line of output.split('\n')) {
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

/** Extract just the set of submodule paths from `git submodule status` output. */
export function parseSubmodulePaths(output: string): Set<string> {
    return new Set(parseSubmoduleStatus(output).map((s) => s.path));
}
