import { SubmoduleStatus } from '@protocol/shared/repo';
import type { GraphSubmoduleInfo } from '@protocol/graph/types';

interface GraphSubmoduleNodeProps {
    readonly submodule: GraphSubmoduleInfo;
    readonly selectedSubmodulePath: string | undefined;
    readonly onSelectSubmodule: (submodule: GraphSubmoduleInfo) => void;
}

export function GraphSubmoduleNode({
    submodule,
    selectedSubmodulePath,
    onSelectSubmodule,
}: GraphSubmoduleNodeProps) {
    const selected = selectedSubmodulePath === submodule.path;
    const selectSubmodule = () => onSelectSubmodule(submodule);

    return (
        <div className="graph-submodule-node">
            <button
                type="button"
                className={`graph-resource-row graph-resource-row-clickable graph-submodule-row${selected ? ' graph-resource-row-selected' : ''}`}
                title={submodule.path}
                aria-label={`Open ${submodule.name} graph`}
                onClick={selectSubmodule}
            >
                <i className="codicon codicon-file-submodule branch-leaf-icon" aria-hidden="true" />
                <span className="branch-node-name">{submodule.name}</span>
                <span
                    className={`graph-submodule-status graph-submodule-status-${submodule.status}`}
                    title={statusLabel(submodule.status)}
                >
                    {statusLabel(submodule.status)}
                </span>
                <span className="graph-resource-badge" title={`${submodule.branches.length} branches`}>
                    {submodule.branches.length}b
                </span>
                <span className="graph-resource-badge" title={`${submodule.worktrees.length} worktrees`}>
                    {submodule.worktrees.length}w
                </span>
            </button>
        </div>
    );
}

function statusLabel(status: SubmoduleStatus): string {
    switch (status) {
        case SubmoduleStatus.Clean: return 'clean';
        case SubmoduleStatus.Dirty: return 'dirty';
        case SubmoduleStatus.OutOfSync: return 'out-of-sync';
        case SubmoduleStatus.NotInitialized: return 'not init';
    }
}
