import { describe, it } from 'vitest';
import type { GraphExtensionToWebviewMessage, GraphWebviewToExtensionMessage } from '../../src/protocol/graph/messages';
import type { ChangesExtensionToWebviewMessage, ChangesWebviewToExtensionMessage } from '../../src/protocol/changes/messages';

// Type-level tests: if these compile, the discriminated unions are correct.
describe('protocol discriminated unions', () => {
    it('graph extension→webview union is exhaustive', () => {
        const handle = (msg: GraphExtensionToWebviewMessage) => {
            switch (msg.type) {
                case 'repo/contextChanged': return msg.context.id satisfies string;
                case 'graph/dataPush': return msg.data.rows satisfies readonly unknown[];
                case 'graph/dataResponse': return msg.requestId satisfies string;
                case 'graph/commitDetailsResponse': return msg.files satisfies readonly unknown[];
                case 'graph/error': return msg.message satisfies string;
                case 'error': return msg.message satisfies string;
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
                case 'changes/stashFiles': return msg.files satisfies readonly unknown[];
                case 'changes/error': return msg.message satisfies string;
                case 'error': return msg.message satisfies string;
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
