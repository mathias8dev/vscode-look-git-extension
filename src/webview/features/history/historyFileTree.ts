import type { HistoryCommitFile } from '../../../protocol/history/types';

export interface HistoryFileTreeNode {
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly depth: number;
    readonly children: readonly HistoryFileTreeNode[];
    readonly file?: HistoryCommitFile;
}

export function buildHistoryFileTree(files: readonly HistoryCommitFile[]): readonly HistoryFileTreeNode[] {
    const roots = new Map<string, MutableHistoryFileTreeNode>();

    for (const file of files) {
        const parts = file.filePath.split('/').filter(Boolean);
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
                    id: isLeaf ? fileId(file) : `folder:${path}`,
                    name: part,
                    path,
                    depth: index,
                    children: new Map(),
                    file: isLeaf ? file : undefined,
                };
                current.set(part, node);
            }
            if (isLeaf) {
                node.id = fileId(file);
                node.file = file;
            }
            current = node.children;
        }
    }

    return freezeNodes(roots);
}

function fileId(file: HistoryCommitFile): string {
    return `${file.parentHash ?? ''}:${file.filePath}:${file.origPath ?? ''}`;
}

interface MutableHistoryFileTreeNode {
    id: string;
    readonly name: string;
    readonly path: string;
    readonly depth: number;
    readonly children: Map<string, MutableHistoryFileTreeNode>;
    file?: HistoryCommitFile;
}

function freezeNodes(nodes: Map<string, MutableHistoryFileTreeNode>): readonly HistoryFileTreeNode[] {
    return [...nodes.values()]
        .sort(compareNodes)
        .map((node) => ({
            id: node.id,
            name: node.name,
            path: node.path,
            depth: node.depth,
            file: node.file,
            children: freezeNodes(node.children),
        }));
}

function compareNodes(a: MutableHistoryFileTreeNode, b: MutableHistoryFileTreeNode): number {
    const aIsFolder = a.children.size > 0 && !a.file;
    const bIsFolder = b.children.size > 0 && !b.file;
    if (aIsFolder !== bIsFolder) { return aIsFolder ? -1 : 1; }
    return a.name.localeCompare(b.name);
}
