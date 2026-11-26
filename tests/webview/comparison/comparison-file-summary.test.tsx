import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { comparisonSnapshot, comparisonStateFixture } from '@tests/helpers/comparison-state-fixture';
import { ComparisonFileSummary } from '@webview/features/comparison/comparison-file-summary';

describe('ComparisonFileSummary', () => {
    it('offers the native diff reader when Git cannot provide line counts', () => {
        const state = comparisonStateFixture();
        const markup = renderToStaticMarkup(<ComparisonFileSummary
            state={{
                ...state,
                files: { ...comparisonSnapshot.files, items: [{ status: 'M', filePath: 'secret.txt', additions: null, deletions: null }] },
                selectedFile: 'secret.txt',
            }}
            onReview={() => undefined}
            onOpen={() => undefined}
        />);
        expect(markup).toContain('Open diff');
        expect(markup).toContain('Line counts unavailable.');
        expect(markup).not.toContain('Binary file changed');
    });
});
