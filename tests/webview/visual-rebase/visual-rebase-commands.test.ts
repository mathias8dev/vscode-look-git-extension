import { describe, expect, it } from 'vitest';
import { messageForVisualRebaseAbort, messageForVisualRebaseAcceptIncoming, messageForVisualRebaseAcceptYours, messageForVisualRebaseCancel, messageForVisualRebaseContinue, messageForVisualRebaseMarkResolved, messageForVisualRebaseOpenFile, messageForVisualRebaseOpenMergeEditor, messageForVisualRebasePreview, messageForVisualRebaseReady, messageForVisualRebaseSkip, messageForVisualRebaseStart } from '@webview/visual-rebase/visual-rebase-commands';

describe('visual rebase commands', () => {
    it('serializes ready cancel and start messages', () => {
        const plan = [{ hash: 'abc123456789', action: 'pick', message: 'feat: keep' }] as const;

        expect(messageForVisualRebaseReady()).toEqual({ type: 'visualRebase/ready' });
        expect(messageForVisualRebaseCancel()).toEqual({ type: 'visualRebase/cancel' });
        expect(messageForVisualRebaseContinue()).toEqual({ type: 'visualRebase/continue' });
        expect(messageForVisualRebaseAbort()).toEqual({ type: 'visualRebase/abort' });
        expect(messageForVisualRebaseSkip()).toEqual({ type: 'visualRebase/skip' });
        expect(messageForVisualRebaseOpenMergeEditor('src/app.ts')).toEqual({
            type: 'visualRebase/openMergeEditor',
            filePath: 'src/app.ts',
        });
        expect(messageForVisualRebaseOpenFile('src/app.ts')).toEqual({
            type: 'visualRebase/openFile',
            filePath: 'src/app.ts',
        });
        expect(messageForVisualRebaseMarkResolved('src/app.ts')).toEqual({
            type: 'visualRebase/markResolved',
            filePath: 'src/app.ts',
        });
        expect(messageForVisualRebaseAcceptYours('src/app.ts')).toEqual({
            type: 'visualRebase/acceptYours',
            filePath: 'src/app.ts',
        });
        expect(messageForVisualRebaseAcceptIncoming('src/app.ts')).toEqual({
            type: 'visualRebase/acceptIncoming',
            filePath: 'src/app.ts',
        });
        expect(messageForVisualRebaseStart('main', 'origin/main', plan)).toEqual({
            type: 'visualRebase/start',
            rewriteAfter: 'main',
            replayOnto: 'origin/main',
            plan,
        });
        expect(messageForVisualRebasePreview('req-1', 'main', 'origin/main')).toEqual({
            type: 'visualRebase/previewRequest',
            requestId: 'req-1',
            rewriteAfter: 'main',
            replayOnto: 'origin/main',
        });
    });
});
