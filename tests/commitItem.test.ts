import { describe, expect, it } from 'vitest';
import { buildFolderTree, CommitItem, FileChangeItem, FolderItem, LoadMoreItem } from '../src/commitItem';
import type { GitCommitInfo, GitFileChange } from '../src/gitService';

describe('buildFolderTree', () => {
    it('compacts single-child folder chains while preserving files', () => {
        const files: GitFileChange[] = [
            { status: 'M', filePath: 'src/commands/rebase.ts' },
            { status: 'A', filePath: 'src/commands/drop.ts' },
            { status: 'D', filePath: 'README.md' },
        ];

        const tree = buildFolderTree(files);

        expect([...tree.children.values()].map((node) => node.name)).toEqual(['src/commands']);
        expect(tree.files.map((file) => file.filePath)).toEqual(['README.md']);
        const commands = [...tree.children.values()][0];
        expect(commands?.files.map((file) => file.filePath).sort()).toEqual([
            'src/commands/drop.ts',
            'src/commands/rebase.ts',
        ]);
    });

    it('keeps folders unmerged when a node has both files and children', () => {
        const files: GitFileChange[] = [
            { status: 'M', filePath: 'src/index.ts' },
            { status: 'M', filePath: 'src/commands/index.ts' },
        ];

        const tree = buildFolderTree(files);
        const src = tree.children.get('src');

        expect(src).toBeDefined();
        expect(src?.files.map((file) => file.filePath)).toEqual(['src/index.ts']);
        expect([...src!.children.keys()]).toEqual(['commands']);
    });

    it('places root-level files directly on the root node', () => {
        const files: GitFileChange[] = [
            { status: 'A', filePath: 'README.md' },
            { status: 'M', filePath: 'package.json' },
        ];

        const tree = buildFolderTree(files);

        expect(tree.children.size).toBe(0);
        expect(tree.files.map((f) => f.filePath).sort()).toEqual(['README.md', 'package.json']);
    });
});

describe('FileChangeItem', () => {
    const repoRoot = '/repo';

    it('uses empty URI as left side for added files', () => {
        const change: GitFileChange = { status: 'A', filePath: 'src/new.ts' };
        const item = new FileChangeItem(change, 'abc1234', repoRoot);
        const args = (item.command as any).arguments;
        expect(args[0].scheme).toBe('lookgit-empty');
        expect(args[2]).toContain('Added');
    });

    it('uses empty URI as right side for deleted files', () => {
        const change: GitFileChange = { status: 'D', filePath: 'src/old.ts' };
        const item = new FileChangeItem(change, 'abc1234', repoRoot);
        const args = (item.command as any).arguments;
        expect(args[1].scheme).toBe('lookgit-empty');
        expect(args[2]).toContain('Deleted');
    });

    it('uses git scheme for both sides of a modified file', () => {
        const change: GitFileChange = { status: 'M', filePath: 'src/file.ts' };
        const item = new FileChangeItem(change, 'abc1234', repoRoot);
        const args = (item.command as any).arguments;
        expect(args[0].scheme).toBe('git');
        expect(args[1].scheme).toBe('git');
    });

    it('uses the short hash (first 7 chars) in the diff title', () => {
        const change: GitFileChange = { status: 'M', filePath: 'src/file.ts' };
        const item = new FileChangeItem(change, 'abc12345678', repoRoot);
        expect((item.command as any).arguments[2]).toContain('abc1234');
    });

    it('shows directory path in description when showFullPath is true', () => {
        const change: GitFileChange = { status: 'M', filePath: 'src/commands/index.ts' };
        const item = new FileChangeItem(change, 'abc1234', repoRoot, true);
        expect(item.description).toContain('src/commands');
    });

    it('shows only status letter in description when showFullPath is false', () => {
        const change: GitFileChange = { status: 'M', filePath: 'src/commands/index.ts' };
        const item = new FileChangeItem(change, 'abc1234', repoRoot, false);
        expect(item.description).toBe('M');
    });

    it('has vscode.diff as the command for all statuses', () => {
        for (const status of ['A', 'D', 'M', 'R'] as const) {
            const change: GitFileChange = { status, filePath: 'file.ts' };
            const item = new FileChangeItem(change, 'abc1234', repoRoot);
            expect((item.command as any).command).toBe('vscode.diff');
        }
    });

    it('uses the parentHash in the left-side URI for deleted files when provided', () => {
        const change: GitFileChange = { status: 'D', filePath: 'src/old.ts', parentHash: 'parent123' };
        const item = new FileChangeItem(change, 'abc1234', repoRoot);
        const leftUri = (item.command as any).arguments[0];
        expect(JSON.parse(leftUri.query).ref).toBe('parent123');
    });
});

describe('FolderItem', () => {
    it('is expanded by default', () => {
        const node = { name: 'src', fullPath: 'src', children: new Map(), files: [] };
        const item = new FolderItem(node, 'abc1234', '/repo');
        expect(item.collapsibleState).toBe(2); // TreeItemCollapsibleState.Expanded
    });

    it('exposes the folder node and repo metadata', () => {
        const node = { name: 'commands', fullPath: 'src/commands', children: new Map(), files: [] };
        const item = new FolderItem(node, 'abc1234', '/repo');
        expect(item.folderNode).toBe(node);
        expect(item.commitHash).toBe('abc1234');
        expect(item.repoRoot).toBe('/repo');
    });

    it('sets the tooltip to the full folder path', () => {
        const node = { name: 'commands', fullPath: 'src/commands', children: new Map(), files: [] };
        const item = new FolderItem(node, 'abc1234', '/repo');
        expect(item.tooltip).toBe('src/commands');
    });
});

describe('LoadMoreItem', () => {
    it('has the lookGit.loadMore command', () => {
        const item = new LoadMoreItem();
        expect((item.command as any).command).toBe('lookGit.loadMore');
    });

    it('has loadMore as contextValue', () => {
        const item = new LoadMoreItem();
        expect(item.contextValue).toBe('loadMore');
    });
});

describe('CommitItem relative date formatting', () => {
    function makeCommit(date: Date): GitCommitInfo {
        return {
            hash: 'abc1234567890',
            shortHash: 'abc1234',
            message: 'test commit',
            authorName: 'Author',
            authorEmail: 'a@b.com',
            authorDate: date,
            parentHashes: [],
        };
    }

    it('shows "just now" for a commit made moments ago', () => {
        const item = new CommitItem(makeCommit(new Date()), false);
        expect(item.description).toContain('just now');
    });

    it('shows minutes ago for a commit within the last hour', () => {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const item = new CommitItem(makeCommit(fiveMinutesAgo), false);
        expect(item.description).toContain('min ago');
    });

    it('shows hours ago for a commit within the last day', () => {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const item = new CommitItem(makeCommit(twoHoursAgo), false);
        expect(item.description).toContain('hours ago');
    });

    it('shows days ago for a commit within the last 30 days', () => {
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        const item = new CommitItem(makeCommit(fiveDaysAgo), false);
        expect(item.description).toContain('days ago');
    });

    it('shows a locale date string for commits older than 30 days', () => {
        const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        const item = new CommitItem(makeCommit(twoMonthsAgo), false);
        expect(item.description).not.toContain('ago');
        expect(item.description).not.toContain('just now');
    });

    it('applies a colored icon only to the HEAD commit', () => {
        const commit = makeCommit(new Date());
        const headItem = new CommitItem(commit, true);
        const normalItem = new CommitItem(commit, false);
        expect((headItem.iconPath as any).color).toBeDefined();
        expect((normalItem.iconPath as any).color).toBeUndefined();
    });

    it('sets contextValue to "commit"', () => {
        const item = new CommitItem(makeCommit(new Date()), false);
        expect(item.contextValue).toBe('commit');
    });
});
