import type { RequestId, ErrorMessage, ProtocolError } from '../shared/base';
import type { OperationNoticeActionKind, OperationStatus } from '../shared/operation';
export { OperationStatus as GraphOperationStatus } from '../shared/operation';
import type { SerializedRepoContext } from '../shared/repo';
import type { WebviewFontSizeChangedPush } from '../shared/ui';
import type { GraphContextTarget, GraphData, GraphFilters, GraphPage, CommitFileChange, GraphRepositoryScope, GraphSubmoduleInfo } from './types';

// ── Extension → Webview (push — no requestId) ──────────────────────────────

export interface RepoContextChangedPush {
    readonly type: 'repo/contextChanged';
    readonly context: SerializedRepoContext;
}

export interface GraphDataPush {
    readonly type: 'graph/dataPush';
    readonly repoId: string;
    readonly data: GraphData;
}

export interface GraphSubmodulesPush {
    readonly type: 'graph/submodulesPush';
    readonly repoId: string;
    readonly repositoryScope: GraphRepositoryScope;
    readonly submodules: readonly GraphSubmoduleInfo[];
}

export interface GraphRefreshRequestedPush {
    readonly type: 'graph/refreshRequested';
}

export interface GraphErrorPush {
    readonly type: 'graph/error';
    readonly requestId?: RequestId;
    readonly message: string;
    readonly error: ProtocolError;
}

export interface GraphSelectCommitPush {
    readonly type: 'graph/selectCommit';
    readonly hash: string;
}

export interface GraphSelectWorktreePush {
    readonly type: 'graph/selectWorktree';
    readonly path: string;
}

export enum GraphOperationCategory {
    Repository = 'repository',
    Branch = 'branch',
    Worktree = 'worktree',
    Commit = 'commit',
}

export interface GraphOperationStatusPush {
    readonly type: 'graph/operationStatus';
    readonly operationId: string;
    readonly status: OperationStatus;
    readonly category: GraphOperationCategory;
    readonly command: GraphRepositoryCommand | BranchCommand | WorktreeCommand | CommitCommand;
    readonly target?: string;
    readonly background?: boolean;
    readonly repositoryScope?: GraphRepositoryScope;
    readonly actions?: readonly OperationNoticeActionKind[];
}

// ── Extension → Webview (responses — echo requestId) ───────────────────────

export interface GraphDataResponse {
    readonly type: 'graph/dataResponse';
    readonly requestId: RequestId;
    readonly data: GraphData;
}

export interface CommitDetailsResponse {
    readonly type: 'graph/commitDetailsResponse';
    readonly requestId: RequestId;
    readonly hash: string;
    readonly fullMessage: string;
    readonly files: readonly CommitFileChange[];
}

export interface WorktreeDetailsResponse {
    readonly type: 'graph/worktreeDetailsResponse';
    readonly requestId: RequestId;
    readonly path: string;
    readonly head: string;
    readonly branch: string | undefined;
    readonly files: readonly CommitFileChange[];
}

// ── Webview → Extension (requests — carry requestId) ───────────────────────

export interface GraphDataRequest {
    readonly type: 'graph/dataRequest';
    readonly requestId: RequestId;
    readonly repoId: string;
    readonly filters: GraphFilters;
    readonly page: GraphPage;
    readonly repositoryScope?: GraphRepositoryScope;
}

export interface LoadMoreGraphRequest {
    readonly type: 'graph/loadMore';
    readonly requestId: RequestId;
    readonly repoId: string;
    readonly filters: GraphFilters;
    readonly page: GraphPage;
    readonly repositoryScope?: GraphRepositoryScope;
}

export interface CommitDetailsRequest {
    readonly type: 'graph/commitDetailsRequest';
    readonly requestId: RequestId;
    readonly hash: string;
    readonly selectedHashes?: readonly string[];
    readonly repositoryScope?: GraphRepositoryScope;
}

export interface WorktreeDetailsRequest {
    readonly type: 'graph/worktreeDetailsRequest';
    readonly requestId: RequestId;
    readonly path: string;
    readonly repositoryScope?: GraphRepositoryScope;
}

// ── Webview → Extension (commands — no response expected) ──────────────────

export type BranchCommand =
    | 'checkout' | 'newBranchFrom' | 'checkoutRebaseOnto'
    | 'compareWithCurrent' | 'showDiffWithWorkingTree'
    | 'delete' | 'rename' | 'push' | 'update'
    | 'rebaseOnto' | 'mergeInto'
    | 'newWorktreeFromBranch'
    | 'openBranchWorktree'
    | 'revealBranchWorktree'
    | 'compareBranchWithWorktree'
    | 'showDiffWithBranchWorktree'
    | 'pullBranchWorktree'
    | 'pushBranchWorktree'
    | 'lockBranchWorktree'
    | 'unlockBranchWorktree'
    | 'removeBranchWorktree';

export interface BranchCommandRequest {
    readonly type: 'graph/branchCommand';
    readonly command: BranchCommand;
    readonly branch: string;
    readonly isRemote: boolean;
    readonly repositoryScope?: GraphRepositoryScope;
}

export type WorktreeCommand =
    | 'open'
    | 'openInNewWindow'
    | 'reveal'
    | 'showDiffWithHead'
    | 'showDiffWithMainWorktree'
    | 'fetch'
    | 'pull'
    | 'push'
    | 'commit'
    | 'stash'
    | 'newBranch'
    | 'checkoutBranch'
    | 'lock'
    | 'unlock'
    | 'add'
    | 'remove'
    | 'removeForce';

export interface WorktreeCommandRequest {
    readonly type: 'graph/worktreeCommand';
    readonly command: WorktreeCommand;
    readonly path?: string;
    readonly repositoryScope?: GraphRepositoryScope;
}

export type CommitCommand =
    | 'copyRevisionNumber'
    | 'createPatch'
    | 'explainDiff'
    | 'cherryPick'
    | 'checkoutRevision'
    | 'showRepositoryAtRevision'
    | 'compareWithLocal'
    | 'resetCurrentBranchToHere'
    | 'revertCommit'
    | 'undoCommit'
    | 'editCommitMessage'
    | 'fixup'
    | 'squashInto'
    | 'dropCommit'
    | 'interactiveRebaseFromHere'
    | 'pushAllUpToHere'
    | 'newBranch'
    | 'newTag'
    | 'newWorktreeFromCommit'
    | 'compareCommitWithWorktree';

export interface CommitCommandRequest {
    readonly type: 'graph/commitCommand';
    readonly command: CommitCommand;
    readonly hash: string;
    readonly hashes: readonly string[];
    readonly repositoryScope?: GraphRepositoryScope;
}

export interface OpenDiffRequest {
    readonly type: 'graph/openDiff';
    readonly filePath: string;
    readonly commitHash: string;
    readonly status: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly repositoryScope?: GraphRepositoryScope;
}

export interface OpenWorktreeDiffRequest {
    readonly type: 'graph/openWorktreeDiff';
    readonly worktreePath: string;
    readonly filePath: string;
    readonly status: string;
    readonly origPath?: string;
    readonly repositoryScope?: GraphRepositoryScope;
}

export interface GraphReadyMessage {
    readonly type: 'graph/ready';
}

export interface GraphRefreshMessage {
    readonly type: 'graph/refresh';
}

export interface GraphShowOutputMessage {
    readonly type: 'graph/showOutput';
}

export interface GraphContextTargetMessage {
    readonly type: 'graph/contextTarget';
    readonly target: GraphContextTarget;
}

export type GraphRepositoryCommand = 'fetch';

export interface GraphRepositoryCommandRequest {
    readonly type: 'graph/repositoryCommand';
    readonly command: GraphRepositoryCommand;
    readonly repositoryScope?: GraphRepositoryScope;
}

// ── Union types ─────────────────────────────────────────────────────────────

export type GraphExtensionToWebviewMessage =
    | RepoContextChangedPush
    | WebviewFontSizeChangedPush
    | GraphRefreshRequestedPush
    | GraphDataPush
    | GraphSubmodulesPush
    | GraphDataResponse
    | CommitDetailsResponse
    | WorktreeDetailsResponse
    | GraphSelectCommitPush
    | GraphSelectWorktreePush
    | GraphOperationStatusPush
    | GraphErrorPush
    | ErrorMessage;

export type GraphWebviewToExtensionMessage =
    | GraphReadyMessage
    | GraphRefreshMessage
    | GraphShowOutputMessage
    | GraphDataRequest
    | LoadMoreGraphRequest
    | CommitDetailsRequest
    | WorktreeDetailsRequest
    | GraphContextTargetMessage
    | GraphRepositoryCommandRequest
    | BranchCommandRequest
    | WorktreeCommandRequest
    | CommitCommandRequest
    | OpenDiffRequest
    | OpenWorktreeDiffRequest;
