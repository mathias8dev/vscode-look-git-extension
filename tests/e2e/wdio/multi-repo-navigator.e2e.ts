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
            await waitForRepositoryDetail('workspace', 'section[aria-label="Repository changes"]');
            await waitForChildRepositories(['app', 'api'], ['plugin']);
            await navigateNestedRepositoryChange('app/');
            await waitForRepositoryDetail('app', 'section[aria-label="Repository changes"]');
            await navigateBackToParentRepository();
            await waitForRepositoryDetail('workspace', 'section[aria-label="Repository changes"]');
            await setChildRepositoriesExpanded(false);
            await waitForRepositoryDetail('workspace', 'section[aria-label="Repository changes"]');
            await setChildRepositoriesExpanded(true);
            await navigateRepository('app');
            await waitForRepositoryDetail('app', 'section[aria-label="Repository changes"]');
            await waitForChildRepositories(['plugin']);
            await navigateRepository('plugin');
            await waitForRepositoryDetail('plugin', 'section[aria-label="Repository changes"]');
            await navigateBackToParentRepository();
            await waitForRepositoryDetail('app', 'section[aria-label="Repository changes"]');
            await navigateBackToParentRepository();
            await waitForRepositoryDetail('workspace', 'section[aria-label="Repository changes"]');
            await navigateBackToRepositories();
            await waitForRepositoryOverview(['workspace'], ['app', 'api', 'plugin']);
            await navigateRepository('workspace');
            await waitForRepositoryDetail('workspace', 'section[aria-label="Repository changes"]');
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
        await openWebviewBySelector('.repository-navigator-detail-content > .graph-shell');
        try {
            await waitForRepositoryDetail('app', '.graph-center .graph-scope-content');
            await navigateBackToParentRepository();
            await waitForRepositoryDetail('workspace', '.graph-center .graph-scope-content');
            await navigateBackToRepositories();
            await waitForRepositoryOverview(['workspace'], ['app', 'api']);
        } finally {
            await closeWebview();
        }

        await focusChangesView();
        await openWebviewBySelector('main.changes-shell');
        try {
            await waitForRepositoryOverview(['workspace'], ['app', 'api', 'plugin']);
        } finally {
            await closeWebview();
        }
    });

    it('applies repository scan depth to the current workspace folder without reloading', async () => {
        await waitForLookGitReady();
        await updateRepositoryScanMaxDepth(1);

        await focusChangesView();
        await openWebviewBySelector('main.changes-shell');
        try {
            await navigateRepository('workspace');
            await waitForRepositoryDetail('workspace', 'section[aria-label="Repository changes"]');
            await waitForChildRepositories(['app', 'api'], ['deep-repository', 'plugin']);
        } finally {
            await closeWebview();
        }

        try {
            const inspection = await updateRepositoryScanMaxDepth(2);
            assert.equal(inspection.workspaceFolderValue, 2);
            assert.equal(inspection.globalValue, undefined);

            await focusChangesView();
            await openWebviewBySelector('main.changes-shell');
            try {
                await waitForRepositoryDetail('workspace', 'section[aria-label="Repository changes"]');
                await waitForChildRepositories(['app', 'api', 'deep-repository'], ['plugin']);
            } finally {
                await closeWebview();
            }
        } finally {
            await updateRepositoryScanMaxDepth(undefined);
        }
    });
});

async function updateRepositoryScanMaxDepth(value: number | undefined): Promise<{
    readonly workspaceFolderValue: number | undefined;
    readonly globalValue: number | undefined;
}> {
    return await browser.executeWorkbench(async (vscode, nextValue: number | undefined) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) { throw new Error('VS Code did not open a workspace folder.'); }
        const configuration = vscode.workspace.getConfiguration('lookGit', workspaceFolder.uri);
        await configuration.update('repositoryScanMaxDepth', nextValue, vscode.ConfigurationTarget.WorkspaceFolder);
        const inspection: unknown = configuration.inspect('repositoryScanMaxDepth');
        const workspaceFolderValue = inspection && typeof inspection === 'object' && 'workspaceFolderValue' in inspection
            ? inspection.workspaceFolderValue
            : undefined;
        const globalValue = inspection && typeof inspection === 'object' && 'globalValue' in inspection
            ? inspection.globalValue
            : undefined;
        return {
            workspaceFolderValue: typeof workspaceFolderValue === 'number' ? workspaceFolderValue : undefined,
            globalValue: typeof globalValue === 'number' ? globalValue : undefined,
        };
    }, value);
}

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
    try {
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
        }, `Expected webview selector "${selector}".`);
    } catch (error) {
        throw new Error(`Expected webview selector "${selector}". Last snapshot:\n${snapshot}`, { cause: error });
    }
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
    try {
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
        }, `Expected repository overview for ${repositoryLabels.join(', ')}.`);
    } catch (error) {
        throw new Error(`Expected repository overview for ${repositoryLabels.join(', ')}. Last snapshot:\n${snapshot}`, { cause: error });
    }
}

async function navigateRepository(label: string): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        snapshot = await webviewSnapshot();
        return await browser.execute((expectedLabel: string) => {
            const row = Array.from(document.querySelectorAll<HTMLElement>('.repository-navigator-row'))
                .find((candidate) => candidate.querySelector('.repository-navigator-row-title strong')?.textContent === expectedLabel);
            const button = row?.querySelector<HTMLButtonElement>('.repository-navigator-row-actions button[title="Open repository"]');
            if (!button) { return false; }
            button.scrollIntoView({ block: 'center', inline: 'nearest' });
            button.click();
            return true;
        }, label);
    }, `Expected repository row "${label}".\n${snapshot}`);
}

async function navigateNestedRepositoryChange(filePath: string): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        snapshot = await webviewSnapshot();
        return await browser.execute((expectedPath: string) => {
            const row = Array.from(document.querySelectorAll<HTMLElement>('article.change-row'))
                .find((candidate) => candidate.title === expectedPath);
            if (!row) { return false; }
            row.scrollIntoView({ block: 'center', inline: 'nearest' });
            row.click();
            return true;
        }, filePath);
    }, `Expected nested repository change "${filePath}".\n${snapshot}`);
}

async function waitForChildRepositories(repositoryLabels: readonly string[], hiddenLabels: readonly string[] = []): Promise<void> {
    let snapshot = '';
    try {
        await pollUntil(async () => {
            snapshot = await webviewSnapshot();
            return await browser.execute((labels: readonly string[], absentLabels: readonly string[]) => {
                const childList = document.querySelector('.repository-navigator-child-list');
                const text = childList?.textContent ?? '';
                return Boolean(childList)
                    && labels.every((label) => text.includes(label))
                    && absentLabels.every((label) => !text.includes(label));
            }, repositoryLabels, hiddenLabels);
        }, `Expected child repositories ${repositoryLabels.join(', ')}.`);
    } catch (error) {
        throw new Error(`Expected child repositories ${repositoryLabels.join(', ')}. Last snapshot:\n${snapshot}`, { cause: error });
    }
}

async function setChildRepositoriesExpanded(expanded: boolean): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        snapshot = await webviewSnapshot();
        return await browser.execute((nextExpanded: boolean) => {
            const button = document.querySelector<HTMLButtonElement>('.repository-navigator-children-header');
            if (!button) { return false; }
            const currentExpanded = button.getAttribute('aria-expanded') === 'true';
            if (currentExpanded !== nextExpanded) {
                button.scrollIntoView({ block: 'center', inline: 'nearest' });
                button.click();
            }
            return button.getAttribute('aria-expanded') === String(nextExpanded);
        }, expanded);
    }, `Expected child repositories to be ${expanded ? 'expanded' : 'collapsed'}.\n${snapshot}`);
}

async function waitForRepositoryDetail(label: string, contentSelector: string): Promise<void> {
    let snapshot = '';
    try {
        await pollUntil(async () => {
            snapshot = await webviewSnapshot();
            return await browser.execute((expectedLabel: string, expectedContentSelector: string) => {
                const header = document.querySelector('.repository-navigator-detail-header');
                const text = header?.textContent ?? '';
                return text.includes(expectedLabel)
                    && Boolean(document.querySelector(expectedContentSelector));
            }, label, contentSelector);
        }, `Expected repository detail "${label}" with ${contentSelector}.`);
    } catch (error) {
        throw new Error(`Expected repository detail "${label}" with ${contentSelector}. Last snapshot:\n${snapshot}`, { cause: error });
    }
}

async function navigateBackToParentRepository(): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        snapshot = await webviewSnapshot();
        return await browser.execute(() => {
            const button = document.querySelector<HTMLButtonElement>('button[aria-label="Back to parent repository"]');
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
