import { useRef, useState, type ReactNode } from 'react';
import type { ChangeSectionId } from '@webview/features/changes/change-tree';
import { ResizablePanel } from '@webview/shared/resizable-panel';
import { ResizeAxis } from '@webview/shared/resize-axis';
import { ResizeHandleSide } from '@webview/shared/resize-handle-side';

interface ResizableChangesListProps {
    readonly id: ChangeSectionId | 'stashes' | 'submodules';
    readonly title: string;
    readonly submodulePath?: string;
    readonly children: ReactNode;
}

export function ResizableChangesList({ id, title, submodulePath, children }: ResizableChangesListProps) {
    const content = useRef<HTMLDivElement>(null);
    const [resized, setResized] = useState(false);
    const scope = submodulePath ? `submodule.${encodeURIComponent(submodulePath)}.` : '';
    const label = `Resize ${title} list${submodulePath ? ` in ${submodulePath}` : ''}`;
    return <ResizablePanel
        storageKey={`lookGit.changes.${scope}${id}.maxHeight`}
        defaultSize={240}
        minSize={48}
        maxSize={900}
        axis={ResizeAxis.Vertical}
        handleSide={ResizeHandleSide.End}
        ariaLabel={label}
        title="Drag or use arrow keys to resize this list"
        getCurrentSize={() => content.current?.getBoundingClientRect().height || undefined}
        onSizeChange={() => setResized(true)}
    >
        {style => <div ref={content} className="changes-resizable-list" style={resized ? style : { maxHeight: style.height }}>{children}</div>}
    </ResizablePanel>;
}
