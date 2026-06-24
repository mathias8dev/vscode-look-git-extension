import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { browser, $, $$ } from '@wdio/globals';

type WdioElement = ReturnType<typeof $>;

describe('multi-repository navigator e2e', () => {
    it('lists repositories, navigates into one, syncs views, and navigates back', async () => {
        const workspace = await waitForLookGitReady();
        assert.equal(normalizePath(workspace), normalizePath(expectedWorkspacePath()));

        await focusChangesView();
        await openWebviewBySelector('main.changes-shell');
        try {
            await waitForRepositoryOverview(['app', 'api'], ['plugin']);
            await openRepositoryFolder('app');
            await waitForRepositoryOverview(['plugin'], ['api']);
            await navigateBackToParentRepositories();
            await waitForRepositoryOverview(['app', 'api'], ['plugin']);
            await navigateRepository('app');
            await waitForRepositoryDetail('app', 'section[aria-label="Repository changes"]');
        } finally {
            await closeWebview();
        }

        await focusHistoryView();
        await openWebviewBySelector('main.history-shell');
        try {
            await waitForRepositoryDetail('app', 'section[aria-label="Commits"]');
        } finally {
            await closeWebview();
        }

        await focusGraphView();
        await openWebviewBySelector('.graph-center .repository-navigator-detail-header');
        try {
            await waitForRepositoryDetail('app', '.graph-center .graph-scope-content');
            await navigateBackToRepositories();
            await waitForRepositoryOverview(['app', 'api']);
        } finally {
            await closeWebview();
        }

        await focusChangesView();
        await openWebviewBySelector('main.changes-shell');
        try {
            await waitForRepositoryOverview(['app', 'api'], ['plugin']);
        } finally {
            await closeWebview();
        }
    });
});

async function waitForLookGitReady(): Promise<string> {
    return await browser.executeWorkbench(async (vscode) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) { throw new Error('VS Code did not open a workspace folder.'); }
        const extension = vscode.extensions.getExtension('mathias8dev.look-git');
        if (!extension) { throw new Error('Look Git extension is not installed in the WDIO host.'); }
        await extension.activate();
        await vscode.commands.executeCommand('workbench.view.extension.look-git');
        return workspaceFolder;
    });
}

async function focusChangesView(): Promise<void> {
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand('workbench.view.extension.look-git');
        await vscode.commands.executeCommand('lookGit.changesView.focus');
    });
}

async function focusHistoryView(): Promise<void> {
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand('workbench.view.extension.look-git');
        await vscode.commands.executeCommand('lookGit.commitHistory.focus');
        await vscode.commands.executeCommand('lookGit.history.refresh');
    });
}

async function focusGraphView(): Promise<void> {
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand('workbench.view.extension.look-git-graph');
        await vscode.commands.executeCommand('lookGit.graphView.focus');
    });
}

async function openWebviewBySelector(selector: string): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        const webviews = await webviewFrames();
        for (const webview of webviews) {
            await openWebview(webview);
            const found = await browser.execute((expectedSelector: string) => Boolean(document.querySelector(expectedSelector)), selector);
            if (found) { return true; }
            snapshot = await webviewSnapshot();
            await closeWebview();
        }
        return false;
    }, `Expected webview selector "${selector}". Last snapshot:\n${snapshot}`);
}

async function webviewFrames(): Promise<readonly WebdriverIO.Element[]> {
    await pollUntil(async () => (await $$('iframe.webview.ready').getElements()).length > 0, 'Expected at least one ready webview frame.');
    const frames = Array.from(await $$('iframe.webview.ready').getElements());
    const visibleFrames: WebdriverIO.Element[] = [];
    const hiddenFrames: WebdriverIO.Element[] = [];
    for (const frame of frames) {
        if (await resolvedElementDisplayed(frame)) {
            visibleFrames.push(frame);
        } else {
            hiddenFrames.push(frame);
        }
    }
    return [...visibleFrames, ...hiddenFrames];
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

async function waitForRepositoryOverview(repositoryLabels: readonly string[], hiddenLabels: readonly string[] = []): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        snapshot = await webviewSnapshot();
        return await browser.execute((labels: readonly string[], absentLabels: readonly string[]) => {
            const navigator = document.querySelector('.repository-navigator');
            const list = document.querySelector('.repository-navigator-list');
            const text = document.body.textContent ?? '';
            return Boolean(navigator)
                && Boolean(list)
                && labels.every((label) => text.includes(label))
                && absentLabels.every((label) => !text.includes(label))
                && !Boolean(document.querySelector('.repository-navigator-detail-header'));
        }, repositoryLabels, hiddenLabels);
    }, `Expected repository overview for ${repositoryLabels.join(', ')}.\n${snapshot}`);
}

async function navigateRepository(label: string): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        snapshot = await webviewSnapshot();
        return await browser.execute((expectedLabel: string) => {
            const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.repository-navigator-row-open'))
                .find((candidate) => candidate.textContent?.includes(expectedLabel));
            if (!button) { return false; }
            button.scrollIntoView({ block: 'center', inline: 'nearest' });
            button.click();
            return true;
        }, label);
    }, `Expected repository row "${label}".\n${snapshot}`);
}

async function openRepositoryFolder(label: string): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        snapshot = await webviewSnapshot();
        return await browser.execute((expectedLabel: string) => {
            const row = Array.from(document.querySelectorAll<HTMLElement>('.repository-navigator-row'))
                .find((candidate) => candidate.textContent?.includes(expectedLabel));
            const button = row?.querySelector<HTMLButtonElement>('.repository-navigator-row-open');
            if (!button) { return false; }
            button.scrollIntoView({ block: 'center', inline: 'nearest' });
            button.click();
            return true;
        }, label);
    }, `Expected repository folder "${label}".\n${snapshot}`);
}

async function waitForRepositoryDetail(label: string, contentSelector: string): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        snapshot = await webviewSnapshot();
        return await browser.execute((expectedLabel: string, expectedContentSelector: string) => {
            const header = document.querySelector('.repository-navigator-detail-header');
            const text = header?.textContent ?? '';
            return text.includes(expectedLabel)
                && Boolean(document.querySelector(expectedContentSelector))
                && !Boolean(document.querySelector('.repository-navigator-list'));
        }, label, contentSelector);
    }, `Expected repository detail "${label}" with ${contentSelector}.\n${snapshot}`);
}

async function navigateBackToParentRepositories(): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        snapshot = await webviewSnapshot();
        return await browser.execute(() => {
            const button = document.querySelector<HTMLButtonElement>('button[aria-label="Back to parent folder"]');
            if (!button) { return false; }
            button.click();
            return true;
        });
    }, `Expected parent repository back button.\n${snapshot}`);
}

async function navigateBackToRepositories(): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        snapshot = await webviewSnapshot();
        return await browser.execute(() => {
            const button = document.querySelector<HTMLButtonElement>('button[aria-label="Back to repositories"]');
            if (!button) { return false; }
            button.click();
            return true;
        });
    }, `Expected back button in repository detail.\n${snapshot}`);
}

async function webviewSnapshot(): Promise<string> {
    return await browser.execute(() => {
        const text = document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? '<empty>';
        const selectors = [
            `navigator=${Boolean(document.querySelector('.repository-navigator'))}`,
            `detail=${Boolean(document.querySelector('.repository-navigator-detail-header'))}`,
            `changes=${Boolean(document.querySelector('main.changes-shell'))}`,
            `history=${Boolean(document.querySelector('main.history-shell'))}`,
            `graph=${Boolean(document.querySelector('.graph-shell'))}`,
        ].join(' ');
        return `${selectors}\n${text}`;
    });
}

async function pollUntil(predicate: () => Promise<boolean>, timeoutMsg: string): Promise<void> {
    await browser.waitUntil(predicate, { interval: 100, timeoutMsg });
}

async function elementExists(element: WdioElement): Promise<boolean> {
    try {
        return await element.isExisting();
    } catch {
        return false;
    }
}

async function resolvedElementDisplayed(element: WebdriverIO.Element): Promise<boolean> {
    try {
        return await element.isDisplayed();
    } catch {
        return false;
    }
}

function expectedWorkspacePath(): string {
    const workspace = process.env.LOOK_GIT_WDIO_MULTIREPO_WORKSPACE;
    if (!workspace) { throw new Error('LOOK_GIT_WDIO_MULTIREPO_WORKSPACE is not set.'); }
    return workspace;
}

function normalizePath(value: string): string {
    return path.resolve(value).replace(/[\\/]+/g, '/').replace(/^([a-zA-Z]):/, (_match, drive: string) => `${drive.toLowerCase()}:`);
}
