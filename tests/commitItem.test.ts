import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
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

    it('has vscode.diff as the command for every supported file status', () => {
        for (const status of ['A', 'D', 'M', 'R', 'C', 'T', 'U'] as const) {
            const change: GitFileChange = { status, filePath: 'file.ts' };
            const item = new FileChangeItem(change, 'abc1234', repoRoot);
            expect((item.command as any).command).toBe('vscode.diff');
        }
    });

    it('keeps copied, type-changed, and unmerged statuses visible in descriptions and tooltips', () => {
        for (const status of ['C', 'T', 'U'] as const) {
            const change: GitFileChange = { status, filePath: `src/${status}.ts` };
            const item = new FileChangeItem(change, 'abc1234', repoRoot);
            expect(item.description).toBe(status);
            expect(item.tooltip).toBe(`src/${status}.ts [${status}]`);
        }
    });

    it('uses the parentHash in the left-side URI for deleted files when provided', () => {
        const change: GitFileChange = { status: 'D', filePath: 'src/old.ts', parentHash: 'parent123' };
        const item = new FileChangeItem(change, 'abc1234', repoRoot);
        const leftUri = (item.command as any).arguments[0];
        expect(JSON.parse(leftUri.query).ref).toBe('parent123');
    });

    it('uses origPath for the left-side URI of renamed files', () => {
        const change: GitFileChange = {
            status: 'R',
            filePath: 'src/new name.ts',
            origPath: 'src/old name.ts',
            parentHash: 'parent123',
        };
        const item = new FileChangeItem(change, 'abc1234', repoRoot);
        const args = (item.command as any).arguments;

        expect(JSON.parse(args[0].query)).toEqual({
            path: '/repo/src/old name.ts',
            ref: 'parent123',
        });
        expect(JSON.parse(args[1].query)).toEqual({
            path: '/repo/src/new name.ts',
            ref: 'abc1234',
        });
    });
});

describe('FolderItem', () => {
    it('is expanded by default', () => {
        const node = { name: 'src', fullPath: 'src', children: new Map(), files: [] };
        const item = new FolderItem(node, 'abc1234', '/repo');
        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
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

    it('renders a non-clickable loading state', () => {
        const item = new LoadMoreItem(true);

        expect(item.label).toBe('Loading commits...');
        expect(item.command).toBeUndefined();
        expect((item.iconPath as any).id).toBe('sync~spin');
    });
});

describe('CommitItem relative date formatting', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-04-01T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

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
        const item = new CommitItem(makeCommit(new Date('2024-04-01T12:00:00Z')), false);
        expect(item.description).toContain('just now');
    });

    it('shows minutes ago for a commit within the last hour', () => {
        const fiveMinutesAgo = new Date('2024-04-01T11:55:00Z');
        const item = new CommitItem(makeCommit(fiveMinutesAgo), false);
        expect(item.description).toContain('min ago');
    });

    it('shows hours ago for a commit within the last day', () => {
        const twoHoursAgo = new Date('2024-04-01T10:00:00Z');
        const item = new CommitItem(makeCommit(twoHoursAgo), false);
        expect(item.description).toContain('hours ago');
    });

    it('shows days ago for a commit within the last 30 days', () => {
        const fiveDaysAgo = new Date('2024-03-27T12:00:00Z');
        const item = new CommitItem(makeCommit(fiveDaysAgo), false);
        expect(item.description).toContain('days ago');
    });

    it('shows a locale date string for commits older than 30 days', () => {
        const twoMonthsAgo = new Date('2024-02-01T12:00:00Z');
        const item = new CommitItem(makeCommit(twoMonthsAgo), false);
        expect(item.description).not.toContain('ago');
        expect(item.description).not.toContain('just now');
    });

    it('applies a colored icon only to the HEAD commit', () => {
        const commit = makeCommit(new Date('2024-04-01T12:00:00Z'));
        const headItem = new CommitItem(commit, true);
        const normalItem = new CommitItem(commit, false);
        expect((headItem.iconPath as any).color).toBeDefined();
        expect((normalItem.iconPath as any).color).toBeUndefined();
    });

    it('sets contextValue to "commit"', () => {
        const item = new CommitItem(makeCommit(new Date('2024-04-01T12:00:00Z')), false);
        expect(item.contextValue).toBe('commit');
    });
});
