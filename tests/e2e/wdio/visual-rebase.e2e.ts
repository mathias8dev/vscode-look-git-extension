import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { browser } from '@wdio/globals';

describe('visual rebase e2e', () => {
    it('updates setup in the panel and rebases onto the selected target', async () => {
        const repo = await workspaceRepoPath();
        const fixture = prepareVisualRebaseState(repo);
        await waitForLookGitReady();
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand('lookGit.commitHistory.focus');
            await vscode.commands.executeCommand('lookGit.history.refresh');
        });

        await openWebviewBySelector('main.history-shell');
        try {
            await refreshHistoryView();
            await waitForHistoryRow('feat: visual rebase change');
            await setHistoryCommitContext('feat: visual rebase change');
        } finally {
            await closeWebview();
        }

        const mainWindow = await browser.getWindowHandle();
        const windowsBeforeRebase = await browser.getWindowHandles();
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand('lookGit.history.interactiveRebaseFromHere');
        });

        await switchToNewWindow(windowsBeforeRebase);
        await openWebviewBySelectorWhenReady('main.visual-rebase');
        try {
            await waitForVisualRebaseReady();
            await pickReplayOnto('new-base');
            await waitForVisualRebaseText('new-base');
            await clickVisualRebaseButton('Start Rebase');
            await clickVisualRebaseButton('Confirm Start');
        } finally {
            await closeWebview();
            await browser.switchToWindow(mainWindow);
        }

        await waitForRepoState(repo, () => {
            const mergeBase = git(repo, ['merge-base', 'HEAD', 'new-base']).trim();
            const status = git(repo, ['status', '--porcelain=v1']);
            const subjects = git(repo, ['log', '--format=%s', 'new-base..HEAD']).trim();
            return mergeBase === fixture.newBaseHash
                && status === ''
                && subjects === 'feat: visual rebase change';
        }, 'Expected Visual Rebase to replay the selected commit onto new-base.');
    });
});

async function workspaceRepoPath(): Promise<string> {
    return await browser.executeWorkbench((vscode) => {
        const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoPath) { throw new Error('VS Code did not open a workspace folder.'); }
        return repoPath;
    });
}

async function waitForLookGitReady(): Promise<string> {
    return await browser.executeWorkbench(async (vscode) => {
        const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoPath) { throw new Error('VS Code did not open a workspace folder.'); }
        const extension = vscode.extensions.getExtension('mathias8dev.look-git');
        if (!extension) { throw new Error('Look Git extension is not installed in the WDIO host.'); }
        await extension.activate();

        await vscode.commands.executeCommand('workbench.view.extension.look-git');
        await vscode.commands.executeCommand('lookGit.history.refresh');
        return repoPath;
    });
}

function prepareVisualRebaseState(repo: string): { readonly newBaseHash: string } {
    resetScenarioState(repo);
    git(repo, ['checkout', '-q', 'main']);
    git(repo, ['reset', '--hard', 'semantic-reset-base']);
    git(repo, ['clean', '-fd']);

    git(repo, ['checkout', '-q', '-B', 'new-base', 'semantic-reset-base']);
    fs.writeFileSync(path.join(repo, 'src', 'wdio-new-base.ts'), 'export const wdioNewBase = true;\n');
    git(repo, ['add', 'src/wdio-new-base.ts']);
    git(repo, ['commit', '-q', '-m', 'test(rebase): new base']);
    const newBaseHash = git(repo, ['rev-parse', 'HEAD']).trim();

    git(repo, ['checkout', '-q', '-B', 'wdio-visual-rebase', 'semantic-reset-base']);
    fs.writeFileSync(path.join(repo, 'src', 'wdio-visual-rebase.ts'), 'export const wdioVisualRebase = true;\n');
    git(repo, ['add', 'src/wdio-visual-rebase.ts']);
    git(repo, ['commit', '-q', '-m', 'feat: visual rebase change']);
    return { newBaseHash };
}

async function openWebviewBySelector(selector: string): Promise<void> {
    const webviews = await webviewFrames();
    for (const webview of webviews) {
        await openWebview(webview);
        const found = await browser.execute((expectedSelector: string) => Boolean(document.querySelector(expectedSelector)), selector);
        if (found) {
            return;
        }
        await closeWebview();
    }
    throw new Error(`No webview contained selector "${selector}".`);
}

async function openWebviewBySelectorWhenReady(selector: string): Promise<void> {
    let lastError: unknown;
    await pollUntil(async () => {
        try {
            await openWebviewBySelector(selector);
            return true;
        } catch (error) {
            lastError = error;
            return false;
        }
    }, `Timed out waiting for webview selector ${selector}`, lastError);
}

async function switchToNewWindow(previousHandles: readonly string[]): Promise<void> {
    const previous = new Set(previousHandles);
    let handles: readonly string[] = [];
    try {
        await pollUntil(async () => {
            handles = await browser.getWindowHandles();
            return handles.some((handle) => !previous.has(handle));
        }, `Timed out waiting for Visual Rebase to open in a new VS Code window. Handles: ${handles.join(', ')}`);
    } catch (error) {
        throw new Error(`Timed out waiting for Visual Rebase to open in a new VS Code window. Handles: ${handles.join(', ')}`, { cause: error });
    }
    const next = handles.find((handle) => !previous.has(handle));
    if (!next) { throw new Error('Visual Rebase window handle disappeared before WDIO could switch to it.'); }
    await browser.switchToWindow(next);
}

async function webviewFrames(): Promise<readonly WebdriverIO.Element[]> {
    try {
        await browser.$('iframe.webview.ready').waitForExist();
    } catch {
        return [];
    }
    return Array.from(await browser.$$('iframe.webview.ready').getElements());
}

async function openWebview(webview: WebdriverIO.Element): Promise<void> {
    await browser.switchFrame(webview);
    const activeFrame = browser.$('#active-frame');
    await activeFrame.waitForExist();
    await browser.switchFrame(activeFrame);
}

async function closeWebview(): Promise<void> {
    await browser.switchFrame(null);
    await browser.switchFrame(null);
}

async function refreshHistoryView(): Promise<void> {
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand('lookGit.history.refresh');
    });
}

async function waitForHistoryRow(message: string): Promise<void> {
    try {
        await pollUntil(async () => await browser.execute((expectedMessage: string) =>
            Array.from(document.querySelectorAll('.history-row')).some((row) => row.textContent?.includes(expectedMessage)),
        message), `Expected history row containing "${message}".`);
    } catch (error) {
        const snapshot = await browser.execute(() => [
            `body=${document.body.textContent?.replace(/\s+/g, ' ').slice(0, 1000) ?? '<empty>'}`,
            `rows=${Array.from(document.querySelectorAll('.history-row')).map((row) => row.textContent?.replace(/\s+/g, ' ').trim()).join(' | ') || '<none>'}`,
        ].join('\n'));
        throw new Error(`Expected history row containing "${message}".\n${snapshot}`, { cause: error });
    }
}

async function setHistoryCommitContext(message: string): Promise<void> {
    await pollUntil(async () => await browser.execute((expectedMessage: string) => {
        const row = Array.from(document.querySelectorAll<HTMLElement>('.history-row'))
            .find((candidate) => candidate.textContent?.includes(expectedMessage));
        if (!row) { return false; }
        row.scrollIntoView({ block: 'center', inline: 'nearest' });
        row.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true }));
        row.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));
        return true;
    }, message), `Expected to set history context for "${message}".`);
}

async function waitForVisualRebaseReady(): Promise<void> {
    await pollUntil(async () => await browser.execute(() => Boolean(document.querySelector('main.visual-rebase'))), 'Expected Visual Rebase webview to be ready.');
}

async function pickReplayOnto(refName: string): Promise<void> {
    await clickVisualRebaseButton('Pick Replay onto');
    await pollUntil(async () => await browser.execute((expectedRef: string) =>
        Array.from(document.querySelectorAll('.visual-rebase-ref-results button'))
            .some((button) => button.textContent?.includes(expectedRef)),
    refName), `Expected Visual Rebase ref picker to contain "${refName}".`);
    await browser.execute((expectedRef: string) => {
        const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.visual-rebase-ref-results button'))
            .find((candidate) => candidate.textContent?.includes(expectedRef));
        button?.click();
    }, refName);
}

async function clickVisualRebaseButton(label: string): Promise<void> {
    await pollUntil(async () => await browser.execute((expectedLabel: string) => {
        const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
            .find((candidate) =>
                candidate.title === expectedLabel
                || candidate.getAttribute('aria-label') === expectedLabel
                || candidate.textContent?.trim() === expectedLabel,
            );
        if (!button || button.disabled) { return false; }
        button.scrollIntoView({ block: 'center', inline: 'nearest' });
        button.click();
        return true;
    }, label), `Expected Visual Rebase button "${label}" to be enabled.`);
}

async function waitForVisualRebaseText(text: string): Promise<void> {
    await pollUntil(async () => await browser.execute((expectedText: string) =>
        document.body.textContent?.includes(expectedText) ?? false,
    text), `Expected Visual Rebase text "${text}".`);
}

async function waitForRepoState(repo: string, predicate: () => boolean, message: string): Promise<void> {
    try {
        await pollUntil(async () => predicate(), message);
    } catch (error) {
        throw new Error(`${message}

status:
${git(repo, ['status', '--porcelain=v1']) || '<clean>'}

log:
${git(repo, ['log', '--oneline', '--decorate', '-5'])}`, { cause: error });
    }
}

async function pollUntil(predicate: () => Promise<boolean>, timeoutMsg: string, cause?: unknown): Promise<void> {
    try {
        await browser.waitUntil(predicate, { interval: 100, timeoutMsg });
    } catch (error) {
        throw new Error(timeoutMsg, { cause: cause ?? error });
    }
}

function resetScenarioState(repo: string): void {
    abortInProgressOperations(repo);
    git(repo, ['reset', '--hard']);
    git(repo, ['clean', '-fd']);
}

function abortInProgressOperations(repo: string): void {
    for (const args of [
        ['merge', '--abort'],
        ['rebase', '--abort'],
        ['cherry-pick', '--abort'],
        ['revert', '--abort'],
    ] as const) {
        try { git(repo, args); } catch { /* operation was not active */ }
    }
}

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
