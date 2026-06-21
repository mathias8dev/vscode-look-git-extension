import type { CommitFileChange } from '@protocol/graph/types';

export interface FileTreeNode {
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly file?: CommitFileChange;
    readonly children: readonly FileTreeNode[];
    readonly isFolder: boolean;
}

export function buildFileTree(files: readonly CommitFileChange[]): FileTreeNode[] {
    const roots = new Map<string, MutableFileNode>();

    for (const file of files) {
        const parts = file.filePath.split('/');
        let current = roots;
        let pathSoFar = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i] ?? '';
            pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
            const isLeaf = i === parts.length - 1;

            let node = current.get(part);
            if (!node) {
                node = {
                    id: pathSoFar,
                    name: part,
                    path: pathSoFar,
                    file: isLeaf ? file : undefined,
                    children: new Map(),
                    isFolder: !isLeaf,
                };
                current.set(part, node);
            }
            if (isLeaf) {
                node.file = file;
                node.isFolder = false;
            }
            current = node.children;
        }
    }

    return freezeFileNodes(roots);
}

interface MutableFileNode {
    id: string;
    name: string;
    path: string;
    file?: CommitFileChange;
    children: Map<string, MutableFileNode>;
    isFolder: boolean;
}

function freezeFileNodes(nodes: Map<string, MutableFileNode>): FileTreeNode[] {
    return [...nodes.values()]
        .sort((a, b) => {
            if (a.isFolder !== b.isFolder) { return a.isFolder ? -1 : 1; }
            return a.name.localeCompare(b.name);
        })
        .map((node) => ({
            id: node.id,
            name: node.name,
            path: node.path,
            file: node.file,
            children: freezeFileNodes(node.children),
            isFolder: node.isFolder || node.children.size > 0,
        }));
}
