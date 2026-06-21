import type { GitRepository } from '@application/ports/git-topology';

export interface RemoteBranchName {
    readonly remote: string;
    readonly branchName: string;
}

export function splitRemoteBranchName(branch: string): RemoteBranchName | undefined {
    const slashIdx = branch.indexOf('/');
    if (slashIdx === -1) { return undefined; }
    return {
        remote: branch.substring(0, slashIdx),
        branchName: branch.substring(slashIdx + 1),
    };
}

export function requireRemoteBranchName(branch: string): RemoteBranchName {
    const parsed = splitRemoteBranchName(branch);
    if (!parsed) { throw new Error(`Expected remote branch name, got "${branch}".`); }
    return parsed;
}

export function localBranchNameForRemote(branch: string): string | undefined {
    return splitRemoteBranchName(branch)?.branchName;
}

export function localNameForRemoteBranch(branch: string): string {
    return splitRemoteBranchName(branch)?.branchName ?? branch;
}

export async function defaultRemote(repository: GitRepository): Promise<string> {
    const remotes = await repository.listRemotes();
    const remote = remotes[0];
    if (!remote) { throw new Error('No Git remote configured.'); }
    return remote;
}

export async function resolveRemoteBranch(repository: GitRepository, branch: string): Promise<RemoteBranchName> {
    return splitRemoteBranchName(branch) ?? {
        remote: await defaultRemote(repository),
        branchName: branch,
    };
}
