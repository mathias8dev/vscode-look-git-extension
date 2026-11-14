import { ComparisonMode } from '@protocol/comparison/types';
import type { ComparisonState } from '@webview/features/comparison/comparison-state';
import { reviewKey } from '@webview/features/comparison/comparison-state';

interface ComparisonFileSummaryProps {
    readonly state: ComparisonState;
    readonly onReview: (path: string) => void;
    readonly onOpen: () => void;
}

export function ComparisonFileSummary({ state, onReview, onOpen }: ComparisonFileSummaryProps) {
    const file = state.files?.items.find(item => item.filePath === state.selectedFile);
    if (!file) {
        const sameBranch = state.snapshot?.baseHash === state.snapshot?.headHash;
        const description = state.fileSearch ? 'Try another search to find changed files.' : sameBranch
            ? 'Both selected branches point to the same commit.'
            : state.snapshot?.mode === ComparisonMode.SinceDivergence
                ? 'This branch has no file changes since its common ancestor with the base.'
                : 'The latest commits of these branches contain the same files.';
        return (
            <div className="comparison-empty">
                <h2>{state.pending.files ? 'Loading files…' : 'No changes to review'}</h2>
                <p className="comparison-muted">{state.pending.files ? 'Searching the complete comparison.' : description}</p>
            </div>
        );
    }
    const binary = !file.isSubmodule && (file.additions === null || file.deletions === null);
    return (
        <>
            <header className="comparison-preview-toolbar">
                <code title={file.filePath}>{file.filePath}</code>
                <span className="comparison-spacer" />
                <label><input type="checkbox" checked={state.reviewed.includes(reviewKey(state, file.filePath))} onChange={() => onReview(file.filePath)} />Viewed</label>
            </header>
            <div className="comparison-special">
                {file.isSubmodule ? (
                    <>
                        <h2>Submodule reference changed</h2>
                        <dl>
                            <dt>Before</dt><dd><code>{revisionLabel(file.oldRevision)}</code></dd>
                            <dt>After</dt><dd><code>{revisionLabel(file.newRevision)}</code></dd>
                        </dl>
                    </>
                ) : binary ? (
                    <><h2>Binary file changed</h2><p className="comparison-muted">A text diff is unavailable for binary contents.</p></>
                ) : (
                    <>
                        <p className="comparison-muted">Click a file to open its changes in the VS Code diff editor.</p>
                        {file.origPath ? <p><code>{file.origPath} → {file.filePath}</code></p> : null}
                        <p><span className="comparison-add">+{file.additions}</span>{' '}<span className="comparison-delete">−{file.deletions}</span></p>
                        <button type="button" className="comparison-button" onClick={onOpen} disabled={Boolean(state.pending.open)}>
                            <i className="codicon codicon-go-to-file" aria-hidden="true" />Open diff
                        </button>
                    </>
                )}
            </div>
        </>
    );
}

function revisionLabel(revision: string | undefined): string { return !revision || /^0+$/.test(revision) ? 'Not present' : revision; }
