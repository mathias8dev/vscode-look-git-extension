import type { BranchInfo } from '@protocol/graph/types';

export interface BranchNode {
    readonly id: string;
    readonly name: string;
    readonly fullName: string;
    readonly branch?: BranchInfo;
    readonly children: readonly BranchNode[];
    readonly isFolder: boolean;
}

export function buildBranchTree(branches: readonly BranchInfo[]): BranchNode[] {
    const roots = new Map<string, MutableNode>();

    for (const branch of branches) {
        const parts = branch.name.split('/');
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
                    fullName: pathSoFar,
                    branch: isLeaf ? branch : undefined,
                    children: new Map(),
                    isFolder: !isLeaf,
                };
                current.set(part, node);
            }
            if (isLeaf) {
                node.branch = branch;
                node.isFolder = false;
            }
            current = node.children;
        }
    }

    return sortNodes(roots);
}

export function buildRemoteBranchTree(remoteBranches: readonly BranchInfo[]): BranchNode[] {
    const byRemote = new Map<string, BranchInfo[]>();
    for (const branch of remoteBranches) {
        const slashIdx = branch.name.indexOf('/');
        const remoteName = slashIdx !== -1 ? branch.name.slice(0, slashIdx) : branch.name;
        let list = byRemote.get(remoteName);
        if (!list) { list = []; byRemote.set(remoteName, list); }
        list.push(branch);
    }

    const result: BranchNode[] = [];
    for (const [remoteName, branches] of byRemote) {
        result.push({
            id: `remote:${remoteName}`,
            name: remoteName,
            fullName: remoteName,
            branch: undefined,
            children: buildRemoteChildren(remoteName, branches),
            isFolder: true,
        });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
}

function buildRemoteChildren(remoteName: string, branches: readonly BranchInfo[]): BranchNode[] {
    const roots = new Map<string, MutableNode>();

    for (const branch of branches) {
        const displayName = branch.name.slice(remoteName.length + 1) || branch.name;
        const parts = displayName.split('/');
        let current = roots;
        let displayPath = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i] ?? '';
            displayPath = displayPath ? `${displayPath}/${part}` : part;
            const fullName = `${remoteName}/${displayPath}`;
            const isLeaf = i === parts.length - 1;

            let node = current.get(part);
            if (!node) {
                node = {
                    id: fullName,
                    name: part,
                    fullName,
                    branch: isLeaf ? branch : undefined,
                    children: new Map(),
                    isFolder: !isLeaf,
                };
                current.set(part, node);
            }
            if (isLeaf) {
                node.branch = branch;
                node.isFolder = false;
                node.fullName = branch.name;
            }
            current = node.children;
        }
    }

    return sortNodes(roots);
}

interface MutableNode {
    id: string;
    name: string;
    fullName: string;
    branch?: BranchInfo;
    children: Map<string, MutableNode>;
    isFolder: boolean;
}

function sortNodes(nodes: Map<string, MutableNode>): BranchNode[] {
    return [...nodes.values()]
        .sort((a, b) => {
            if (a.isFolder !== b.isFolder) { return a.isFolder ? -1 : 1; }
            return a.name.localeCompare(b.name);
        })
        .map((node) => ({
            id: node.id,
            name: node.name,
            fullName: node.fullName,
            branch: node.branch,
            children: sortNodes(node.children),
            isFolder: node.isFolder || node.children.size > 0,
        }));
}
