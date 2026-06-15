import { Codicon } from '../../shared/Codicon';

interface VisualRebaseConflictListProps {
    readonly conflictFiles: readonly string[];
    readonly running: boolean;
    readonly onOpenMergeEditor: (filePath: string) => void;
    readonly onMarkResolved: (filePath: string) => void;
    readonly onAcceptCurrent: (filePath: string) => void;
    readonly onAcceptIncoming: (filePath: string) => void;
}

export function VisualRebaseConflictList({
    conflictFiles,
    running,
    onOpenMergeEditor,
    onMarkResolved,
    onAcceptCurrent,
    onAcceptIncoming,
}: VisualRebaseConflictListProps) {
    const conflictCount = conflictFiles.length;
    return (
        <section className="visual-rebase-conflicts" aria-label="Rebase conflict actions">
            <div className="visual-rebase-conflict-heading">
                <div>
                    <strong>Resolve conflicts</strong>
                    <span>{conflictCount === 1 ? '1 conflict remaining' : `${conflictCount} conflicts remaining`}</span>
                </div>
                <span className="visual-rebase-conflict-badge">{conflictCount}</span>
            </div>
            <ul className="visual-rebase-conflict-list">
                {conflictFiles.map((filePath) => (
                    <li key={filePath} className="visual-rebase-conflict-row">
                        <div className="visual-rebase-conflict-file">
                            <Codicon name="warning" />
                            <code>{filePath}</code>
                            <span>Unresolved</span>
                        </div>
                        <div className="visual-rebase-conflict-actions">
                            <button type="button" className="visual-rebase-primary" disabled={running} onClick={() => onOpenMergeEditor(filePath)}>
                                <Codicon name="git-merge" />
                                <span>Open Merge Editor</span>
                            </button>
                            <button type="button" className="visual-rebase-button" title="Keep the current branch version" disabled={running} onClick={() => onAcceptCurrent(filePath)}>Accept Current</button>
                            <button type="button" className="visual-rebase-button" title="Keep the replayed commit version" disabled={running} onClick={() => onAcceptIncoming(filePath)}>Accept Incoming</button>
                            <button type="button" className="visual-rebase-button" disabled={running} onClick={() => onMarkResolved(filePath)}>
                                <Codicon name="check" />
                                <span>Mark Resolved</span>
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
