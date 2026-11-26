import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GraphOperationCategory, TagCommand } from '@protocol/graph/messages';
import { OperationStatus } from '@protocol/shared/operation';
import { GraphOperationNotice } from '@webview/features/graph/graph-operation-notice';

describe('Graph tag operation feedback', () => {
    it('describes tag deletion as deletion rather than detached checkout', () => {
        const markup = renderToStaticMarkup(<GraphOperationNotice operation={{
            type: 'graph/operationStatus', operationId: 'delete-tag', category: GraphOperationCategory.Tag,
            command: TagCommand.Delete, target: 'v1', status: OperationStatus.Success,
        }} onShowOutput={() => {}} onDismiss={() => {}} />);

        expect(markup).toContain('Deleted tag v1.');
        expect(markup).not.toContain('detached HEAD');
    });
});
