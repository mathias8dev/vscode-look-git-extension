export interface PathTreeNode<TEntry> {
    name: string;
    fullPath: string;
    children: Map<string, PathTreeNode<TEntry>>;
    entries: TEntry[];
}

export function buildPathTree<TEntry>(
    entries: readonly TEntry[],
    getPath: (entry: TEntry) => string,
): PathTreeNode<TEntry> {
    const root: PathTreeNode<TEntry> = { name: '', fullPath: '', children: new Map(), entries: [] };

    for (const entry of entries) {
        const parts = getPath(entry).split('/');
        let current = root;

        for (let i = 0; i < parts.length - 1; i++) {
            const segment = parts[i];
            const fullPath = parts.slice(0, i + 1).join('/');
            let child = current.children.get(segment);
            if (!child) {
                child = { name: segment, fullPath, children: new Map(), entries: [] };
                current.children.set(segment, child);
            }
            current = child;
        }

        current.entries.push(entry);
    }

    compactChildren(root);
    return root;
}

export function sortedPathChildren<TEntry>(node: PathTreeNode<TEntry>): PathTreeNode<TEntry>[] {
    return [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function compactChildren<TEntry>(node: PathTreeNode<TEntry>): void {
    for (const [key, child] of node.children) {
        node.children.set(key, compactNode(child));
    }
}

function compactNode<TEntry>(node: PathTreeNode<TEntry>): PathTreeNode<TEntry> {
    compactChildren(node);

    if (node.children.size === 1 && node.entries.length === 0) {
        const grandchild = [...node.children.values()][0];
        return {
            name: `${node.name}/${grandchild.name}`,
            fullPath: grandchild.fullPath,
            children: grandchild.children,
            entries: grandchild.entries,
        };
    }

    return node;
}
