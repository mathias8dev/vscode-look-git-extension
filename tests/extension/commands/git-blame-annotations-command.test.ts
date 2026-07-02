import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import * as vscode from 'vscode';
import { registerGitBlameAnnotationsCommand } from '@extension/commands/git-blame-annotations-command';
import { createRepoContext } from '@extension/repositories/repo-context-factory';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';
import { resetMockVscode, window as mockWindow } from '@tests/mocks/vscode';

describe('registerGitBlameAnnotationsCommand', () => {
    const repos: TempGitRepo[] = [];
    const disposables: vscode.Disposable[] = [];

    afterEach(() => {
        while (disposables.length) { disposables.pop()!.dispose(); }
        while (repos.length) { repos.pop()!.cleanup(); }
        resetMockVscode();
    });

    it('toggles inline blame for the selected file', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.write('src/app.ts', 'first\nsecond\n');
        const filePath = path.join(repo.cwd, 'src', 'app.ts');
        const disposable = registerGitBlameAnnotationsCommand({
            repositories: { contexts: [createRepoContext(repo.cwd)] },
            loadBlame: async () => [
                {
                    line: 1,
                    commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    author: 'Alice Example',
                    authorTime: 1704067200,
                    summary: 'add first line',
                },
                {
                    line: 2,
                    commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    author: 'Bob Example',
                    authorTime: 1704153600,
                    summary: 'add second line',
                },
            ],
        });
        disposables.push(disposable);

        await vscode.commands.executeCommand('lookGit.file.toggleInlineBlame', vscode.Uri.file(filePath));

        const editor = vscode.window.activeTextEditor;
        expect(editor).toBeDefined();
        expect(editor?.decorations).toHaveLength(1);
        expect(editor?.decorations[0]?.ranges).toEqual([
            expect.objectContaining({ renderOptions: { after: { contentText: 'Alice Example 2024-01-01' } } }),
        ]);
        expect(String(editor?.decorations[0]?.ranges[0]?.hoverMessage?.value)).toContain('command:lookGit.history.revealCommit');
        expect(String(editor?.decorations[0]?.ranges[0]?.hoverMessage?.value)).toContain('command:lookGit.graph.revealCommit');
        expect(String(editor?.decorations[0]?.ranges[0]?.hoverMessage?.value)).toContain('Date: 2024-01-01 00:00:00');
        expect(editor?.decorations[0]?.ranges[0]?.hoverMessage?.isTrusted).toBe(true);

        if (!editor) { throw new Error('Expected an active editor.'); }
        editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));
        mockWindow.fireDidChangeTextEditorSelection(editor);

        expect(editor.decorations.at(-1)?.ranges).toEqual([
            expect.objectContaining({ renderOptions: { after: { contentText: 'Bob Example 2024-01-02' } } }),
        ]);

        await vscode.commands.executeCommand('lookGit.file.toggleInlineBlame', vscode.Uri.file(filePath));

        expect(editor?.decorations.at(-1)?.ranges).toEqual([]);
    });

    it('toggles all-line blame annotations before the editor text', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.write('src/app.ts', 'first\nsecond\n');
        const filePath = path.join(repo.cwd, 'src', 'app.ts');
        const disposable = registerGitBlameAnnotationsCommand({
            repositories: { contexts: [createRepoContext(repo.cwd)] },
            loadBlame: async () => [
                {
                    line: 1,
                    commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    author: 'Alice Example',
                    authorTime: 1704067200,
                    summary: 'add first line',
                },
                {
                    line: 2,
                    commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    author: 'Bob Example',
                    authorTime: 1704153600,
                    summary: 'add second line',
                },
            ],
        });
        disposables.push(disposable);

        await vscode.commands.executeCommand('lookGit.file.toggleBlameAnnotations', vscode.Uri.file(filePath));

        const editor = vscode.window.activeTextEditor;
        expect(editor).toBeDefined();
        expect(findDecorationRangesContaining(editor, '2024-01-01 Alice Example')).toEqual([
            expect.objectContaining({
                renderOptions: expect.objectContaining({
                    before: expect.objectContaining({
                        contentText: expect.stringContaining('2024-01-01 Alice Example'),
                    }),
                }),
            }),
            expect.objectContaining({
                renderOptions: expect.objectContaining({
                    before: expect.objectContaining({
                        contentText: expect.stringContaining('2024-01-02 Bob Example'),
                    }),
                }),
            }),
        ]);

        await vscode.commands.executeCommand('lookGit.file.toggleBlameAnnotations', vscode.Uri.file(filePath));

        expect(editor?.decorations.at(-1)?.ranges).toEqual([]);
    });

    it('applies blame display settings to inline and all-line annotations', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.write('src/app.ts', 'first\nsecond\nthird\n');
        const filePath = path.join(repo.cwd, 'src', 'app.ts');
        await vscode.workspace.getConfiguration('lookGit').update('blame.mergeCommitLines', true);
        await vscode.workspace.getConfiguration('lookGit').update('blame.dateFormatStyle', 'dateTime');
        await vscode.workspace.getConfiguration('lookGit').update('blame.authorNameStyle', 'first');
        const disposable = registerGitBlameAnnotationsCommand({
            repositories: { contexts: [createRepoContext(repo.cwd)] },
            loadBlame: async () => [
                {
                    line: 1,
                    commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    author: 'Alice Example',
                    authorTime: 1704067200,
                    summary: 'add first line',
                },
                {
                    line: 2,
                    commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    author: 'Alice Example',
                    authorTime: 1704067200,
                    summary: 'add second line',
                },
                {
                    line: 3,
                    commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    author: 'Bob Example',
                    authorTime: 1704153600,
                    summary: 'add third line',
                },
            ],
        });
        disposables.push(disposable);

        await vscode.commands.executeCommand('lookGit.file.toggleInlineBlame', vscode.Uri.file(filePath));

        const editor = vscode.window.activeTextEditor;
        expect(editor?.decorations.at(-1)?.ranges).toEqual([
            expect.objectContaining({ renderOptions: { after: { contentText: 'Alice 2024-01-01 00:00:00' } } }),
        ]);

        await vscode.commands.executeCommand('lookGit.blame.show', vscode.Uri.file(filePath));

        const annotationRanges = findDecorationRangesContaining(editor, '2024-01-01 00:00:00 Alice');
        expect(annotationRanges).toEqual([
            expect.objectContaining({
                renderOptions: expect.objectContaining({
                    before: expect.objectContaining({
                        contentText: expect.stringContaining('2024-01-01 00:00:00 Alice'),
                    }),
                }),
            }),
            expect.objectContaining({
                renderOptions: expect.objectContaining({
                    before: expect.objectContaining({
                        contentText: expect.not.stringContaining('Alice'),
                    }),
                }),
            }),
            expect.objectContaining({
                renderOptions: expect.objectContaining({
                    before: expect.objectContaining({
                        contentText: expect.stringContaining('2024-01-02 00:00:00 Bob'),
                    }),
                }),
            }),
        ]);
    });

    it('highlights all visible blame lines for the commit under the cursor', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.write('src/app.ts', 'first\nsecond\nthird\n');
        const filePath = path.join(repo.cwd, 'src', 'app.ts');
        await vscode.workspace.getConfiguration('lookGit').update('blame.highlightChangedLines', true);
        const disposable = registerGitBlameAnnotationsCommand({
            repositories: { contexts: [createRepoContext(repo.cwd)] },
            loadBlame: async () => [
                {
                    line: 1,
                    commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    author: 'Alice Example',
                    authorTime: 1704067200,
                    summary: 'add first line',
                },
                {
                    line: 2,
                    commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    author: 'Alice Example',
                    authorTime: 1704067200,
                    summary: 'add second line',
                },
                {
                    line: 3,
                    commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                    author: 'Bob Example',
                    authorTime: 1704153600,
                    summary: 'add third line',
                },
            ],
        });
        disposables.push(disposable);

        await vscode.commands.executeCommand('lookGit.blame.show', vscode.Uri.file(filePath));

        const editor = vscode.window.activeTextEditor;
        if (!editor) { throw new Error('Expected an active editor.'); }
        editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));
        mockWindow.fireDidChangeTextEditorSelection(editor);

        expect(editor.decorations.at(-1)?.ranges).toEqual([
            expect.objectContaining({ startLine: 0 }),
            expect.objectContaining({ startLine: 1 }),
        ]);
    });

    it('shows and hides full blame annotations through palette commands', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.write('src/app.ts', 'first\n');
        const filePath = path.join(repo.cwd, 'src', 'app.ts');
        const disposable = registerGitBlameAnnotationsCommand({
            repositories: { contexts: [createRepoContext(repo.cwd)] },
            loadBlame: async () => [{
                line: 1,
                commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                author: 'Alice Example',
                authorTime: 1704067200,
                summary: 'add first line',
            }],
        });
        disposables.push(disposable);

        await vscode.commands.executeCommand('lookGit.blame.show', vscode.Uri.file(filePath));

        const editor = vscode.window.activeTextEditor;
        expect(editor?.decorations.at(-1)?.ranges).toHaveLength(1);

        await vscode.commands.executeCommand('lookGit.blame.hide', vscode.Uri.file(filePath));

        expect(editor?.decorations.at(-1)?.ranges).toEqual([]);

        await vscode.commands.executeCommand('lookGit.blame.toggle', vscode.Uri.file(filePath));

        expect(editor?.decorations.at(-1)?.ranges).toHaveLength(1);
    });

    it('automatically annotates the active editor when inline blame is enabled', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.write('src/app.ts', 'first\n');
        const filePath = path.join(repo.cwd, 'src', 'app.ts');
        await vscode.workspace.getConfiguration('lookGit').update('inlineBlame.enabled', true);
        const disposable = registerGitBlameAnnotationsCommand({
            repositories: { contexts: [createRepoContext(repo.cwd)] },
            loadBlame: async () => [{
                line: 1,
                commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                author: 'Alice Example',
                authorTime: 1704067200,
                summary: 'add first line',
            }],
        });
        disposables.push(disposable);

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const editor = await vscode.window.showTextDocument(document);

        await expect.poll(() => editor.decorations.at(-1)?.ranges).toEqual([
            expect.objectContaining({ renderOptions: { after: { contentText: 'Alice Example 2024-01-01' } } }),
        ]);
    });
});

function findDecorationRangesContaining(
    editor: vscode.TextEditor | undefined,
    content: string,
): readonly unknown[] {
    return editor?.decorations.find((call) => call.ranges.some((range) => {
        const renderOptions = typeof range === 'object' && range !== null && 'renderOptions' in range
            ? range.renderOptions
            : undefined;
        const before = typeof renderOptions === 'object' && renderOptions !== null && 'before' in renderOptions
            ? renderOptions.before
            : undefined;
        const contentText = typeof before === 'object' && before !== null && 'contentText' in before
            ? before.contentText
            : undefined;
        return typeof contentText === 'string' && contentText.includes(content);
    }))?.ranges ?? [];
}
