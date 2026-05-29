import { vscodeApi } from '../../platform/vscodeHost';
import { bulkActionsFor, messageForBulkAction } from './changeCommands';
import { buildChangeTree, type ChangeSection } from './changeTree';
import type { ChangesViewMode } from './changesState';
import { ChangeRow } from './ChangeRow';
import { TreeNodeView } from './TreeNodeView';

interface ChangeSectionViewProps {
    readonly section: ChangeSection;
    readonly viewMode: ChangesViewMode;
}

export function ChangeSectionView({ section, viewMode }: ChangeSectionViewProps) {
    if (section.items.length === 0) { return null; }
    const tree = buildChangeTree(section.items);
    const bulkActions = bulkActionsFor(section);
    return (
        <section className="change-section" aria-labelledby={`${section.id}-title`}>
            <header className="change-section-header">
                <h2 id={`${section.id}-title`}>{section.title}</h2>
                <div className="section-actions">
                    {bulkActions.map((descriptor) => (
                        <button
                            key={descriptor.action}
                            type="button"
                            title={descriptor.title}
                            onClick={() => vscodeApi.postMessage(messageForBulkAction(descriptor.action))}
                        >
                            {descriptor.label}
                        </button>
                    ))}
                    <span>{section.items.length}</span>
                </div>
            </header>
            <div className="change-list">
                {viewMode === 'tree'
                    ? tree.map((node) => <TreeNodeView key={node.id} node={node} />)
                    : section.items.map((item) => <ChangeRow key={item.id} item={item} depth={0} />)}
            </div>
        </section>
    );
}
