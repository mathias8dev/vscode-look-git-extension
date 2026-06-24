import type { Resource } from '@protocol/shared/base';

export type RepoKind = 'main' | 'worktree' | 'submodule';
export type RepositoryKind = 'main' | 'submodule';

export interface RepositoryLocator {
    readonly repoId: string;
    readonly kind: RepositoryKind;
    readonly path: string;
    readonly parentRepoId?: string;
}

export interface WorktreeLocator {
    readonly repoId: string;
    readonly worktreeId: string;
    readonly path: string;
}

export enum SubmoduleStatus {
    Clean          = 'clean',
    Dirty          = 'dirty',
    OutOfSync      = 'out-of-sync',
    NotInitialized = 'not-initialized',
}

export interface SerializedRepoContext {
    readonly id: string;
    readonly cwd: string;
    readonly kind: RepoKind;
    readonly parentId?: string;
    readonly label: string;
}

export interface RepositorySummary {
    readonly context: SerializedRepoContext;
    readonly branch?: string;
    readonly upstream?: string;
    readonly hasRemote: boolean;
    readonly branchCount: number;
    readonly submoduleCount: number;
    readonly worktreeCount: number;
    readonly stagedCount: number;
    readonly unstagedCount: number;
    readonly conflictCount: number;
}

export interface RepositoriesChangedPush {
    readonly type: 'repo/repositoriesChanged';
    readonly repositories: Resource<readonly RepositorySummary[]>;
    readonly activeContextId: Resource<string | undefined>;
    readonly listContextId: Resource<string | undefined>;
}

export interface SelectRepositoryContextMessage {
    readonly type: 'repo/selectRepository';
    readonly contextId: string;
}

export interface ShowRepositoryListMessage {
    readonly type: 'repo/showRepositoryList';
    readonly contextId?: string;
}

export interface OpenRepositoryInNewWindowMessage {
    readonly type: 'repo/openRepositoryInNewWindow';
    readonly contextId: string;
}

export type RepositoryNavigationMessage =
    | SelectRepositoryContextMessage
    | ShowRepositoryListMessage
    | OpenRepositoryInNewWindowMessage;
