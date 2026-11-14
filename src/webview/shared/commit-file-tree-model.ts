import type { CommitFileChange } from '@protocol/shared/commit';

export interface FileTreeNode<TFile extends CommitFileChange = CommitFileChange> {
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly file?: TFile;
    readonly children: readonly FileTreeNode<TFile>[];
    readonly isFolder: boolean;
}

export function buildFileTree<TFile extends CommitFileChange>(files: readonly TFile[]): FileTreeNode<TFile>[] {
    const roots = new Map<string, MutableFileNode<TFile>>();

    for (const file of files) {
        const parts = file.filePath.split('/');
        let current = roots;
        let pathSoFar = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i] ?? '';
            pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
            const isLeaf = i === parts.length - 1;

            const nodeKey = isLeaf ? `${file.parentHash ?? ''}:${part}:${file.origPath ?? ''}` : part;
            let node = current.get(nodeKey);
            if (!node) {
                node = {
                    id: isLeaf ? `${file.parentHash ?? ''}:${pathSoFar}:${file.origPath ?? ''}` : pathSoFar,
                    name: part,
                    path: pathSoFar,
                    file: isLeaf ? file : undefined,
                    children: new Map(),
                    isFolder: !isLeaf,
                };
                current.set(nodeKey, node);
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

interface MutableFileNode<TFile extends CommitFileChange> {
    id: string;
    name: string;
    path: string;
    file?: TFile;
    children: Map<string, MutableFileNode<TFile>>;
    isFolder: boolean;
}

function freezeFileNodes<TFile extends CommitFileChange>(nodes: Map<string, MutableFileNode<TFile>>): FileTreeNode<TFile>[] {
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
