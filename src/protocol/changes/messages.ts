import type { RequestId, ErrorMessage, ProtocolError } from '../shared/base';
import type { SerializedRepoContext } from '../shared/repo';
import type { StatusData, CommitMode, StashFileEntry, ConflictState } from './types';

// ── Extension → Webview (push) ──────────────────────────────────────────────

export interface RepoContextChangedPush {
    readonly type: 'repo/contextChanged';
    readonly context: SerializedRepoContext;
}

export interface StatusDataPush {
    readonly type: 'changes/statusData';
    readonly data: StatusData;
}

export interface CommitResultPush {
    readonly type: 'changes/commitResult';
    readonly success: boolean;
    readonly message?: string;
    readonly error?: ProtocolError;
}

export interface StashFilesResponse {
    readonly type: 'changes/stashFiles';
    readonly requestId: RequestId;
    readonly index: number;
    readonly files: readonly StashFileEntry[];
}

export interface ChangesErrorPush {
    readonly type: 'changes/error';
    readonly requestId?: RequestId;
    readonly message: string;
    readonly error: ProtocolError;
}

// ── Webview → Extension (commands — no response expected unless noted) ──────

export interface ChangesReadyMessage    { readonly type: 'changes/ready'; }
export interface ViewModeChangedMessage { readonly type: 'changes/viewModeChanged'; readonly asTree: boolean; }
export interface StageFileMessage       { readonly type: 'changes/stageFile'; readonly filePath: string; }
export interface UnstageFileMessage     { readonly type: 'changes/unstageFile'; readonly filePath: string; }
export interface StageFilesMessage      { readonly type: 'changes/stageFiles'; readonly filePaths: readonly string[]; }
export interface UnstageFilesMessage    { readonly type: 'changes/unstageFiles'; readonly filePaths: readonly string[]; }
export interface StageAllMessage        { readonly type: 'changes/stageAll'; }
export interface UnstageAllMessage      { readonly type: 'changes/unstageAll'; }
export interface DiscardFileMessage     { readonly type: 'changes/discardFile'; readonly filePath: string; }
export interface DiscardFilesMessage    { readonly type: 'changes/discardFiles'; readonly filePaths: readonly string[]; }
export interface DiscardAllMessage      { readonly type: 'changes/discardAll'; }
export interface MarkResolvedMessage    { readonly type: 'changes/markResolved'; readonly filePath: string; }
export interface MarkResolvedFilesMessage { readonly type: 'changes/markResolvedFiles'; readonly filePaths: readonly string[]; }
export interface AcceptOursMessage      { readonly type: 'changes/acceptOurs'; readonly filePath: string; }
export interface AcceptTheirsMessage    { readonly type: 'changes/acceptTheirs'; readonly filePath: string; }
export interface AcceptOursFilesMessage { readonly type: 'changes/acceptOursFiles'; readonly filePaths: readonly string[]; }
export interface AcceptTheirsFilesMessage { readonly type: 'changes/acceptTheirsFiles'; readonly filePaths: readonly string[]; }
export interface AcceptAllTheirsMessage { readonly type: 'changes/acceptAllTheirs'; }

export interface CommitMessage {
    readonly type: 'changes/commit';
    readonly message: string;
    readonly mode: CommitMode;
}

export interface OpenFileMessage     { readonly type: 'changes/openFile'; readonly filePath: string; }
export interface OpenSubmoduleMessage { readonly type: 'changes/openSubmodule'; readonly filePath: string; }
export interface OpenMergeEditorMessage { readonly type: 'changes/openMergeEditor'; readonly filePath: string; }

export interface OpenDiffMessage {
    readonly type: 'changes/openDiff';
    readonly filePath: string;
    readonly origPath?: string;
    readonly isStaged: boolean;
    readonly indexStatus: string;
    readonly workTreeStatus: string;
}

export interface StashMessage         { readonly type: 'changes/stash'; readonly message?: string; }
export interface StashStagedMessage   { readonly type: 'changes/stashStaged'; readonly message?: string; }
export interface StashPopMessage      { readonly type: 'changes/stashPop'; readonly index: number; }
export interface StashApplyMessage    { readonly type: 'changes/stashApply'; readonly index: number; }
export interface StashDropMessage     { readonly type: 'changes/stashDrop'; readonly index: number; }

export interface GetStashFilesRequest {
    readonly type: 'changes/getStashFiles';
    readonly requestId: RequestId;
    readonly index: number;
}

export interface OpenStashDiffMessage {
    readonly type: 'changes/openStashDiff';
    readonly filePath: string;
    readonly origPath?: string;
    readonly index: number;
    readonly status: string;
}

export interface ContinueOpMessage { readonly type: 'changes/continueOp'; readonly conflictState: ConflictState; }
export interface AbortOpMessage    { readonly type: 'changes/abortOp'; readonly conflictState: ConflictState; }

// ── Union types ─────────────────────────────────────────────────────────────

export type ChangesExtensionToWebviewMessage =
    | RepoContextChangedPush
    | StatusDataPush
    | CommitResultPush
    | StashFilesResponse
    | ChangesErrorPush
    | ErrorMessage;

export type ChangesWebviewToExtensionMessage =
    | ChangesReadyMessage | ViewModeChangedMessage
    | StageFileMessage | UnstageFileMessage | StageFilesMessage | UnstageFilesMessage | StageAllMessage | UnstageAllMessage
    | DiscardFileMessage | DiscardFilesMessage | DiscardAllMessage
    | MarkResolvedMessage | MarkResolvedFilesMessage
    | AcceptOursMessage | AcceptTheirsMessage | AcceptOursFilesMessage | AcceptTheirsFilesMessage | AcceptAllTheirsMessage
    | CommitMessage | OpenFileMessage | OpenSubmoduleMessage | OpenMergeEditorMessage | OpenDiffMessage
    | StashMessage | StashStagedMessage | StashPopMessage | StashApplyMessage | StashDropMessage
    | GetStashFilesRequest | OpenStashDiffMessage
    | ContinueOpMessage | AbortOpMessage;
