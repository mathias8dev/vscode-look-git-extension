import { GRAPH_COLUMNS, type GraphColumnId } from '@webview/features/graph/graphTableColumns';
import { ResizablePanel } from '@webview/shared/ResizablePanel';
import { ResizeAxis } from '@webview/shared/resizeAxis';
import { ResizeHandleSide } from '@webview/shared/resizeHandleSide';

interface GraphColumnHeaderProps {
    readonly className: string;
    readonly column: GraphColumnId;
    readonly children: string;
    readonly onSizeChange: (column: GraphColumnId, width: number) => void;
}

export function GraphColumnHeader({
    className,
    column,
    children,
    onSizeChange,
}: GraphColumnHeaderProps) {
    const config = GRAPH_COLUMNS[column];
    return (
        <div className="graph-header-resizable-column">
            <ResizablePanel
                storageKey={config.storageKey}
                defaultSize={config.defaultSize}
                minSize={config.minSize}
                maxSize={config.maxSize}
                axis={ResizeAxis.Horizontal}
                handleSide={ResizeHandleSide.End}
                ariaLabel={`Resize ${config.label} column`}
                title={`Drag or use arrow keys to resize ${config.label} column`}
                onSizeChange={(width) => onSizeChange(column, width)}
            >
                {(style) => (
                    <div className={`graph-header-cell ${className}`} style={style}>
                        <span className="graph-header-label">{children}</span>
                    </div>
                )}
            </ResizablePanel>
        </div>
    );
}
