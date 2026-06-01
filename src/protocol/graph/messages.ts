import type { RequestId, ErrorMessage, ProtocolError } from '../shared/base';
import type { SerializedRepoContext } from '../shared/repo';
import type { GraphData, GraphFilters, GraphPage, CommitFileChange } from './types';

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

export interface GraphErrorPush {
    readonly type: 'graph/error';
    readonly requestId?: RequestId;
    readonly message: string;
    readonly error: ProtocolError;
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
}

export interface LoadMoreGraphRequest {
    readonly type: 'graph/loadMore';
    readonly requestId: RequestId;
    readonly repoId: string;
    readonly filters: GraphFilters;
    readonly page: GraphPage;
}

export interface CommitDetailsRequest {
    readonly type: 'graph/commitDetailsRequest';
    readonly requestId: RequestId;
    readonly hash: string;
    readonly selectedHashes?: readonly string[];
}

export interface WorktreeDetailsRequest {
    readonly type: 'graph/worktreeDetailsRequest';
    readonly requestId: RequestId;
    readonly path: string;
}

// ── Webview → Extension (commands — no response expected) ──────────────────

export type BranchCommand =
    | 'checkout' | 'newBranchFrom' | 'checkoutRebaseOnto'
    | 'compareWithCurrent' | 'showDiffWithWorkingTree'
    | 'delete' | 'rename' | 'push' | 'update'
    | 'rebaseOnto' | 'mergeInto';

export interface BranchCommandRequest {
    readonly type: 'graph/branchCommand';
    readonly command: BranchCommand;
    readonly branch: string;
    readonly isRemote: boolean;
}

export type WorktreeCommand = 'open' | 'add' | 'remove' | 'removeForce';

export interface WorktreeCommandRequest {
    readonly type: 'graph/worktreeCommand';
    readonly command: WorktreeCommand;
    readonly path?: string;
}

export type CommitCommand =
    | 'copyRevisionNumber'
    | 'createPatch'
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
    | 'newTag';

export interface CommitCommandRequest {
    readonly type: 'graph/commitCommand';
    readonly command: CommitCommand;
    readonly hash: string;
    readonly hashes: readonly string[];
}

export interface OpenDiffRequest {
    readonly type: 'graph/openDiff';
    readonly filePath: string;
    readonly commitHash: string;
    readonly status: string;
    readonly origPath?: string;
    readonly parentHash?: string;
}

export interface OpenWorktreeDiffRequest {
    readonly type: 'graph/openWorktreeDiff';
    readonly worktreePath: string;
    readonly filePath: string;
    readonly status: string;
    readonly origPath?: string;
}

export interface GraphReadyMessage {
    readonly type: 'graph/ready';
}

export interface GraphRefreshMessage {
    readonly type: 'graph/refresh';
}

// ── Union types ─────────────────────────────────────────────────────────────

export type GraphExtensionToWebviewMessage =
    | RepoContextChangedPush
    | GraphDataPush
    | GraphDataResponse
    | CommitDetailsResponse
    | WorktreeDetailsResponse
    | GraphErrorPush
    | ErrorMessage;

export type GraphWebviewToExtensionMessage =
    | GraphReadyMessage
    | GraphRefreshMessage
    | GraphDataRequest
    | LoadMoreGraphRequest
    | CommitDetailsRequest
    | WorktreeDetailsRequest
    | BranchCommandRequest
    | WorktreeCommandRequest
    | CommitCommandRequest
    | OpenDiffRequest
    | OpenWorktreeDiffRequest;
