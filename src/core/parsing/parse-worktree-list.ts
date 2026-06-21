import type { GitWorktree } from '@core/git/domain/git-worktree';

export function parseWorktreeList(output: string): GitWorktree[] {
    if (!output) { return []; }
    const worktrees: GitWorktree[] = [];
    const stanzas = output.split(/\n\n+/);

    for (let i = 0; i < stanzas.length; i++) {
        const stanza = (stanzas[i] ?? '').trim();
        if (!stanza) { continue; }

        let wtPath = '';
        let head = '';
        let branch: string | undefined;
        let isDetached = false;
        let isLocked = false;
        let lockReason: string | undefined;

        for (const line of stanza.split('\n')) {
            if (line.startsWith('worktree '))       { wtPath = line.slice('worktree '.length); }
            else if (line.startsWith('HEAD '))       { head = line.slice('HEAD '.length); }
            else if (line.startsWith('branch '))     { branch = line.slice('branch '.length); }
            else if (line === 'detached')            { isDetached = true; }
            else if (line === 'locked')              { isLocked = true; }
            else if (line.startsWith('locked '))      { isLocked = true; lockReason = line.slice('locked '.length); }
        }

        if (!wtPath) { continue; }
        worktrees.push({ path: wtPath, head, branch, isMain: i === 0, isDetached, isLocked, lockReason } satisfies GitWorktree);
    }

    return worktrees;
}
