import type { CommitGraphQuery } from '@application/ports/git-capabilities';
import type { GitCommit } from '@core/git/domain/git-commit';
import { Page, type PageRequest } from '@core/git/domain/page';
import type { GitBranch } from '@core/git/domain/git-status';

export interface BranchDetailsRepository {
    listBranches(signal?: AbortSignal): Promise<readonly GitBranch[]>;
    listRemotes(signal?: AbortSignal): Promise<readonly string[]>;
    getRemoteUrl(remote: string, signal?: AbortSignal): Promise<string>;
    getCommitDetails(commit: string, signal?: AbortSignal): Promise<GitCommit>;
    getCommitGraph(query: CommitGraphQuery, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>>;
}

export interface BranchDetailsResult {
    readonly branch: GitBranch;
    readonly remote: string | undefined;
    readonly remoteUrl: string | undefined;
    readonly head: GitCommit | undefined;
    readonly commits: Page<GitCommit>;
}

export class GetBranchDetailsUseCase {
    async execute(
        repository: BranchDetailsRepository,
        branchName: string,
        pageRequest: PageRequest,
        signal?: AbortSignal,
    ): Promise<BranchDetailsResult> {
        const [branches, remotes] = await Promise.all([
            repository.listBranches(signal),
            repository.listRemotes(signal),
        ]);
        const branch = branches.find((candidate) => candidate.name === branchName);
        if (!branch) { throw new Error(`Branch "${branchName}" was not found.`); }
        const remote = remoteForBranch(branch, remotes);
        const remoteUrlPromise = remote
            ? repository.getRemoteUrl(remote, signal)
            : Promise.resolve(undefined);

        if (!branch.hash) {
            return {
                branch,
                remote,
                remoteUrl: await remoteUrlPromise,
                head: undefined,
                commits: emptyPage(),
            };
        }

        const [remoteUrl, head, commits] = await Promise.all([
            remoteUrlPromise,
            repository.getCommitDetails(branch.hash, signal),
            repository.getCommitGraph({ branches: [branch.name] }, pageRequest, signal),
        ]);
        return { branch, remote, remoteUrl, head, commits };
    }
}

function remoteForBranch(branch: GitBranch, remotes: readonly string[]): string | undefined {
    const remoteRef = branch.isRemote ? branch.name : branch.upstream;
    if (!remoteRef) { return undefined; }
    return [...remotes]
        .sort((left, right) => right.length - left.length)
        .find((remote) => remoteRef.startsWith(`${remote}/`));
}

function emptyPage(): Page<GitCommit> {
    return new Page([], false);
}
