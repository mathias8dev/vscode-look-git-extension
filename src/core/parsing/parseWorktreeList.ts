import type { WorktreeInfo } from '../git/domain/GitWorktree';

export function parseWorktreeList(output: string): WorktreeInfo[] {
    if (!output) { return []; }
    const worktrees: WorktreeInfo[] = [];
    const stanzas = output.split(/\n\n+/);

    for (let i = 0; i < stanzas.length; i++) {
        const stanza = (stanzas[i] ?? '').trim();
        if (!stanza) { continue; }

        let wtPath = '';
        let head = '';
        let branch: string | undefined;
        let isDetached = false;

        for (const line of stanza.split('\n')) {
            if (line.startsWith('worktree '))       { wtPath = line.slice('worktree '.length); }
            else if (line.startsWith('HEAD '))       { head = line.slice('HEAD '.length); }
            else if (line.startsWith('branch '))     { branch = line.slice('branch '.length); }
            else if (line === 'detached')            { isDetached = true; }
        }

        if (!wtPath) { continue; }
        worktrees.push({ path: wtPath, head, branch, isMain: i === 0, isDetached });
    }

    return worktrees;
}
