import type { RequestId, ErrorMessage } from '../shared/base';
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

// ── Webview → Extension (commands — no response expected) ──────────────────

export type BranchCommand =
    | 'checkout' | 'newBranchFrom' | 'checkoutRebaseOnto'
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

export type SubmoduleCommand = 'open' | 'initialize' | 'update' | 'fetch' | 'updateAll';

export interface SubmoduleCommandRequest {
    readonly type: 'graph/submoduleCommand';
    readonly command: SubmoduleCommand;
    readonly path?: string;
}

export interface OpenDiffRequest {
    readonly type: 'graph/openDiff';
    readonly filePath: string;
    readonly commitHash: string;
    readonly status: string;
    readonly origPath?: string;
    readonly parentHash?: string;
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
    | GraphErrorPush
    | ErrorMessage;

export type GraphWebviewToExtensionMessage =
    | GraphReadyMessage
    | GraphRefreshMessage
    | GraphDataRequest
    | LoadMoreGraphRequest
    | CommitDetailsRequest
    | BranchCommandRequest
    | WorktreeCommandRequest
    | SubmoduleCommandRequest
    | OpenDiffRequest;
