import type { GraphContextTarget, TagInfo } from '@protocol/graph/types';
import type { TagPublication } from '@protocol/graph/messages';
import { tagPublicationModel } from '@webview/features/graph/tag-publication-model';
import { Codicon } from '@webview/shared/codicon';
import { openNativeContextMenu } from '@webview/shared/open-native-context-menu';

interface GraphTagProps {
    readonly tag: TagInfo;
    readonly isCurrent: boolean;
    readonly variant: 'badge' | 'list';
    readonly publication?: TagPublication;
    readonly checkedAt?: string;
    readonly onSelect: (hash: string) => void;
    readonly onContextTarget: (target: GraphContextTarget) => void;
}

export function GraphTag({ tag, isCurrent, variant, publication, checkedAt, onSelect, onContextTarget }: GraphTagProps) {
    const status = tagPublicationModel(publication, checkedAt);
    const selectContext = () => {
        onSelect(tag.hash);
        onContextTarget({ kind: 'tag', tag: tag.name, isCurrent });
    };
    return (
        <button
            type="button"
            className={variant === 'badge' ? 'ref-badge ref-badge-tag graph-tag-badge' : 'graph-resource-row graph-resource-row-clickable graph-tag-row'}
            title={`Tag: ${tag.name}${isCurrent ? ' · Detached HEAD' : ''}\n${status.title}`}
            aria-haspopup="menu"
            data-vscode-context={JSON.stringify({ webviewSection: 'graphTag', graphTagIsCurrent: isCurrent, preventDefaultContextMenuItems: true })}
            onClick={event => { event.stopPropagation(); onSelect(tag.hash); }}
            onDoubleClick={event => event.stopPropagation()}
            onMouseDown={event => {
                event.stopPropagation();
                if (event.button === 2) { selectContext(); }
            }}
            onContextMenu={selectContext}
            onKeyDown={event => {
                event.stopPropagation();
                if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
                    event.preventDefault();
                    selectContext();
                    openNativeContextMenu(event.currentTarget);
                }
            }}
        >
            <Codicon name="tag" />
            <span className={variant === 'list' ? 'branch-node-name' : undefined}>{tag.name}</span>
            <span className="graph-tag-publication" aria-label={status.label}>
                <Codicon name={status.icon} />
                {variant === 'list' ? <span>{status.shortLabel}</span> : null}
            </span>
        </button>
    );
}
