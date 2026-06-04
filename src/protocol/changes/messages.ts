import type { RequestId, ErrorMessage, ProtocolError } from '../shared/base';
import type { SerializedRepoContext } from '../shared/repo';
import type { WebviewFontSizeChangedPush } from '../shared/ui';
import type { StatusData, CommitMode, StashFileEntry, ConflictState, SubmoduleStatusData, ChangesContextTarget } from './types';

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

export interface GeneratedCommitMessageResponse {
    readonly type: 'changes/generatedCommitMessage';
    readonly requestId: RequestId;
    readonly message: string;
}

export interface SubmoduleGeneratedCommitMessageResponse {
    readonly type: 'changes/submoduleGeneratedCommitMessage';
    readonly requestId: RequestId;
    readonly path: string;
    readonly message: string;
}

export interface SubmoduleCommitResultPush {
    readonly type: 'changes/submoduleCommitResult';
    readonly path: string;
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

export interface SubmoduleStatusResponse {
    readonly type: 'changes/submoduleStatusData';
    readonly requestId: RequestId;
    readonly path: string;
    readonly data: SubmoduleStatusData;
}

export interface SubmoduleStashFilesResponse {
    readonly type: 'changes/submoduleStashFiles';
    readonly requestId: RequestId;
    readonly path: string;
    readonly index: number;
    readonly files: readonly StashFileEntry[];
}

export interface ChangesErrorPush {
    readonly type: 'changes/error';
    readonly requestId?: RequestId;
    readonly message: string;
    readonly error: ProtocolError;
}

export type ChangesViewPreference = 'list' | 'tree';
export type ChangesSortPreference = 'name' | 'path' | 'status' | 'extension' | 'directory';

export interface ApplyViewModePush {
    readonly type: 'changes/applyViewMode';
    readonly viewMode: ChangesViewPreference;
}

export interface ApplySortModePush {
    readonly type: 'changes/applySortMode';
    readonly sortMode: ChangesSortPreference;
}

export interface FocusCommitComposerPush {
    readonly type: 'changes/focusCommitComposer';
}

export interface FocusSubmoduleCommitComposerPush {
    readonly type: 'changes/focusSubmoduleCommitComposer';
    readonly path: string;
}

// ── Webview → Extension (commands — no response expected unless noted) ──────

export interface ChangesReadyMessage    { readonly type: 'changes/ready'; }
export interface ViewModeChangedMessage { readonly type: 'changes/viewModeChanged'; readonly asTree: boolean; }
export interface ChangesPreferencesChangedMessage {
    readonly type: 'changes/preferencesChanged';
    readonly viewMode: ChangesViewPreference;
    readonly sortMode: ChangesSortPreference;
}
export type ChangesToolbarCommand =
    | 'openGraph'
    | 'pull'
    | 'push'
    | 'clone'
    | 'checkout'
    | 'fetch'
    | 'sync'
    | 'pullRebase'
    | 'pullFrom'
    | 'pushForce'
    | 'pushTo'
    | 'pushToForce'
    | 'fetchPrune'
    | 'fetchAll'
    | 'undoLastCommit'
    | 'abortRebase'
    | 'mergeBranch'
    | 'rebaseBranch'
    | 'createBranch'
    | 'createBranchFrom'
    | 'renameBranch'
    | 'deleteBranch'
    | 'deleteRemoteBranch'
    | 'publishBranch'
    | 'addRemote'
    | 'removeRemote'
    | 'stash'
    | 'stashIncludeUntracked'
    | 'stashStaged'
    | 'applyLatestStash'
    | 'applyStash'
    | 'popLatestStash'
    | 'popStash'
    | 'dropStash'
    | 'dropAllStashes'
    | 'viewStash'
    | 'createTag'
    | 'deleteTag'
    | 'deleteRemoteTag'
    | 'pushTags'
    | 'showGitOutput';
export interface ChangesToolbarCommandMessage {
    readonly type: 'changes/toolbarCommand';
    readonly command: ChangesToolbarCommand;
}
export interface ChangesContextTargetMessage {
    readonly type: 'changes/contextTarget';
    readonly target: ChangesContextTarget;
}
export interface SubmoduleToolbarCommandMessage {
    readonly type: 'changes/submoduleToolbarCommand';
    readonly submodulePath: string;
    readonly command: ChangesToolbarCommand;
}
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

export interface GenerateCommitMessageRequest {
    readonly type: 'changes/generateCommitMessage';
    readonly requestId: RequestId;
}

export interface GenerateSubmoduleCommitMessageRequest {
    readonly type: 'changes/generateSubmoduleCommitMessage';
    readonly requestId: RequestId;
    readonly submodulePath: string;
}

export interface SubmoduleCommitMessage {
    readonly type: 'changes/submoduleCommit';
    readonly submodulePath: string;
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
    readonly isSubmodule?: boolean;
    readonly isStaged: boolean;
    readonly indexStatus: string;
    readonly workTreeStatus: string;
}

export interface OpenSubmoduleDiffMessage {
    readonly type: 'changes/openSubmoduleDiff';
    readonly submodulePath: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly isStaged: boolean;
    readonly indexStatus: string;
    readonly workTreeStatus: string;
}

export interface SubmoduleFileMessage {
    readonly type:
        | 'changes/submoduleOpenFile'
        | 'changes/submoduleStageFile'
        | 'changes/submoduleUnstageFile'
        | 'changes/submoduleDiscardFile'
        | 'changes/submoduleOpenMergeEditor'
        | 'changes/submoduleMarkResolved'
        | 'changes/submoduleAcceptOurs'
        | 'changes/submoduleAcceptTheirs';
    readonly submodulePath: string;
    readonly filePath: string;
}

export interface SubmoduleBulkMessage {
    readonly type:
        | 'changes/submoduleStageAll'
        | 'changes/submoduleUnstageAll'
        | 'changes/submoduleDiscardAll'
        | 'changes/submoduleAcceptAllTheirs';
    readonly submodulePath: string;
}

export interface StashMessage         { readonly type: 'changes/stash'; readonly message?: string; }
export interface StashStagedMessage   { readonly type: 'changes/stashStaged'; readonly message?: string; }
export interface StashSelectedFilesMessage {
    readonly type: 'changes/stashSelectedFiles';
    readonly filePaths: readonly string[];
    readonly includeUntracked: boolean;
    readonly message?: string;
}
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

export interface SubmoduleStashMessage       { readonly type: 'changes/submoduleStash'; readonly submodulePath: string; readonly message?: string; }
export interface SubmoduleStashPopMessage    { readonly type: 'changes/submoduleStashPop'; readonly submodulePath: string; readonly index: number; }
export interface SubmoduleStashApplyMessage  { readonly type: 'changes/submoduleStashApply'; readonly submodulePath: string; readonly index: number; }
export interface SubmoduleStashDropMessage   { readonly type: 'changes/submoduleStashDrop'; readonly submodulePath: string; readonly index: number; }
export interface GetSubmoduleStashFilesRequest {
    readonly type: 'changes/getSubmoduleStashFiles';
    readonly requestId: RequestId;
    readonly submodulePath: string;
    readonly index: number;
}
export interface OpenSubmoduleStashDiffMessage {
    readonly type: 'changes/openSubmoduleStashDiff';
    readonly submodulePath: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly index: number;
    readonly status: string;
}

export interface ContinueOpMessage { readonly type: 'changes/continueOp'; readonly conflictState: ConflictState; }
export interface AbortOpMessage    { readonly type: 'changes/abortOp'; readonly conflictState: ConflictState; }
export interface SubmoduleContinueOpMessage { readonly type: 'changes/submoduleContinueOp'; readonly submodulePath: string; readonly conflictState: ConflictState; }
export interface SubmoduleAbortOpMessage    { readonly type: 'changes/submoduleAbortOp'; readonly submodulePath: string; readonly conflictState: ConflictState; }

export interface SubmoduleUpdateMessage    { readonly type: 'changes/submoduleUpdate'; readonly path: string; }
export interface SubmoduleUpdateAllMessage { readonly type: 'changes/submoduleUpdateAll'; }
export interface GetSubmoduleStatusRequest {
    readonly type: 'changes/getSubmoduleStatus';
    readonly requestId: RequestId;
    readonly path: string;
}

// ── Union types ─────────────────────────────────────────────────────────────

export type ChangesExtensionToWebviewMessage =
    | RepoContextChangedPush
    | WebviewFontSizeChangedPush
    | StatusDataPush
    | CommitResultPush
    | GeneratedCommitMessageResponse
    | SubmoduleCommitResultPush
    | SubmoduleGeneratedCommitMessageResponse
    | StashFilesResponse
    | SubmoduleStatusResponse
    | SubmoduleStashFilesResponse
    | ApplyViewModePush
    | ApplySortModePush
    | FocusCommitComposerPush
    | FocusSubmoduleCommitComposerPush
    | ChangesErrorPush
    | ErrorMessage;

export type ChangesWebviewToExtensionMessage =
    | ChangesReadyMessage | ViewModeChangedMessage | ChangesPreferencesChangedMessage | ChangesToolbarCommandMessage | ChangesContextTargetMessage | SubmoduleToolbarCommandMessage
    | StageFileMessage | UnstageFileMessage | StageFilesMessage | UnstageFilesMessage | StageAllMessage | UnstageAllMessage
    | DiscardFileMessage | DiscardFilesMessage | DiscardAllMessage
    | MarkResolvedMessage | MarkResolvedFilesMessage
    | AcceptOursMessage | AcceptTheirsMessage | AcceptOursFilesMessage | AcceptTheirsFilesMessage | AcceptAllTheirsMessage
    | CommitMessage | GenerateCommitMessageRequest | SubmoduleCommitMessage | GenerateSubmoduleCommitMessageRequest | OpenFileMessage | OpenSubmoduleMessage | OpenMergeEditorMessage | OpenDiffMessage | OpenSubmoduleDiffMessage
    | SubmoduleFileMessage | SubmoduleBulkMessage
    | StashMessage | StashStagedMessage | StashSelectedFilesMessage | StashPopMessage | StashApplyMessage | StashDropMessage
    | GetStashFilesRequest | OpenStashDiffMessage
    | SubmoduleStashMessage | SubmoduleStashPopMessage | SubmoduleStashApplyMessage | SubmoduleStashDropMessage
    | GetSubmoduleStashFilesRequest | OpenSubmoduleStashDiffMessage
    | ContinueOpMessage | AbortOpMessage | SubmoduleContinueOpMessage | SubmoduleAbortOpMessage
    | SubmoduleUpdateMessage | SubmoduleUpdateAllMessage | GetSubmoduleStatusRequest;
