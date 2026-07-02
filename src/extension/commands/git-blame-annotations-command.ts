import * as path from 'path';
import * as vscode from 'vscode';
import type { GitBlameLine } from '@core/git/domain/git-blame';
import type { RepoContext } from '@core/git/domain/repo-context';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { queryBlame } from '@extension/git/queries/query-blame';
import { isPathInside, normalizePathForComparison } from '@extension/utils/path-compare';

const TOGGLE_INLINE_BLAME_COMMAND = 'lookGit.file.toggleInlineBlame';
const TOGGLE_BLAME_ANNOTATIONS_COMMAND = 'lookGit.file.toggleBlameAnnotations';
const TOGGLE_BLAME_ANNOTATIONS_PALETTE_COMMAND = 'lookGit.blame.toggle';
const SHOW_BLAME_ANNOTATIONS_COMMAND = 'lookGit.blame.show';
const HIDE_BLAME_ANNOTATIONS_COMMAND = 'lookGit.blame.hide';
const REVEAL_HISTORY_COMMIT_COMMAND = 'lookGit.history.revealCommit';
const REVEAL_GRAPH_COMMIT_COMMAND = 'lookGit.graph.revealCommit';
const BLAME_ANNOTATIONS_VISIBLE_CONTEXT = 'lookGit.blame.annotationsVisible';
const INLINE_BLAME_ENABLED_SETTING = 'inlineBlame.enabled';
const BLAME_MERGE_COMMIT_LINES_SETTING = 'blame.mergeCommitLines';
const BLAME_HIGHLIGHT_CHANGED_LINES_SETTING = 'blame.highlightChangedLines';
const BLAME_DATE_FORMAT_STYLE_SETTING = 'blame.dateFormatStyle';
const BLAME_AUTHOR_NAME_STYLE_SETTING = 'blame.authorNameStyle';
const MAX_BLAME_ANNOTATION_WIDTH = 28;
const DATE_FORMAT_STYLES = ['date', 'dateTime', 'time', 'relative', 'iso'] as const;
const AUTHOR_NAME_STYLES = ['full', 'first', 'last'] as const;

type BlameDateFormatStyle = typeof DATE_FORMAT_STYLES[number];
type BlameAuthorNameStyle = typeof AUTHOR_NAME_STYLES[number];

interface BlameDisplayConfig {
    readonly mergeCommitLines: boolean;
    readonly highlightChangedLines: boolean;
    readonly dateFormatStyle: BlameDateFormatStyle;
    readonly authorNameStyle: BlameAuthorNameStyle;
}

export interface GitBlameAnnotationsRepositories {
    readonly contexts: readonly RepoContext[];
}

export interface RegisterGitBlameAnnotationsCommandInput {
    readonly repositories: GitBlameAnnotationsRepositories;
    readonly loadBlame?: (repoRoot: string, filePath: string, signal?: AbortSignal) => Promise<readonly GitBlameLine[]>;
}

interface AnnotatedDocument {
    readonly lines: readonly GitBlameLine[];
    readonly editor: vscode.TextEditor;
}

export function registerGitBlameAnnotationsCommand(input: RegisterGitBlameAnnotationsCommandInput): vscode.Disposable {
    const inlineDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 2em',
            color: new vscode.ThemeColor('editorCodeLens.foreground'),
            fontStyle: 'italic',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    const blameAnnotationDecorationType = vscode.window.createTextEditorDecorationType({
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    const changedLinesHighlightDecorationType = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    const inlineDocuments = new Map<string, AnnotatedDocument>();
    const blameAnnotationDocuments = new Map<string, AnnotatedDocument>();
    const inlinePendingLoads = new Map<string, AbortController>();
    const blameAnnotationPendingLoads = new Map<string, AbortController>();

    const updateBlameAnnotationsVisibleContext = (editor = vscode.window.activeTextEditor) => {
        const visible = editor !== undefined && blameAnnotationDocuments.has(editor.document.uri.toString());
        void vscode.commands.executeCommand('setContext', BLAME_ANNOTATIONS_VISIBLE_CONTEXT, visible);
    };

    const inlineCommand = vscode.commands.registerCommand(TOGGLE_INLINE_BLAME_COMMAND, async (resource?: vscode.Uri) => {
        try {
            const editor = await resolveEditor(resource);
            if (!editor) {
                await vscode.window.showErrorMessage('Open a file before toggling inline Git blame.');
                return;
            }
            const uriKey = editor.document.uri.toString();
            if (inlineDocuments.has(uriKey)) {
                clearEditorAnnotations(editor, inlineDecorationType);
                inlineDocuments.delete(uriKey);
                return;
            }

            const enabled = await enableInlineBlame(input, editor, inlineDecorationType, inlineDocuments, inlinePendingLoads);
            if (!enabled) { await vscode.window.showErrorMessage('No Git repository found for this file.'); }
        } catch (error) {
            await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        }
    });

    const showBlameAnnotations = async (resource?: vscode.Uri): Promise<void> => {
        try {
            const editor = await resolveEditor(resource);
            if (!editor) {
                await vscode.window.showErrorMessage('Open a file before showing Git blame annotations.');
                return;
            }
            const uriKey = editor.document.uri.toString();
            if (blameAnnotationDocuments.has(uriKey)) {
                updateBlameAnnotationsVisibleContext(editor);
                return;
            }

            const enabled = await enableBlameAnnotations(input, editor, blameAnnotationDecorationType, changedLinesHighlightDecorationType, blameAnnotationDocuments, blameAnnotationPendingLoads);
            if (!enabled) { await vscode.window.showErrorMessage('No Git repository found for this file.'); }
            updateBlameAnnotationsVisibleContext(editor);
        } catch (error) {
            await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        }
    };

    const hideBlameAnnotations = async (resource?: vscode.Uri): Promise<void> => {
        try {
            const editor = await resolveEditor(resource);
            if (!editor) {
                updateBlameAnnotationsVisibleContext(undefined);
                return;
            }
            const uriKey = editor.document.uri.toString();
            clearEditorAnnotations(editor, blameAnnotationDecorationType);
            clearEditorAnnotations(editor, changedLinesHighlightDecorationType);
            blameAnnotationDocuments.delete(uriKey);
            updateBlameAnnotationsVisibleContext(editor);
        } catch (error) {
            await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        }
    };

    const toggleBlameAnnotations = async (resource?: vscode.Uri): Promise<void> => {
        try {
            const editor = await resolveEditor(resource);
            if (!editor) {
                await vscode.window.showErrorMessage('Open a file before toggling Git blame annotations.');
                return;
            }
            if (blameAnnotationDocuments.has(editor.document.uri.toString())) {
                await hideBlameAnnotations(editor.document.uri);
                return;
            }
            await showBlameAnnotations(editor.document.uri);
        } catch (error) {
            await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        }
    };

    const blameAnnotationsCommand = vscode.commands.registerCommand(TOGGLE_BLAME_ANNOTATIONS_COMMAND, toggleBlameAnnotations);
    const blameAnnotationsPaletteCommand = vscode.commands.registerCommand(TOGGLE_BLAME_ANNOTATIONS_PALETTE_COMMAND, toggleBlameAnnotations);
    const showBlameAnnotationsCommand = vscode.commands.registerCommand(SHOW_BLAME_ANNOTATIONS_COMMAND, showBlameAnnotations);
    const hideBlameAnnotationsCommand = vscode.commands.registerCommand(HIDE_BLAME_ANNOTATIONS_COMMAND, hideBlameAnnotations);

    const selectionListener = vscode.window.onDidChangeTextEditorSelection((event) => {
        const uriKey = event.textEditor.document.uri.toString();
        const inlineDocument = inlineDocuments.get(uriKey);
        if (inlineDocument) {
            updateInlineBlame(event.textEditor, inlineDecorationType, inlineDocument.lines);
        }
        const blameAnnotationDocument = blameAnnotationDocuments.get(uriKey);
        if (blameAnnotationDocument) {
            updateChangedLinesHighlight(event.textEditor, changedLinesHighlightDecorationType, blameAnnotationDocument.lines);
        }
    });

    const activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        updateBlameAnnotationsVisibleContext(editor);
        if (!editor || !isInlineBlameEnabled()) { return; }
        void enableInlineBlame(input, editor, inlineDecorationType, inlineDocuments, inlinePendingLoads);
    });

    const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
        const inlineSettingChanged = event.affectsConfiguration(`lookGit.${INLINE_BLAME_ENABLED_SETTING}`);
        const blameSettingChanged = [
            BLAME_MERGE_COMMIT_LINES_SETTING,
            BLAME_HIGHLIGHT_CHANGED_LINES_SETTING,
            BLAME_DATE_FORMAT_STYLE_SETTING,
            BLAME_AUTHOR_NAME_STYLE_SETTING,
        ].some((setting) => event.affectsConfiguration(`lookGit.${setting}`));
        if (!inlineSettingChanged && !blameSettingChanged) { return; }
        if (inlineSettingChanged) {
            if (isInlineBlameEnabled()) {
                const editor = vscode.window.activeTextEditor;
                if (editor) { void enableInlineBlame(input, editor, inlineDecorationType, inlineDocuments, inlinePendingLoads); }
            } else {
                clearAnnotations(inlineDecorationType, inlineDocuments, inlinePendingLoads);
            }
        }
        if (blameSettingChanged) {
            refreshInlineBlameAnnotations(inlineDecorationType, inlineDocuments);
            refreshBlameAnnotations(blameAnnotationDecorationType, changedLinesHighlightDecorationType, blameAnnotationDocuments);
        }
    });

    const closeListener = vscode.workspace.onDidCloseTextDocument((document) => {
        const uriKey = document.uri.toString();
        inlinePendingLoads.get(uriKey)?.abort();
        inlinePendingLoads.delete(uriKey);
        blameAnnotationPendingLoads.get(uriKey)?.abort();
        blameAnnotationPendingLoads.delete(uriKey);
        inlineDocuments.delete(uriKey);
        blameAnnotationDocuments.delete(uriKey);
        updateBlameAnnotationsVisibleContext();
    });

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isInlineBlameEnabled()) {
        void enableInlineBlame(input, activeEditor, inlineDecorationType, inlineDocuments, inlinePendingLoads);
    }
    updateBlameAnnotationsVisibleContext(activeEditor);

    return {
        dispose(): void {
            inlineCommand.dispose();
            blameAnnotationsCommand.dispose();
            blameAnnotationsPaletteCommand.dispose();
            showBlameAnnotationsCommand.dispose();
            hideBlameAnnotationsCommand.dispose();
            selectionListener.dispose();
            activeEditorListener.dispose();
            configurationListener.dispose();
            closeListener.dispose();
            inlineDecorationType.dispose();
            blameAnnotationDecorationType.dispose();
            changedLinesHighlightDecorationType.dispose();
            abortPendingLoads(inlinePendingLoads);
            abortPendingLoads(blameAnnotationPendingLoads);
            inlineDocuments.clear();
            blameAnnotationDocuments.clear();
        },
    };
}

async function enableInlineBlame(
    input: RegisterGitBlameAnnotationsCommandInput,
    editor: vscode.TextEditor,
    decorationType: vscode.TextEditorDecorationType,
    annotatedDocuments: Map<string, AnnotatedDocument>,
    pendingLoads: Map<string, AbortController>,
): Promise<boolean> {
    const uriKey = editor.document.uri.toString();
    if (editor.document.uri.scheme !== 'file') { return false; }
    const existing = annotatedDocuments.get(uriKey);
    if (existing) {
        updateInlineBlame(editor, decorationType, existing.lines);
        annotatedDocuments.set(uriKey, { ...existing, editor });
        return true;
    }

    pendingLoads.get(uriKey)?.abort();
    const controller = new AbortController();
    pendingLoads.set(uriKey, controller);
    try {
        const filePath = editor.document.uri.fsPath;
        const repoRoot = await resolveRepositoryRoot(input.repositories.contexts, filePath);
        if (!repoRoot) { return false; }
        const relativePath = path.relative(repoRoot, filePath);
        const lines = await (input.loadBlame ?? loadBlameFromGit)(repoRoot, relativePath, controller.signal);
        if (controller.signal.aborted) { return false; }
        annotatedDocuments.set(uriKey, { lines, editor });
        updateInlineBlame(editor, decorationType, lines);
        return true;
    } catch (error) {
        if (controller.signal.aborted) { return false; }
        throw error;
    } finally {
        if (pendingLoads.get(uriKey) === controller) { pendingLoads.delete(uriKey); }
    }
}

async function enableBlameAnnotations(
    input: RegisterGitBlameAnnotationsCommandInput,
    editor: vscode.TextEditor,
    decorationType: vscode.TextEditorDecorationType,
    changedLinesHighlightDecorationType: vscode.TextEditorDecorationType,
    annotatedDocuments: Map<string, AnnotatedDocument>,
    pendingLoads: Map<string, AbortController>,
): Promise<boolean> {
    const uriKey = editor.document.uri.toString();
    if (editor.document.uri.scheme !== 'file') { return false; }
    const existing = annotatedDocuments.get(uriKey);
    if (existing) {
        updateChangedLinesHighlight(editor, changedLinesHighlightDecorationType, existing.lines);
        updateBlameAnnotations(editor, decorationType, existing.lines);
        annotatedDocuments.set(uriKey, { ...existing, editor });
        return true;
    }

    pendingLoads.get(uriKey)?.abort();
    const controller = new AbortController();
    pendingLoads.set(uriKey, controller);
    try {
        const filePath = editor.document.uri.fsPath;
        const repoRoot = await resolveRepositoryRoot(input.repositories.contexts, filePath);
        if (!repoRoot) { return false; }
        const relativePath = path.relative(repoRoot, filePath);
        const lines = await (input.loadBlame ?? loadBlameFromGit)(repoRoot, relativePath, controller.signal);
        if (controller.signal.aborted) { return false; }
        annotatedDocuments.set(uriKey, { lines, editor });
        updateChangedLinesHighlight(editor, changedLinesHighlightDecorationType, lines);
        updateBlameAnnotations(editor, decorationType, lines);
        return true;
    } catch (error) {
        if (controller.signal.aborted) { return false; }
        throw error;
    } finally {
        if (pendingLoads.get(uriKey) === controller) { pendingLoads.delete(uriKey); }
    }
}

async function resolveEditor(resource: vscode.Uri | undefined): Promise<vscode.TextEditor | undefined> {
    const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri || uri.scheme !== 'file') { return undefined; }
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document.uri.toString() === uri.toString()) { return activeEditor; }
    const document = await vscode.workspace.openTextDocument(uri);
    return vscode.window.showTextDocument(document);
}

async function resolveRepositoryRoot(contexts: readonly RepoContext[], filePath: string): Promise<string | undefined> {
    const context = contexts
        .filter((candidate) => sameOrInside(filePath, candidate.cwd))
        .sort((left, right) => normalizePathForComparison(right.cwd).length - normalizePathForComparison(left.cwd).length)[0];
    if (context) { return context.cwd; }

    try {
        return (await new GitCliBackend(path.dirname(filePath)).run(['rev-parse', '--show-toplevel'])).trim() || undefined;
    } catch {
        return undefined;
    }
}

async function loadBlameFromGit(repoRoot: string, filePath: string, signal?: AbortSignal): Promise<readonly GitBlameLine[]> {
    const backend = new GitCliBackend(repoRoot);
    return queryBlame((args, execSignal) => backend.run(args, { signal: execSignal }), filePath, signal);
}

function updateInlineBlame(
    editor: vscode.TextEditor,
    decorationType: vscode.TextEditorDecorationType,
    lines: readonly GitBlameLine[],
): void {
    editor.setDecorations(decorationType, blameDecorations(editor, lines));
}

function updateBlameAnnotations(
    editor: vscode.TextEditor,
    decorationType: vscode.TextEditorDecorationType,
    lines: readonly GitBlameLine[],
): void {
    editor.setDecorations(decorationType, blameAnnotationDecorations(lines));
}

function updateChangedLinesHighlight(
    editor: vscode.TextEditor,
    decorationType: vscode.TextEditorDecorationType,
    lines: readonly GitBlameLine[],
): void {
    const config = blameDisplayConfig();
    if (!config.highlightChangedLines) {
        clearEditorAnnotations(editor, decorationType);
        return;
    }
    const activeLine = editor.selection.active.line + 1;
    const activeBlame = lines.find((line) => line.line === activeLine);
    if (!activeBlame) {
        clearEditorAnnotations(editor, decorationType);
        return;
    }
    const ranges = lines
        .filter((line) => line.commit === activeBlame.commit)
        .map((line) => new vscode.Range(line.line - 1, 0, line.line - 1, 0));
    editor.setDecorations(decorationType, ranges);
}

function refreshInlineBlameAnnotations(
    decorationType: vscode.TextEditorDecorationType,
    annotatedDocuments: Map<string, AnnotatedDocument>,
): void {
    for (const document of annotatedDocuments.values()) {
        updateInlineBlame(document.editor, decorationType, document.lines);
    }
}

function refreshBlameAnnotations(
    decorationType: vscode.TextEditorDecorationType,
    changedLinesHighlightDecorationType: vscode.TextEditorDecorationType,
    annotatedDocuments: Map<string, AnnotatedDocument>,
): void {
    for (const document of annotatedDocuments.values()) {
        updateChangedLinesHighlight(document.editor, changedLinesHighlightDecorationType, document.lines);
        updateBlameAnnotations(document.editor, decorationType, document.lines);
    }
}

function blameDecorations(editor: vscode.TextEditor, lines: readonly GitBlameLine[]): vscode.DecorationOptions[] {
    const document = editor.document;
    const documentLines = document.getText().split(/\r?\n/);
    const activeLine = editor.selection.active.line + 1;
    const line = lines.find((candidate) => candidate.line === activeLine);
    if (!line) { return []; }
    const config = blameDisplayConfig();
    const annotation = formatBlameAnnotation(line, config);
    const lineText = documentLines[line.line - 1] ?? '';
    return [{
        range: new vscode.Range(line.line - 1, lineText.length, line.line - 1, lineText.length),
        renderOptions: { after: { contentText: annotation } },
        hoverMessage: buildBlameHover(line, config),
    }];
}

function blameAnnotationDecorations(lines: readonly GitBlameLine[]): vscode.DecorationOptions[] {
    const config = blameDisplayConfig();
    const labels = lines.map((line, index) => formatBlameColumnAnnotation(line, lines[index - 1], config));
    const maxWidth = Math.min(MAX_BLAME_ANNOTATION_WIDTH, Math.max(0, ...labels.map((label) => label.length)));
    if (maxWidth <= 0) { return []; }
    return lines.map((line, index) => {
        const label = labels[index] ?? '';
        return {
            range: new vscode.Range(line.line - 1, 0, line.line - 1, 0),
            renderOptions: {
                before: {
                    contentText: `\u2007${padBlameColumnAnnotation(label, maxWidth)}\u2007`,
                    color: new vscode.ThemeColor('list.deemphasizedForeground'),
                    margin: '0 0.5ch 0 0',
                    width: `${maxWidth + 2}ch`,
                    fontWeight: 'normal',
                    fontStyle: 'normal',
                },
            },
            hoverMessage: buildBlameHover(line, config),
        };
    });
}

function clearEditorAnnotations(editor: vscode.TextEditor, decorationType: vscode.TextEditorDecorationType): void {
    editor.setDecorations(decorationType, []);
}

function clearAnnotations(
    decorationType: vscode.TextEditorDecorationType,
    annotatedDocuments: Map<string, AnnotatedDocument>,
    pendingLoads: Map<string, AbortController>,
): void {
    abortPendingLoads(pendingLoads);
    for (const document of annotatedDocuments.values()) {
        clearEditorAnnotations(document.editor, decorationType);
    }
    annotatedDocuments.clear();
}

function abortPendingLoads(pendingLoads: Map<string, AbortController>): void {
    for (const pendingLoad of pendingLoads.values()) {
        pendingLoad.abort();
    }
    pendingLoads.clear();
}

function isInlineBlameEnabled(): boolean {
    return vscode.workspace.getConfiguration('lookGit').get<boolean>(INLINE_BLAME_ENABLED_SETTING, false);
}

function blameDisplayConfig(): BlameDisplayConfig {
    const configuration = vscode.workspace.getConfiguration('lookGit');
    return {
        mergeCommitLines: configuration.get<boolean>(BLAME_MERGE_COMMIT_LINES_SETTING, false),
        highlightChangedLines: configuration.get<boolean>(BLAME_HIGHLIGHT_CHANGED_LINES_SETTING, false),
        dateFormatStyle: getConfigurationEnum(configuration.get(BLAME_DATE_FORMAT_STYLE_SETTING, 'date'), DATE_FORMAT_STYLES, 'date'),
        authorNameStyle: getConfigurationEnum(configuration.get(BLAME_AUTHOR_NAME_STYLE_SETTING, 'full'), AUTHOR_NAME_STYLES, 'full'),
    };
}

function getConfigurationEnum<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
    return isConfigurationEnum(value, values) ? value : fallback;
}

function isConfigurationEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
    return typeof value === 'string' && values.some((candidate) => candidate === value);
}

function formatBlameAnnotation(line: GitBlameLine, config: BlameDisplayConfig): string {
    return `${formatBlameAuthor(line.author, config.authorNameStyle)} ${formatBlameDate(line.authorTime, config.dateFormatStyle)}`.trim();
}

function formatBlameColumnAnnotation(
    line: GitBlameLine,
    previousLine: GitBlameLine | undefined,
    config: BlameDisplayConfig,
): string {
    if (config.mergeCommitLines && previousLine?.commit === line.commit) { return ''; }
    const label = `${formatBlameDate(line.authorTime, config.dateFormatStyle)} ${formatBlameAuthor(line.author, config.authorNameStyle)}`.trim();
    return label.length > MAX_BLAME_ANNOTATION_WIDTH
        ? `${label.slice(0, MAX_BLAME_ANNOTATION_WIDTH - 3)}...`
        : label;
}

function padBlameColumnAnnotation(label: string, width: number): string {
    return label.padEnd(width, '\u2007');
}

function buildBlameHover(line: GitBlameLine, config: BlameDisplayConfig): vscode.MarkdownString {
    const commitArg = encodeURIComponent(JSON.stringify([line.commit]));
    const parts = [
        `Commit: ${line.commit}`,
        `Author: ${formatBlameAuthor(line.author, config.authorNameStyle)}`,
        `Date: ${formatBlameDateTime(line.authorTime) || 'Unknown'}`,
    ];
    if (line.summary) { parts.push(`Summary: ${line.summary}`); }
    parts.push(`[Open in Commit History](command:${REVEAL_HISTORY_COMMIT_COMMAND}?${commitArg}) | [Open in Look Graph](command:${REVEAL_GRAPH_COMMIT_COMMAND}?${commitArg})`);
    const markdown = new vscode.MarkdownString(parts.join('\n\n'));
    markdown.isTrusted = true;
    return markdown;
}

function formatBlameAuthor(author: string | undefined, style: BlameAuthorNameStyle): string {
    const value = author?.trim() || 'Unknown';
    const parts = value.split(/\s+/).filter(Boolean);
    if (style === 'first') { return parts[0] ?? value; }
    if (style === 'last') { return parts.at(-1) ?? value; }
    return value;
}

function formatBlameDate(authorTime: number | undefined, style: BlameDateFormatStyle): string {
    if (authorTime === undefined) { return ''; }
    const date = new Date(authorTime * 1000);
    if (style === 'dateTime') { return date.toISOString().replace('T', ' ').slice(0, 19); }
    if (style === 'time') { return date.toISOString().slice(11, 19); }
    if (style === 'relative') { return formatRelativeDate(date); }
    if (style === 'iso') { return date.toISOString(); }
    return date.toISOString().slice(0, 10);
}

function formatBlameDateTime(authorTime: number | undefined): string {
    return authorTime === undefined ? '' : new Date(authorTime * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function formatRelativeDate(date: Date): string {
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) { return `${seconds}s ago`; }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) { return `${minutes}m ago`; }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) { return `${hours}h ago`; }
    const days = Math.floor(hours / 24);
    if (days < 30) { return `${days}d ago`; }
    const months = Math.floor(days / 30);
    if (months < 12) { return `${months}mo ago`; }
    return `${Math.floor(months / 12)}y ago`;
}

function sameOrInside(resourcePath: string, parentPath: string): boolean {
    return normalizePathForComparison(resourcePath) === normalizePathForComparison(parentPath)
        || isPathInside(resourcePath, parentPath);
}
