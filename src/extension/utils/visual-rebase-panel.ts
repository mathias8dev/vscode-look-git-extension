import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { createHash } from 'crypto';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import type { GitCommit } from '@core/git/domain/git-commit';
import type { VisualRebaseErrorPush, VisualRebaseRecommendedAction, VisualRebaseWebviewToExtensionMessage } from '@protocol/visual-rebase/messages';
import type { VisualRebaseAction, VisualRebaseCommit, VisualRebasePlanEntry, VisualRebaseSafety } from '@protocol/visual-rebase/types';
import { assertNoUnmergedFiles } from '@extension/commands/git-command-helpers';
import { currentBranchName } from '@extension/git/current-branch';
import { getWebviewHtml } from '@extension/views/webview-html';
import { openRuntimeThreeWayMergeEditor } from '@extension/utils/runtime-merge-editor';

const MAX_REBASE_COMMITS = 200;
const EXECUTABLE_ACTIONS = new Set<VisualRebaseAction>(['pick', 'reword', 'edit', 'squash', 'fixup', 'drop', 'break', 'merge']);
const RUNTIME_METADATA_VERSION = 1;
const RUNTIME_STORAGE_DIR = 'visual-rebase';
const RUNTIME_METADATA_DIR = 'state';
const RUNTIME_TEMP_DIR = 'runtime';

export interface VisualRebaseOptions {
    readonly upstream: string;
    readonly onto: string;
    readonly branch?: string;
    readonly title?: string;
}

export async function openVisualRebasePanel(
    repo: GitRepository,
    worktree: Worktree,
    extensionUri: vscode.Uri,
    storageUri: vscode.Uri,
    options: VisualRebaseOptions,
): Promise<void> {
    const existingRebase = await isRebaseInProgress(worktree);
    const currentBranch = options.branch ?? worktree.branch ?? await currentBranchName(repo);
    const backupTarget = worktree.branch ?? worktree.head;
    const restoredRuntime = existingRebase ? await restoreVisualRebaseRuntime(worktree, storageUri) : undefined;
    const rawCommits = existingRebase ? [] : await loadVisualRebaseCommits(repo, options.upstream, currentBranch);
    const commits = rawCommits.map(toVisualRebaseCommit);
    const mergeCommitHashes = new Set(rawCommits.filter((commit) => commit.parentHashes.length > 1).map((commit) => commit.hash));
    const mergeAware = mergeCommitHashes.size > 0;
    const safety = existingRebase
        ? await visualRebaseSafetyForExistingRebase(repo, worktree, restoredRuntime)
        : await visualRebaseSafety(repo, worktree, currentBranch, commits.length);
    const existingRebaseError = existingRebase
        ? await visualRebaseError(worktree, 'Interactive rebase already in progress. Resolve the current stop, then continue.')
        : undefined;
    const title = options.title ?? `Visual Rebase: ${currentBranch}`;
    const panel = vscode.window.createWebviewPanel(
        'lookGit.visualRebase',
        title,
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
        },
    );
    panel.webview.html = getWebviewHtml(panel.webview, extensionUri, 'visual-rebase');

    const runtime: VisualRebaseRuntime = restoredRuntime ?? { backupRef: safety.backupRef };
    let operationRunning = false;
    const runOperation = (operation: () => Promise<void>) => {
        if (operationRunning) { return; }
        operationRunning = true;
        void operation().finally(() => { operationRunning = false; });
    };
    const messageSubscription = panel.webview.onDidReceiveMessage((message: VisualRebaseWebviewToExtensionMessage) => {
        switch (message.type) {
            case 'visualRebase/ready':
                void postInitialVisualRebaseState(panel, {
                    title,
                    currentBranch,
                    upstream: options.upstream,
                    onto: options.onto,
                    commits,
                    safety,
                    existingRebaseError,
                });
                return;
            case 'visualRebase/start':
                runOperation(() => runVisualRebase(repo, worktree, panel, runtime, {
                    currentBranch,
                    upstream: options.upstream,
                    plan: message.plan,
                    backupRef: safety.backupRef,
                    backupTarget,
                    mergeCommitHashes,
                    mergeAware,
                    storageUri,
                }));
                return;
            case 'visualRebase/cancel':
                panel.dispose();
                return;
            case 'visualRebase/continue':
                runOperation(() => continueVisualRebase(worktree, panel, runtime, storageUri, 'continue'));
                return;
            case 'visualRebase/abort':
                runOperation(() => abortVisualRebase(worktree, panel, runtime, storageUri));
                return;
            case 'visualRebase/skip':
                runOperation(() => continueVisualRebase(worktree, panel, runtime, storageUri, 'skip'));
                return;
            case 'visualRebase/markResolved':
                runOperation(() => markVisualRebaseResolved(worktree, panel, message.filePath));
                return;
            case 'visualRebase/acceptYours':
                runOperation(() => acceptVisualRebaseConflict(worktree, panel, message.filePath, 'yours'));
                return;
            case 'visualRebase/acceptIncoming':
                runOperation(() => acceptVisualRebaseConflict(worktree, panel, message.filePath, 'incoming'));
                return;
            case 'visualRebase/openMergeEditor':
                void openRuntimeThreeWayMergeEditor(worktree, message.filePath).catch(async (error: unknown) => {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    await panel.webview.postMessage(await visualRebaseError(worktree, errorMessage));
                });
                return;
        }
    });
    panel.onDidDispose(() => { messageSubscription.dispose(); });
    void vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow').then(undefined, () => {
        void vscode.window.showWarningMessage('Could not open Visual Rebase in a separate window. Continuing in an editor tab.');
        panel.reveal(vscode.ViewColumn.Active);
    });
}

async function loadVisualRebaseCommits(
    repo: GitRepository,
    upstream: string,
    branch: string,
): Promise<readonly GitCommit[]> {
    const commits = await repo.getCommitRange(upstream, branch, { limit: MAX_REBASE_COMMITS + 1 });
    if (commits.items.length > MAX_REBASE_COMMITS) {
        throw new Error(`Visual Rebase supports up to ${MAX_REBASE_COMMITS} commits at a time.`);
    }
    return commits.items.slice().reverse();
}

function toVisualRebaseCommit(commit: GitCommit): VisualRebaseCommit {
    return {
        hash: commit.hash,
        shortHash: commit.shortHash,
        message: commit.message,
        authorName: commit.authorName,
        authorDate: commit.authorDate,
        action: commit.parentHashes.length > 1 ? 'merge' : 'pick',
        isMerge: commit.parentHashes.length > 1,
    };
}

async function visualRebaseSafety(repo: GitRepository, worktree: Worktree, currentBranch: string, commitCount: number): Promise<VisualRebaseSafety> {
    const [status, upstream] = await Promise.all([
        worktree.getStatus(),
        repo.getUpstreamBranch(currentBranch).catch(() => undefined),
    ]);
    const ahead = upstream
        ? await repo.getAheadBehind(currentBranch, upstream).then((value) => value.ahead).catch(() => commitCount)
        : commitCount;
    const safeBranch = currentBranch.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'branch';
    return {
        workingTreeClean: status.staged.length === 0 && status.unstaged.length === 0 && status.conflicts.length === 0,
        hasUpstream: upstream !== undefined,
        pushedCommits: Math.max(0, commitCount - (Number.isFinite(ahead) ? ahead : commitCount)),
        backupRef: `refs/look-git/backup/${safeBranch}-${timestampForRef(new Date())}`,
    };
}

async function visualRebaseSafetyForExistingRebase(repo: GitRepository, worktree: Worktree, runtime: VisualRebaseRuntime | undefined): Promise<VisualRebaseSafety> {
    const [status, upstream] = await Promise.all([
        worktree.getStatus().catch(() => undefined),
        currentBranchName(repo).then((branch) => repo.getUpstreamBranch(branch)).catch(() => undefined),
    ]);
    return {
        workingTreeClean: status === undefined
            ? false
            : status.staged.length === 0 && status.unstaged.length === 0 && status.conflicts.length === 0,
        hasUpstream: upstream !== undefined,
        pushedCommits: 0,
        backupRef: runtime?.backupRef ?? '',
    };
}

interface InitialVisualRebaseState {
    readonly title: string;
    readonly currentBranch: string;
    readonly upstream: string;
    readonly onto: string;
    readonly commits: readonly VisualRebaseCommit[];
    readonly safety: VisualRebaseSafety;
    readonly existingRebaseError: VisualRebaseErrorPush | undefined;
}

async function postInitialVisualRebaseState(panel: vscode.WebviewPanel, state: InitialVisualRebaseState): Promise<void> {
    await panel.webview.postMessage({
        type: 'visualRebase/init',
        title: state.title,
        currentBranch: state.currentBranch,
        upstream: state.upstream,
        onto: state.onto,
        commits: state.commits,
        safety: state.safety,
    });
    if (state.existingRebaseError) {
        await panel.webview.postMessage(state.existingRebaseError);
    }
}

interface RunVisualRebaseOptions {
    readonly currentBranch: string;
    readonly upstream: string;
    readonly plan: readonly VisualRebasePlanEntry[];
    readonly backupRef: string;
    readonly backupTarget: string;
    readonly mergeCommitHashes: ReadonlySet<string>;
    readonly mergeAware: boolean;
    readonly storageUri: vscode.Uri;
}

interface VisualRebaseRuntime {
    readonly backupRef: string;
    tempDir?: string;
    env?: Record<string, string>;
}

async function runVisualRebase(
    repo: GitRepository,
    worktree: Worktree,
    panel: vscode.WebviewPanel,
    runtime: VisualRebaseRuntime,
    options: RunVisualRebaseOptions,
): Promise<void> {
    await panel.webview.postMessage({ type: 'visualRebase/started' });
    let keepRuntime = false;
    try {
        await validateVisualRebasePlan(worktree, options.plan, options.mergeCommitHashes);
        await cleanupVisualRebaseRuntime(worktree, options.storageUri, runtime);
        await repo.updateRef(options.backupRef, options.backupTarget);
        const tempDir = await createVisualRebaseRuntimeDir(worktree, options.storageUri);
        const todoPath = path.join(tempDir, 'git-rebase-todo');
        const editorPath = path.join(tempDir, 'sequence-editor.cjs');
        const messageEditorPath = path.join(tempDir, 'message-editor.cjs');
        const messageQueuePath = path.join(tempDir, 'messages.json');
        const planPath = path.join(tempDir, 'plan.json');
        await fs.writeFile(todoPath, options.mergeAware ? '' : visualRebaseTodo(options.plan), 'utf8');
        await fs.writeFile(planPath, JSON.stringify(options.plan), 'utf8');
        await fs.writeFile(editorPath, options.mergeAware ? mergeAwareSequenceEditorScript() : sequenceEditorScript(), 'utf8');
        await fs.writeFile(messageEditorPath, messageEditorScript(), 'utf8');
        await fs.writeFile(messageQueuePath, JSON.stringify(options.mergeAware ? [] : editorMessageQueue(options.plan)), 'utf8');
        runtime.tempDir = tempDir;
        runtime.env = {
            LOOK_GIT_REBASE_TODO: todoPath,
            LOOK_GIT_REBASE_PLAN: planPath,
            LOOK_GIT_REBASE_MESSAGES: messageQueuePath,
            GIT_SEQUENCE_EDITOR: nodeEditorCommand(editorPath),
            GIT_EDITOR: nodeEditorCommand(messageEditorPath),
        };
        await persistVisualRebaseRuntime(worktree, options.storageUri, runtime);
        await worktree.startInteractiveRebase(options.upstream, options.mergeAware ? '' : visualRebaseTodo(options.plan), {
            autostash: true,
            rebaseMerges: options.mergeAware,
            editorEnv: runtime.env,
        });
        keepRuntime = await postRebasePausedOrCompleted(worktree, panel, options.backupRef);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorMessage = await visualRebaseError(worktree, message);
        keepRuntime = errorMessage.rebaseInProgress === true;
        await panel.webview.postMessage(errorMessage);
    } finally {
        if (!keepRuntime) {
            await cleanupVisualRebaseRuntime(worktree, options.storageUri, runtime);
        }
    }
}

async function validateVisualRebasePlan(
    worktree: Worktree,
    plan: readonly VisualRebasePlanEntry[],
    mergeCommitHashes: ReadonlySet<string>,
): Promise<void> {
    if (await isRebaseInProgress(worktree)) {
        throw new Error('A rebase is already in progress.');
    }
    await assertNoUnmergedFiles(worktree, 'starting a visual rebase');
    const status = await worktree.getStatus();
    if (status.staged.length > 0 || status.unstaged.length > 0 || status.conflicts.length > 0) {
        throw new Error('Visual Rebase requires a clean working tree.');
    }
    if (plan.length === 0) { throw new Error('Visual Rebase requires at least one commit.'); }
    if (plan.every((entry) => entry.action === 'drop')) { throw new Error('Visual Rebase cannot drop every commit.'); }
    for (const [index, entry] of plan.entries()) {
        if (!EXECUTABLE_ACTIONS.has(entry.action)) {
            throw new Error(`The "${entry.action}" action is shown in the planner but is not executable yet.`);
        }
        const isMergeCommit = mergeCommitHashes.has(entry.hash);
        if (isMergeCommit && entry.action !== 'merge' && entry.action !== 'reword' && entry.action !== 'break') {
            throw new Error(`Merge commit ${entry.hash.substring(0, 7)} supports merge, reword, or break.`);
        }
        if (!isMergeCommit && entry.action === 'merge') {
            throw new Error(`Only merge commits can use the merge action.`);
        }
        if ((entry.action === 'squash' || entry.action === 'fixup') && index === 0) {
            throw new Error(`${entry.action} cannot be used on the first commit.`);
        }
    }
}

async function continueVisualRebase(
    worktree: Worktree,
    panel: vscode.WebviewPanel,
    runtime: VisualRebaseRuntime,
    storageUri: vscode.Uri,
    mode: 'continue' | 'skip',
): Promise<void> {
    await panel.webview.postMessage({ type: 'visualRebase/started' });
    let keepRuntime = false;
    try {
        if (mode === 'continue') {
            await worktree.continueRebase(runtime.env ? { editorEnv: runtime.env } : undefined);
        } else {
            await worktree.skipRebase(runtime.env ? { editorEnv: runtime.env } : undefined);
        }
        keepRuntime = await postRebasePausedOrCompleted(worktree, panel, runtime.backupRef);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorMessage = await visualRebaseError(worktree, message);
        keepRuntime = errorMessage.rebaseInProgress === true;
        await panel.webview.postMessage(errorMessage);
    } finally {
        if (!keepRuntime) {
            await cleanupVisualRebaseRuntime(worktree, storageUri, runtime);
        }
    }
}

async function abortVisualRebase(worktree: Worktree, panel: vscode.WebviewPanel, runtime: VisualRebaseRuntime, storageUri: vscode.Uri): Promise<void> {
    await panel.webview.postMessage({ type: 'visualRebase/started' });
    try {
        await worktree.abortRebase();
        await panel.webview.postMessage({ type: 'visualRebase/error', message: 'Rebase aborted.' });
        await cleanupVisualRebaseRuntime(worktree, storageUri, runtime);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await panel.webview.postMessage(await visualRebaseError(worktree, message));
    }
}

async function markVisualRebaseResolved(worktree: Worktree, panel: vscode.WebviewPanel, filePath: string): Promise<void> {
    await panel.webview.postMessage({ type: 'visualRebase/started' });
    try {
        await worktree.stage([filePath]);
        const status = await worktree.getStatus();
        const hasConflicts = status.conflicts.length > 0;
        await panel.webview.postMessage(await visualRebaseError(
            worktree,
            hasConflicts ? 'Resolve remaining conflicts, then continue.' : 'All conflicts marked resolved. Continue the rebase.',
            hasConflicts ? undefined : 'continue',
        ));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await panel.webview.postMessage(await visualRebaseError(worktree, message));
    }
}

async function acceptVisualRebaseConflict(
    worktree: Worktree,
    panel: vscode.WebviewPanel,
    filePath: string,
    side: 'yours' | 'incoming',
): Promise<void> {
    await panel.webview.postMessage({ type: 'visualRebase/started' });
    try {
        if (side === 'yours') {
            await worktree.acceptOurs([filePath]);
        } else {
            await worktree.acceptTheirs([filePath]);
        }
        await worktree.stage([filePath]);
        const status = await worktree.getStatus();
        const hasConflicts = status.conflicts.length > 0;
        const hasStagedChanges = status.staged.length > 0;
        const recommendedAction = hasConflicts ? undefined : hasStagedChanges ? 'continue' : 'skip';
        await panel.webview.postMessage(await visualRebaseError(
            worktree,
            hasConflicts
                ? 'Accepted conflict side. Resolve remaining conflicts, then continue.'
                : hasStagedChanges
                    ? 'Accepted conflict side. Continue the rebase.'
                    : 'Accepted conflict side. No changes remain; skip this commit to continue the rebase.',
            recommendedAction,
        ));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await panel.webview.postMessage(await visualRebaseError(worktree, message));
    }
}

async function postRebasePausedOrCompleted(worktree: Worktree, panel: vscode.WebviewPanel, backupRef: string): Promise<boolean> {
    if (await isRebaseInProgress(worktree)) {
        await panel.webview.postMessage(await visualRebaseError(worktree, 'Rebase paused. Resolve the current stop, then continue.'));
        return true;
    }
    await panel.webview.postMessage({ type: 'visualRebase/completed', backupRef });
    return false;
}

async function visualRebaseError(
    worktree: Worktree,
    message: string,
    recommendedAction?: VisualRebaseRecommendedAction,
): Promise<VisualRebaseErrorPush> {
    const status = await worktree.getStatus().catch(() => undefined);
    const conflictFiles = status?.conflicts.map((entry) => entry.filePath) ?? [];
    const rebaseInProgress = await isRebaseInProgress(worktree);
    return {
        type: 'visualRebase/error' as const,
        message,
        ...(conflictFiles.length > 0 ? { conflictFiles } : {}),
        ...(rebaseInProgress ? { rebaseInProgress: true } : {}),
        ...(recommendedAction ? { recommendedAction } : {}),
    };
}

function visualRebaseTodo(plan: readonly VisualRebasePlanEntry[]): string {
    return plan
        .flatMap(todoLinesForPlanEntry)
        .join('\n') + '\n';
}

function todoLinesForPlanEntry(entry: VisualRebasePlanEntry): readonly string[] {
    if (entry.action === 'merge') { return []; }
    const commitLine = `${entry.action === 'break' ? 'pick' : entry.action} ${entry.hash} ${todoSubject(entry.message)}`;
    return entry.action === 'break' ? [commitLine, 'break'] : [commitLine];
}

function todoSubject(message: string): string {
    return message.split(/\r?\n/)[0]?.trim() ?? '';
}

function editorMessageQueue(plan: readonly VisualRebasePlanEntry[]): readonly (string | null)[] {
    return plan.flatMap((entry) => {
        if (entry.action === 'reword') { return [entry.message.trim()]; }
        if (entry.action === 'squash') { return [null]; }
        return [];
    });
}

function sequenceEditorScript(): string {
    return [
        "const fs = require('fs');",
        'const target = process.argv[2];',
        'const source = process.env.LOOK_GIT_REBASE_TODO;',
        'if (!target || !source) { process.exit(1); }',
        'fs.copyFileSync(source, target);',
    ].join('\n') + '\n';
}

function mergeAwareSequenceEditorScript(): string {
    return [
        "const fs = require('fs');",
        'const target = process.argv[2];',
        'const planPath = process.env.LOOK_GIT_REBASE_PLAN;',
        'const queuePath = process.env.LOOK_GIT_REBASE_MESSAGES;',
        'if (!target || !planPath || !queuePath) { process.exit(1); }',
        'const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));',
        'const findEntry = (hash) => plan.find((entry) => entry.hash === hash || entry.hash.startsWith(hash) || hash.startsWith(entry.hash));',
        'const subject = (message) => String(message || "").split(/\\r?\\n/)[0].trim();',
        'const messages = [];',
        'const lines = fs.readFileSync(target, "utf8").split(/\\r?\\n/);',
        'const output = [];',
        'for (const line of lines) {',
        '  const mergeMatch = line.match(/^(\\s*)merge\\s+-(C|c)\\s+([0-9a-fA-F]+)(.*)$/);',
        '  if (mergeMatch) {',
        '    const entry = findEntry(mergeMatch[3]);',
        '    if (!entry || entry.action === "merge") { output.push(line); continue; }',
        '    const mergeLine = `${mergeMatch[1]}merge ${entry.action === "reword" ? "-c" : "-C"} ${mergeMatch[3]}${mergeMatch[4]}`;',
        '    output.push(mergeLine);',
        '    if (entry.action === "reword") { messages.push(String(entry.message || "").trim()); }',
        '    if (entry.action === "break") { output.push("break"); }',
        '    continue;',
        '  }',
        '  const match = line.match(/^(\\s*)(pick|reword|edit|squash|fixup|drop)\\s+([0-9a-fA-F]+)(.*)$/);',
        '  if (!match) { output.push(line); continue; }',
        '  const entry = findEntry(match[3]);',
        '  if (!entry || entry.action === "merge") { output.push(line); continue; }',
        '  if (entry.action === "break") {',
        '    output.push(`${match[1]}pick ${match[3]} ${subject(entry.message)}`);',
        '    output.push("break");',
        '    continue;',
        '  }',
        '  output.push(`${match[1]}${entry.action} ${match[3]} ${subject(entry.message)}`);',
        '  if (entry.action === "reword") { messages.push(String(entry.message || "").trim()); }',
        '  if (entry.action === "squash") { messages.push(null); }',
        '}',
        'fs.writeFileSync(target, output.join("\\n"));',
        'fs.writeFileSync(queuePath, JSON.stringify(messages));',
    ].join('\n') + '\n';
}

function messageEditorScript(): string {
    return [
        "const fs = require('fs');",
        'const target = process.argv[2];',
        'const queuePath = process.env.LOOK_GIT_REBASE_MESSAGES;',
        'if (!target || !queuePath) { process.exit(0); }',
        'let queue = [];',
        'try { queue = JSON.parse(fs.readFileSync(queuePath, "utf8")); } catch { process.exit(0); }',
        'if (!Array.isArray(queue) || queue.length === 0) { process.exit(0); }',
        'const message = queue.shift();',
        'fs.writeFileSync(queuePath, JSON.stringify(queue));',
        'if (typeof message === "string" && message.trim()) { fs.writeFileSync(target, message.trim() + "\\n"); }',
    ].join('\n') + '\n';
}

function nodeEditorCommand(scriptPath: string): string {
    return `${quoteArg(process.execPath)} ${quoteArg(scriptPath)}`;
}

function quoteArg(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

interface VisualRebaseRuntimeMetadata {
    readonly version: 1;
    readonly backupRef: string;
    readonly tempDir: string;
    readonly env: Record<string, string>;
}

async function persistVisualRebaseRuntime(worktree: Worktree, storageUri: vscode.Uri, runtime: VisualRebaseRuntime): Promise<void> {
    if (!runtime.tempDir || !runtime.env) { return; }
    const metadataPath = visualRebaseRuntimeMetadataPath(worktree, storageUri);
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    const metadata: VisualRebaseRuntimeMetadata = {
        version: RUNTIME_METADATA_VERSION,
        backupRef: runtime.backupRef,
        tempDir: runtime.tempDir,
        env: runtime.env,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata), 'utf8');
}

async function restoreVisualRebaseRuntime(worktree: Worktree, storageUri: vscode.Uri): Promise<VisualRebaseRuntime | undefined> {
    const metadataPath = visualRebaseRuntimeMetadataPath(worktree, storageUri);
    try {
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as unknown;
        if (!isVisualRebaseRuntimeMetadata(metadata)) { return undefined; }
        await fs.access(metadata.tempDir);
        return {
            backupRef: metadata.backupRef,
            tempDir: metadata.tempDir,
            env: metadata.env,
        };
    } catch {
        return undefined;
    }
}

async function cleanupVisualRebaseRuntime(worktree: Worktree, storageUri: vscode.Uri, runtime: VisualRebaseRuntime): Promise<void> {
    if (runtime.tempDir) {
        await fs.rm(runtime.tempDir, { recursive: true, force: true });
    }
    await removeVisualRebaseRuntimeMetadata(worktree, storageUri);
    runtime.tempDir = undefined;
    runtime.env = undefined;
}

async function removeVisualRebaseRuntimeMetadata(worktree: Worktree, storageUri: vscode.Uri): Promise<void> {
    await fs.rm(visualRebaseRuntimeMetadataPath(worktree, storageUri), { force: true });
}

async function createVisualRebaseRuntimeDir(worktree: Worktree, storageUri: vscode.Uri): Promise<string> {
    const runtimeRoot = path.join(visualRebaseStorageRoot(storageUri), RUNTIME_TEMP_DIR);
    await fs.mkdir(runtimeRoot, { recursive: true });
    return fs.mkdtemp(path.join(runtimeRoot, `${worktreeStorageKey(worktree)}-`));
}

function visualRebaseRuntimeMetadataPath(worktree: Worktree, storageUri: vscode.Uri): string {
    return path.join(visualRebaseStorageRoot(storageUri), RUNTIME_METADATA_DIR, `${worktreeStorageKey(worktree)}.json`);
}

function visualRebaseStorageRoot(storageUri: vscode.Uri): string {
    return path.join(storageUri.fsPath, RUNTIME_STORAGE_DIR);
}

function worktreeStorageKey(worktree: Worktree): string {
    const normalized = worktree.path.replace(/[\\/]+/g, '/').replace(/^([A-Z]):/, (drive) => drive.toLowerCase());
    return createHash('sha256').update(normalized).digest('hex');
}

function isVisualRebaseRuntimeMetadata(value: unknown): value is VisualRebaseRuntimeMetadata {
    if (!isRecord(value)) { return false; }
    return value.version === RUNTIME_METADATA_VERSION
        && typeof value.backupRef === 'string'
        && typeof value.tempDir === 'string'
        && isStringRecord(value.env);
}

function isStringRecord(value: unknown): value is Record<string, string> {
    if (!isRecord(value)) { return false; }
    return Object.values(value).every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function isRebaseInProgress(worktree: Worktree): Promise<boolean> {
    return (await worktree.getStatus().catch(() => undefined))?.conflictState === 'rebase';
}

function timestampForRef(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}
