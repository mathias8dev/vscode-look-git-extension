import type { StatusData, StatusEntry } from '../../../protocol/changes/types';
import { SubmoduleStatus } from '../../../protocol/shared/repo';

export enum ChangeSectionId {
    Conflicts = 'conflicts',
    Staged = 'staged',
    Unstaged = 'unstaged',
}

export interface ChangeListItem {
    readonly id: string;
    readonly section: ChangeSectionId;
    readonly entry: StatusEntry;
    readonly isStaged: boolean;
}

export interface ChangeTreeNode {
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly depth: number;
    readonly children: readonly ChangeTreeNode[];
    readonly item?: ChangeListItem;
}

export interface ChangeSection {
    readonly id: ChangeSectionId;
    readonly title: string;
    readonly items: readonly ChangeListItem[];
}

export function buildChangeSections(status: StatusData): readonly ChangeSection[] {
    return [
        {
            id: ChangeSectionId.Conflicts,
            title: 'Conflicts',
            items: status.conflicts.map((entry) => toItem(ChangeSectionId.Conflicts, entry, false)),
        },
        {
            id: ChangeSectionId.Staged,
            title: 'Staged',
            items: status.staged.map((entry) => toItem(ChangeSectionId.Staged, entry, true)),
        },
        {
            id: ChangeSectionId.Unstaged,
            title: 'Changes',
            items: status.unstaged.map((entry) => toItem(ChangeSectionId.Unstaged, entry, false)),
        },
    ];
}

export function buildChangeTree(items: readonly ChangeListItem[]): readonly ChangeTreeNode[] {
    const roots = new Map<string, MutableTreeNode>();

    for (const item of items) {
        const parts = item.entry.filePath.split('/').filter(Boolean);
        let current = roots;
        let path = '';
        for (let index = 0; index < parts.length; index++) {
            const part = parts[index];
            if (!part) { continue; }
            path = path ? `${path}/${part}` : part;
            const isLeaf = index === parts.length - 1;
            let node = current.get(part);
            if (!node) {
                node = {
                    id: isLeaf ? item.id : `${item.section}:folder:${path}`,
                    name: part,
                    path,
                    depth: index,
                    children: new Map(),
                    item: isLeaf ? item : undefined,
                };
                current.set(part, node);
            }
            if (isLeaf) {
                node.item = item;
                node.id = item.id;
            }
            current = node.children;
        }
    }

    return freezeNodes(roots);
}

export function statusCode(entry: StatusEntry): string {
    const raw = `${entry.indexStatus}${entry.workTreeStatus}`.trim();
    return raw || entry.indexStatus || entry.workTreeStatus || '?';
}

export function statusLabel(entry: StatusEntry): string {
    if (entry.isSubmodule) { return submoduleLabel(entry.submoduleStatus); }
    const code = statusCode(entry);
    if (code.includes('U')) { return 'Conflict'; }
    if (code.includes('R')) { return 'Renamed'; }
    if (code.includes('A') || code.includes('?')) { return 'Added'; }
    if (code.includes('D')) { return 'Deleted'; }
    if (code.includes('M')) { return 'Modified'; }
    return 'Changed';
}

function submoduleLabel(status: StatusEntry['submoduleStatus']): string {
    switch (status) {
        case SubmoduleStatus.Dirty:
            return 'Submodule dirty';
        case SubmoduleStatus.OutOfSync:
            return 'Submodule out-of-sync';
        case SubmoduleStatus.NotInitialized:
            return 'Submodule not initialized';
        case SubmoduleStatus.Clean:
        default:
            return 'Submodule';
    }
}

function toItem(section: ChangeSectionId, entry: StatusEntry, isStaged: boolean): ChangeListItem {
    return {
        id: `${section}:${entry.filePath}:${entry.origPath ?? ''}`,
        section,
        entry,
        isStaged,
    };
}

interface MutableTreeNode {
    id: string;
    readonly name: string;
    readonly path: string;
    readonly depth: number;
    readonly children: Map<string, MutableTreeNode>;
    item?: ChangeListItem;
}

function freezeNodes(nodes: Map<string, MutableTreeNode>): readonly ChangeTreeNode[] {
    return [...nodes.values()]
        .sort(compareNodes)
        .map((node) => ({
            id: node.id,
            name: node.name,
            path: node.path,
            depth: node.depth,
            item: node.item,
            children: freezeNodes(node.children),
        }));
}

function compareNodes(a: MutableTreeNode, b: MutableTreeNode): number {
    const aIsFolder = a.children.size > 0 && !a.item;
    const bIsFolder = b.children.size > 0 && !b.item;
    if (aIsFolder !== bIsFolder) { return aIsFolder ? -1 : 1; }
    return a.name.localeCompare(b.name);
}
