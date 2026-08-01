import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { browser, $, $$ } from '@wdio/globals';
import { removeDirSyncWithRetry } from '@tests/helpers/git-repo';

type WdioElement = ReturnType<typeof $>;

describe('repository lifecycle e2e', () => {
    it('updates repository views after external repository initialization and removal', async () => {
        const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-wdio-lifecycle-'));
        fs.writeFileSync(path.join(workspacePath, 'test.py'), 'print("hello world")\n');

        try {
            await activateLookGit(workspacePath);
            await focusChangesView();
            await waitForRepositoryAvailability(false);

            execFileSync('git', ['init', '--initial-branch=master'], { cwd: workspacePath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
            configureGitIdentity(workspacePath);
            await waitForRepositoryAvailability(true);
            await waitForFreshGraph('master');
            await commitAllChanges('feat(test): initial commit');
            await waitForChangesClean();
            await waitForHistoryCommit('feat(test): initial commit');
            await waitForGraphCommit('feat(test): initial commit');

            fs.appendFileSync(path.join(workspacePath, 'test.py'), 'print("external change")\n');
            execFileSync('git', ['add', 'test.py'], { cwd: workspacePath, stdio: ['ignore', 'pipe', 'pipe'] });
            execFileSync('git', ['commit', '-m', 'feat(test): external commit'], { cwd: workspacePath, stdio: ['ignore', 'pipe', 'pipe'] });
            await waitForGraphCommit('feat(test): external commit');
            await waitForHistoryCommit('feat(test): external commit');
            await waitForChangesClean();

            removeDirSyncWithRetry(path.join(workspacePath, '.git'));
            await waitForRepositoryAvailability(false);
            await waitForMissingGraph('master');

            execFileSync('git', ['init', '--initial-branch=master'], { cwd: workspacePath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
            await waitForRepositoryAvailability(true);
            await waitForFreshGraph('master');
        } finally {
            await closeWebview();
            removeDirSyncWithRetry(workspacePath);
        }
    });
});

async function activateLookGit(workspacePath: string): Promise<void> {
    await browser.executeWorkbench(async (vscode, requestedWorkspacePath: string) => {
        const folderCount = vscode.workspace.workspaceFolders?.length ?? 0;
        const updated = vscode.workspace.updateWorkspaceFolders(0, folderCount, {
            uri: vscode.Uri.file(requestedWorkspacePath),
            name: 'repository-lifecycle',
        });
        if (!updated) { throw new Error('VS Code did not replace the workspace folder.'); }
        const extension = vscode.extensions.getExtension('mathias8dev.look-git');
        if (!extension) { throw new Error('Look Git extension is not installed in the WDIO host.'); }
        await extension.activate();
    }, workspacePath);
}

async function focusChangesView(): Promise<void> {
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand('workbench.view.extension.look-git');
        await vscode.commands.executeCommand('lookGit.changesView.focus');
    });
}

async function focusGraphView(): Promise<void> {
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand('workbench.view.extension.look-git-graph');
        await vscode.commands.executeCommand('lookGit.graphView.focus');
    });
}

async function focusHistoryView(): Promise<void> {
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand('workbench.view.extension.look-git');
        await vscode.commands.executeCommand('lookGit.commitHistory.focus');
    });
}

async function waitForRepositoryAvailability(available: boolean): Promise<void> {
    let snapshot = '';
    try {
        await pollUntil(async () => {
            const state = await readChangesState();
            snapshot = state.snapshot;
            return state.available === available;
        }, `Expected repository availability ${available}.`, 30_000);
    } catch (error) {
        throw new Error(`Expected repository availability ${available}. Last snapshot:\n${snapshot}`, { cause: error });
    }
}

async function readChangesState(): Promise<{ readonly available: boolean | undefined; readonly snapshot: string }> {
    await focusChangesView();
    for (const webview of await webviewFrames()) {
        try {
            await openWebview(webview);
            const state = await browser.execute(() => {
                if (!document.querySelector('main.changes-shell')) {
                    return { available: undefined, snapshot: document.body.textContent ?? '<empty>' };
                }
                const hasComposer = Boolean(document.querySelector('.commit-composer'));
                const hasNoRepositoryState = (document.body.textContent ?? '').includes('No repository');
                const hasError = Boolean(document.querySelector('.error-notice'));
                const snapshot = document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? '<empty>';
                if (hasComposer && !hasNoRepositoryState && !hasError) { return { available: true, snapshot }; }
                if (!hasComposer && hasNoRepositoryState && !hasError) { return { available: false, snapshot }; }
                return { available: undefined, snapshot };
            });
            if (state.available !== undefined) { return state; }
        } catch {
            // The workbench may replace a webview frame while repository availability changes.
        } finally {
            await closeWebview();
        }
    }
    return { available: undefined, snapshot: '<Changes webview unavailable>' };
}

async function waitForFreshGraph(branch: string): Promise<void> {
    let snapshot = '';
    await focusGraphView();
    try {
        await pollUntil(async () => {
            for (const webview of await webviewFrames()) {
                try {
                    await openWebview(webview);
                    const state = await browser.execute((expectedBranch: string) => {
                        const graph = document.querySelector('.graph-shell');
                        const text = graph?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? '<empty>';
                        const hasError = Boolean(graph?.querySelector('.error-notice'));
                        const hasWip = Boolean(graph?.querySelector('.wip-label'));
                        return {
                            ready: Boolean(graph) && !hasError && hasWip && text.includes(expectedBranch),
                            snapshot: `graph=${Boolean(graph)} error=${hasError} wip=${hasWip}\n${text}`,
                        };
                    }, branch);
                    snapshot = state.snapshot;
                    if (state.ready) { return true; }
                } catch {
                    // The workbench may replace a webview frame while repository availability changes.
                } finally {
                    await closeWebview();
                }
            }
            return false;
        }, `Expected fresh graph for branch ${branch}.`, 30_000);
    } catch (error) {
        throw new Error(`Expected fresh graph for branch ${branch}. Last snapshot:\n${snapshot}`, { cause: error });
    }
}

async function commitAllChanges(message: string): Promise<void> {
    await clickChangesButton('Stage all changed files');
    await waitForChangesSelector('button[title="Unstage all staged files"]');
    await pollUntil(async () => await updateCommitMessage(message), 'Expected commit message input.');
    await clickChangesButton('Commit');
}

async function clickChangesButton(title: string): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        await focusChangesView();
        for (const webview of await webviewFrames()) {
            try {
                await openWebview(webview);
                const result = await browser.execute((expectedTitle: string) => {
                    const shell = document.querySelector('main.changes-shell');
                    const button = Array.from(shell?.querySelectorAll<HTMLButtonElement>('button') ?? [])
                        .find((candidate) => candidate.title === expectedTitle
                            || candidate.getAttribute('aria-label') === expectedTitle
                            || candidate.textContent?.trim() === expectedTitle);
                    const text = shell?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? '<empty>';
                    if (!button || button.disabled) { return { clicked: false, snapshot: text }; }
                    button.click();
                    return { clicked: true, snapshot: text };
                }, title);
                snapshot = result.snapshot;
                if (result.clicked) { return true; }
            } catch {
                // The workbench may replace a webview frame while repository state changes.
            } finally {
                await closeWebview();
            }
        }
        return false;
    }, `Expected enabled Changes button "${title}".\n${snapshot}`, 30_000);
}

async function waitForChangesSelector(selector: string): Promise<void> {
    await pollUntil(async () => {
        await focusChangesView();
        for (const webview of await webviewFrames()) {
            try {
                await openWebview(webview);
                if (await browser.execute((expectedSelector: string) => Boolean(document.querySelector(`main.changes-shell ${expectedSelector}`)), selector)) {
                    return true;
                }
            } catch {
                // The workbench may replace a webview frame while repository state changes.
            } finally {
                await closeWebview();
            }
        }
        return false;
    }, `Expected Changes selector "${selector}".`, 30_000);
}

async function updateCommitMessage(message: string): Promise<boolean> {
    await focusChangesView();
    for (const webview of await webviewFrames()) {
        try {
            await openWebview(webview);
            const updated = await browser.execute((value: string) => {
                const input = document.querySelector<HTMLTextAreaElement>('main.changes-shell .commit-message-input');
                if (!input) { return false; }
                const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                setter?.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }, message);
            if (updated) { return true; }
        } catch {
            // The workbench may replace a webview frame while repository state changes.
        } finally {
            await closeWebview();
        }
    }
    return false;
}

async function waitForChangesClean(): Promise<void> {
    await pollUntil(async () => {
        const state = await readChangesState();
        return state.available === true && state.snapshot.includes('No changes') && !state.snapshot.includes('Command failed');
    }, 'Expected Changes to refresh to a clean working tree.', 30_000);
}

async function waitForHistoryCommit(message: string): Promise<void> {
    await focusHistoryView();
    await waitForWebviewText('main.history-shell', message);
}

async function waitForGraphCommit(message: string): Promise<void> {
    await waitForWebviewText('.graph-shell', message);
}

async function waitForWebviewText(selector: string, expectedText: string): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        for (const webview of await webviewFrames()) {
            try {
                await openWebview(webview);
                const state = await browser.execute((expectedSelector: string, text: string) => {
                    const root = document.querySelector(expectedSelector);
                    const snapshot = root?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? '<empty>';
                    return {
                        ready: Boolean(root) && !root?.querySelector('.error-notice') && snapshot.includes(text),
                        snapshot,
                    };
                }, selector, expectedText);
                snapshot = state.snapshot;
                if (state.ready) { return true; }
            } catch {
                // The workbench may replace a webview frame while repository state changes.
            } finally {
                await closeWebview();
            }
        }
        return false;
    }, `Expected "${expectedText}" in ${selector}.\n${snapshot}`, 30_000);
}

async function waitForMissingGraph(previousBranch: string): Promise<void> {
    let snapshot = '';
    try {
        await pollUntil(async () => {
            for (const webview of await webviewFrames()) {
                try {
                    await openWebview(webview);
                    const state = await browser.execute((branch: string) => {
                        const graph = document.querySelector('.graph-shell');
                        const text = graph?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? '<empty>';
                        const hasError = Boolean(graph?.querySelector('.error-notice'));
                        const hasRows = Boolean(graph?.querySelector('.graph-row'));
                        return {
                            ready: Boolean(graph) && !hasError && !hasRows && !text.includes(branch),
                            snapshot: `graph=${Boolean(graph)} error=${hasError} rows=${hasRows}\n${text}`,
                        };
                    }, previousBranch);
                    snapshot = state.snapshot;
                    if (state.ready) { return true; }
                } catch {
                    // The workbench may replace a webview frame while repository availability changes.
                } finally {
                    await closeWebview();
                }
            }
            return false;
        }, 'Expected graph to clear after repository removal.', 30_000);
    } catch (error) {
        throw new Error(`Expected graph to clear after repository removal. Last snapshot:\n${snapshot}`, { cause: error });
    }
}

async function webviewFrames(): Promise<readonly WebdriverIO.Element[]> {
    return Array.from(await $$('iframe.webview.ready').getElements());
}

async function openWebview(webview: WebdriverIO.Element): Promise<void> {
    await browser.switchFrame(null);
    await browser.switchFrame(webview);
    const activeFrame = $('#active-frame');
    await pollUntil(async () => await elementExists(activeFrame), 'Expected active webview frame.');
    await browser.switchFrame(activeFrame);
}

async function closeWebview(): Promise<void> {
    await browser.switchFrame(null);
    await browser.switchFrame(null);
}

async function pollUntil(predicate: () => Promise<boolean>, timeoutMsg: string, timeout = 10_000): Promise<void> {
    await browser.waitUntil(predicate, { interval: 100, timeout, timeoutMsg });
}

async function elementExists(element: WdioElement): Promise<boolean> {
    try {
        return await element.isExisting();
    } catch {
        return false;
    }
}

function configureGitIdentity(workspacePath: string): void {
    execFileSync('git', ['config', 'user.name', 'Look Git E2E'], { cwd: workspacePath, stdio: ['ignore', 'pipe', 'pipe'] });
    execFileSync('git', ['config', 'user.email', 'look-git-e2e@example.com'], { cwd: workspacePath, stdio: ['ignore', 'pipe', 'pipe'] });
}
