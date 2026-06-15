import * as fs from 'fs/promises';
import type { GitRepository } from '../../application/ports/git-repository';
import { detectConflictStateFromFiles } from '../../core/parsing/parseStatus';

export async function isRebaseInProgress(repo: GitRepository): Promise<boolean> {
    try {
        const gitDir = await repo.getGitDir();
        const entries = await fs.readdir(gitDir);
        return detectConflictStateFromFiles(entries) === 'rebase';
    } catch {
        return false;
    }
}
