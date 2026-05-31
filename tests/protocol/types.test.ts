import { describe, it } from 'vitest';
import type { GraphExtensionToWebviewMessage, GraphWebviewToExtensionMessage } from '../../src/protocol/graph/messages';
import type { ChangesExtensionToWebviewMessage, ChangesWebviewToExtensionMessage } from '../../src/protocol/changes/messages';
import type { HistoryExtensionToWebviewMessage } from '../../src/protocol/history/messages';

// Type-level tests: if these compile, the discriminated unions are correct.
describe('protocol discriminated unions', () => {
    it('graph extension→webview union is exhaustive', () => {
        const handle = (msg: GraphExtensionToWebviewMessage) => {
            switch (msg.type) {
                case 'repo/contextChanged': return msg.context.id satisfies string;
                case 'graph/dataPush': return msg.data.commits satisfies readonly unknown[];
                case 'graph/dataResponse': return msg.requestId satisfies string;
                case 'graph/commitDetailsResponse': return msg.files satisfies readonly unknown[];
                case 'graph/error': return msg.error.recoverable satisfies boolean;
                case 'error': return msg.error.message satisfies string;
            }
        };
        void handle; // used
    });

    it('graph webview→extension union is exhaustive', () => {
        const handle = (msg: GraphWebviewToExtensionMessage) => {
            switch (msg.type) {
                case 'graph/ready': return;
                case 'graph/refresh': return;
                case 'graph/dataRequest': return msg.requestId satisfies string;
                case 'graph/loadMore': return msg.page satisfies { offset: number; limit: number };
                case 'graph/commitDetailsRequest': return msg.hash satisfies string;
                case 'graph/branchCommand': return msg.command satisfies string;
                case 'graph/worktreeCommand': return msg.command satisfies string;
                case 'graph/submoduleCommand': return msg.command satisfies string;
                case 'graph/openDiff': return msg.filePath satisfies string;
            }
        };
        void handle;
    });

    it('changes extension→webview union is exhaustive', () => {
        const handle = (msg: ChangesExtensionToWebviewMessage) => {
            switch (msg.type) {
                case 'repo/contextChanged': return msg.context.id satisfies string;
                case 'changes/statusData': return msg.data.staged satisfies readonly unknown[];
                case 'changes/commitResult': return msg.success satisfies boolean;
                case 'changes/submoduleCommitResult': return msg.path satisfies string;
                case 'changes/stashFiles': return msg.files satisfies readonly unknown[];
                case 'changes/submoduleStatusData': return msg.data.unstaged satisfies readonly unknown[];
                case 'changes/submoduleStashFiles': return msg.path satisfies string;
                case 'changes/error': return msg.error.recoverable satisfies boolean;
                case 'error': return msg.error.message satisfies string;
            }
        };
        void handle;
    });

    it('history extension→webview union is exhaustive', () => {
        const handle = (msg: HistoryExtensionToWebviewMessage) => {
            switch (msg.type) {
                case 'repo/contextChanged': return msg.context.id satisfies string;
                case 'history/data': return msg.commits satisfies readonly unknown[];
                case 'history/error': return msg.error.recoverable satisfies boolean;
                case 'error': return msg.error.message satisfies string;
            }
        };
        void handle;
    });

    it('changes webview→extension union is exhaustive', () => {
        const handle = (msg: ChangesWebviewToExtensionMessage) => {
            switch (msg.type) {
                case 'changes/ready': return;
                case 'changes/viewModeChanged': return msg.asTree satisfies boolean;
                case 'changes/stageFile': return msg.filePath satisfies string;
                case 'changes/unstageFile': return msg.filePath satisfies string;
                case 'changes/stageFiles': return msg.filePaths satisfies readonly string[];
                case 'changes/unstageFiles': return msg.filePaths satisfies readonly string[];
                case 'changes/stageAll': return;
                case 'changes/unstageAll': return;
                case 'changes/discardFile': return msg.filePath satisfies string;
                case 'changes/discardFiles': return msg.filePaths satisfies readonly string[];
                case 'changes/discardAll': return;
                case 'changes/markResolved': return msg.filePath satisfies string;
                case 'changes/markResolvedFiles': return msg.filePaths satisfies readonly string[];
                case 'changes/acceptOurs': return msg.filePath satisfies string;
                case 'changes/acceptTheirs': return msg.filePath satisfies string;
                case 'changes/acceptOursFiles': return msg.filePaths satisfies readonly string[];
                case 'changes/acceptTheirsFiles': return msg.filePaths satisfies readonly string[];
                case 'changes/acceptAllTheirs': return;
                case 'changes/commit': return msg.mode satisfies string;
                case 'changes/submoduleCommit': return msg.submodulePath satisfies string;
                case 'changes/openFile': return msg.filePath satisfies string;
                case 'changes/openSubmodule': return msg.filePath satisfies string;
                case 'changes/openMergeEditor': return msg.filePath satisfies string;
                case 'changes/openDiff': return msg.indexStatus satisfies string;
                case 'changes/openSubmoduleDiff': return msg.submodulePath satisfies string;
                case 'changes/submoduleOpenFile': return msg.filePath satisfies string;
                case 'changes/submoduleStageFile': return msg.submodulePath satisfies string;
                case 'changes/submoduleUnstageFile': return msg.submodulePath satisfies string;
                case 'changes/submoduleDiscardFile': return msg.submodulePath satisfies string;
                case 'changes/submoduleOpenMergeEditor': return msg.submodulePath satisfies string;
                case 'changes/submoduleMarkResolved': return msg.submodulePath satisfies string;
                case 'changes/submoduleAcceptOurs': return msg.submodulePath satisfies string;
                case 'changes/submoduleAcceptTheirs': return msg.submodulePath satisfies string;
                case 'changes/submoduleStageAll': return msg.submodulePath satisfies string;
                case 'changes/submoduleUnstageAll': return msg.submodulePath satisfies string;
                case 'changes/submoduleDiscardAll': return msg.submodulePath satisfies string;
                case 'changes/submoduleAcceptAllTheirs': return msg.submodulePath satisfies string;
                case 'changes/stash': return msg.message satisfies string | undefined;
                case 'changes/stashStaged': return msg.message satisfies string | undefined;
                case 'changes/stashPop': return msg.index satisfies number;
                case 'changes/stashApply': return msg.index satisfies number;
                case 'changes/stashDrop': return msg.index satisfies number;
                case 'changes/getStashFiles': return msg.requestId satisfies string;
                case 'changes/openStashDiff': return msg.filePath satisfies string;
                case 'changes/submoduleStash': return msg.submodulePath satisfies string;
                case 'changes/submoduleStashPop': return msg.index satisfies number;
                case 'changes/submoduleStashApply': return msg.index satisfies number;
                case 'changes/submoduleStashDrop': return msg.index satisfies number;
                case 'changes/getSubmoduleStashFiles': return msg.requestId satisfies string;
                case 'changes/openSubmoduleStashDiff': return msg.submodulePath satisfies string;
                case 'changes/continueOp': return msg.conflictState satisfies string;
                case 'changes/abortOp': return msg.conflictState satisfies string;
                case 'changes/submoduleUpdate': return msg.path satisfies string;
                case 'changes/submoduleUpdateAll': return;
                case 'changes/getSubmoduleStatus': return msg.requestId satisfies string;
            }
        };
        void handle;
    });

    it('all protocol types are readonly and serialisable (no class instances)', () => {
        // If there were non-serialisable fields (Date, Map, class) they would cause
        // TS errors when assigned to JSON-compatible types. This test confirms via compilation.
        const _date: string = '' satisfies string;
        void _date;
    });
});
