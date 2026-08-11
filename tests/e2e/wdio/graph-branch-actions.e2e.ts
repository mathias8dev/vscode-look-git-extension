import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { browser, $, $$ } from '@wdio/globals';
import { InputBox } from 'wdio-vscode-service';

type WdioElement = ReturnType<typeof $>;
type BranchActionState = {
    readonly selected: boolean;
    readonly unpublished: boolean;
    readonly updateDisabled: boolean | undefined;
    readonly fetchDisabled: boolean | undefined;
    readonly pushDisabled: boolean | undefined;
    readonly snapshot: string;
};

const TEST_BRANCH = 'e2e/unpublished-actions';

describe('graph branch actions e2e', () => {
    it('gates pull and fetch until publication and offers push modes after divergence', async () => {
        const repo = await waitForLookGitReady();
        prepareUnpublishedBranch(repo);
        try {
            await focusGraphView();
            await openWebviewBySelector('.graph-branch-panel');
            try {
                await selectBranch(TEST_BRANCH);
                await waitForBranchActionState({ updateDisabled: true, fetchDisabled: true, pushDisabled: false, unpublished: true });
                await clickBranchAction('Push Selected Branch...');
            } finally {
                await closeWebview();
            }

            await waitForPublishedBranch(repo);
            prepareBehindBranch(repo);

            await focusGraphView();
            await openWebviewBySelector('.graph-branch-panel');
            try {
                await selectBranch(TEST_BRANCH);
                await clickBranchAction('Push Selected Branch...');
            } finally {
                await closeWebview();
            }

            await clickNotificationAction('Update Branch');
            await waitForPublishedBranch(repo);
            prepareDivergedBranch(repo);

            await focusGraphView();
            await openWebviewBySelector('.graph-branch-panel');
            try {
                await selectBranch(TEST_BRANCH);
                await waitForBranchActionState({ updateDisabled: false, fetchDisabled: false, pushDisabled: false, unpublished: false });
                await clickBranchAction('Push Selected Branch...');
            } finally {
                await closeWebview();
            }

            await waitForPushRecoveryPicker();
            await selectQuickPickItem('Force Push with Lease');
            await waitForPublishedBranch(repo);
        } finally {
            cleanupTestBranch(repo);
        }
    });

    it('shows selected branch metadata and commits in the details panel', async () => {
        const repo = await waitForLookGitReady();
        const details = prepareBranchDetails(repo);
        try {
            await focusGraphView();
            await openWebviewBySelector('.graph-branch-panel');
            try {
                await selectBranch(TEST_BRANCH);
                await clickBranchAction('Show Selected Branch Details');
                await waitForBranchDetails({
                    branch: TEST_BRANCH,
                    upstream: `origin/${TEST_BRANCH}`,
                    remoteUrl: details.remoteUrl,
                    head: details.head,
                    parent: details.parent,
                    message: 'e2e branch details',
                });
            } finally {
                await closeWebview();
            }
        } finally {
            cleanupTestBranch(repo);
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
        return workspaceFolder;
    });
}

function prepareUnpublishedBranch(repo: string): void {
    tryGit(repo, ['push', '-q', 'origin', '--delete', TEST_BRANCH]);
    tryGit(repo, ['branch', '-D', TEST_BRANCH]);
    git(repo, ['branch', TEST_BRANCH, 'main']);
}

function cleanupTestBranch(repo: string): void {
    tryGit(repo, ['push', '-q', 'origin', '--delete', TEST_BRANCH]);
    tryGit(repo, ['branch', '-D', TEST_BRANCH]);
}

function prepareDivergedBranch(repo: string): void {
    const base = git(repo, ['rev-parse', TEST_BRANCH]).trim();
    const tree = git(repo, ['rev-parse', `${TEST_BRANCH}^{tree}`]).trim();
    const commitArgs = ['-c', 'user.name=Look Git E2E', '-c', 'user.email=look-git-e2e@example.test', 'commit-tree', tree, '-p', base];
    const localHead = git(repo, [...commitArgs, '-m', 'local divergence']).trim();
    const remoteHead = git(repo, [...commitArgs, '-m', 'remote divergence']).trim();
    git(repo, ['update-ref', `refs/heads/${TEST_BRANCH}`, localHead]);
    git(repo, ['push', '-q', 'origin', `${remoteHead}:refs/heads/${TEST_BRANCH}`]);
    git(repo, ['fetch', '-q', 'origin', TEST_BRANCH]);
    assert.equal(git(repo, ['rev-list', '--count', '--left-right', `${TEST_BRANCH}...origin/${TEST_BRANCH}`]).trim(), '1\t1');
}

function prepareBehindBranch(repo: string): void {
    const base = git(repo, ['rev-parse', TEST_BRANCH]).trim();
    const tree = git(repo, ['rev-parse', `${TEST_BRANCH}^{tree}`]).trim();
    const remoteHead = git(repo, [
        '-c', 'user.name=Look Git E2E',
        '-c', 'user.email=look-git-e2e@example.test',
        'commit-tree', tree,
        '-p', base,
        '-m', 'remote update',
    ]).trim();
    git(repo, ['push', '-q', 'origin', `${remoteHead}:refs/heads/${TEST_BRANCH}`]);
    git(repo, ['fetch', '-q', 'origin', TEST_BRANCH]);
    assert.equal(git(repo, ['rev-list', '--count', '--left-right', `${TEST_BRANCH}...origin/${TEST_BRANCH}`]).trim(), '0\t1');
}

function prepareBranchDetails(repo: string): { readonly head: string; readonly parent: string; readonly remoteUrl: string } {
    cleanupTestBranch(repo);
    const parent = git(repo, ['rev-parse', 'main']).trim();
    const tree = git(repo, ['rev-parse', 'main^{tree}']).trim();
    const head = git(repo, [
        '-c', 'user.name=Look Git E2E',
        '-c', 'user.email=look-git-e2e@example.test',
        'commit-tree', tree,
        '-p', parent,
        '-m', 'e2e branch details',
    ]).trim();
    git(repo, ['update-ref', `refs/heads/${TEST_BRANCH}`, head]);
    git(repo, ['push', '-q', 'origin', `${TEST_BRANCH}:refs/heads/${TEST_BRANCH}`]);
    git(repo, ['branch', '--set-upstream-to', `origin/${TEST_BRANCH}`, TEST_BRANCH]);
    return { head, parent, remoteUrl: git(repo, ['remote', 'get-url', 'origin']).trim() };
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
            for (const webview of await webviewFrames()) {
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

async function selectBranch(branch: string): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        const result = await browser.execute((branchName: string) => {
            const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button.branch-leaf'))
                .find((candidate) => candidate.title.split('\n')[0] === branchName);
            const text = document.querySelector('.graph-branch-panel')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? '<empty>';
            if (!button) { return { selected: false, snapshot: text }; }
            button.scrollIntoView({ block: 'center', inline: 'nearest' });
            if (!button.classList.contains('branch-node-active')) { button.click(); }
            return { selected: true, snapshot: text };
        }, branch);
        snapshot = result.snapshot;
        return result.selected;
    }, `Expected branch "${branch}". Last snapshot:\n${snapshot}`);
}

async function waitForBranchActionState(expected: Omit<BranchActionState, 'selected' | 'snapshot'>): Promise<void> {
    let lastState: BranchActionState | undefined;
    await pollUntil(async () => {
        lastState = await branchActionState(TEST_BRANCH);
        return lastState.selected
            && lastState.unpublished === expected.unpublished
            && lastState.updateDisabled === expected.updateDisabled
            && lastState.fetchDisabled === expected.fetchDisabled
            && lastState.pushDisabled === expected.pushDisabled;
    }, `Expected branch action state ${JSON.stringify(expected)}. Last state:\n${JSON.stringify(lastState)}`);
}

async function branchActionState(branch: string): Promise<BranchActionState> {
    return await browser.execute((branchName: string) => {
        const branchButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button.branch-leaf'))
            .find((candidate) => candidate.title.split('\n')[0] === branchName);
        const action = (label: string) => document.querySelector<HTMLButtonElement>(`.graph-branch-action-bar button[aria-label="${label}"]`);
        return {
            selected: branchButton?.classList.contains('branch-node-active') === true,
            unpublished: Boolean(branchButton?.querySelector('[aria-label="Branch is not published"]')),
            updateDisabled: action('Update Selected Branch')?.disabled,
            fetchDisabled: action('Fetch')?.disabled,
            pushDisabled: action('Push Selected Branch...')?.disabled,
            snapshot: document.querySelector('.graph-branch-panel')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? '<empty>',
        };
    }, branch);
}

async function clickBranchAction(label: string): Promise<void> {
    await pollUntil(async () => await browser.execute((actionLabel: string) => {
        const button = document.querySelector<HTMLButtonElement>(`.graph-branch-action-bar button[aria-label="${actionLabel}"]`);
        if (!button || button.disabled) { return false; }
        button.scrollIntoView({ block: 'center', inline: 'nearest' });
        button.click();
        return true;
    }, label), `Expected enabled branch action "${label}".`);
}

async function waitForBranchDetails(expected: {
    readonly branch: string;
    readonly upstream: string;
    readonly remoteUrl: string;
    readonly head: string;
    readonly parent: string;
    readonly message: string;
}): Promise<void> {
    let snapshot = '';
    await pollUntil(async () => {
        const result = await browser.execute((details) => {
            const panel = document.querySelector<HTMLElement>('.branch-details-content');
            const text = panel?.textContent?.replace(/\s+/g, ' ').trim() ?? '<missing>';
            return {
                matches: Boolean(panel)
                    && text.includes(details.branch)
                    && text.includes(details.upstream)
                    && text.includes(details.remoteUrl)
                    && text.includes(details.head)
                    && text.includes(details.parent)
                    && text.includes(details.message),
                snapshot: text.slice(0, 1600),
            };
        }, expected);
        snapshot = result.snapshot;
        return result.matches;
    }, `Expected branch details ${JSON.stringify(expected)}. Last snapshot:\n${snapshot}`);
}

async function clickNotificationAction(label: string): Promise<void> {
    let snapshot = '';
    try {
        await pollUntil(async () => {
            const result = await browser.execute((actionLabel: string) => {
                const notifications = Array.from(document.querySelectorAll<HTMLElement>('.notification-list-item, .notification-toast'));
                const buttons = notifications.flatMap((notification) => Array.from(notification.querySelectorAll<HTMLElement>('.monaco-button')));
                const button = buttons.find((candidate) => candidate.textContent?.trim() === actionLabel);
                const visibleText = notifications.map((notification) => notification.textContent?.replace(/\s+/g, ' ').trim() ?? '').join(' | ');
                if (!button) { return { clicked: false, snapshot: visibleText || '<no notification>' }; }
                button.click();
                return { clicked: true, snapshot: visibleText };
            }, label);
            snapshot = result.snapshot;
            return result.clicked;
        }, `Expected notification action "${label}".`);
    } catch (error) {
        throw new Error(`Expected notification action "${label}". Last notification: ${snapshot}`, { cause: error });
    }
}

async function waitForPushRecoveryPicker(): Promise<void> {
    let rows: readonly string[] = [];
    await pollUntil(async () => {
        rows = await quickPickRows();
        return rows.includes('Check Out Branch')
            && rows.includes('Force Push with Lease')
            && rows.includes('More Push Actions...')
            && !rows.includes('Force Push');
    }, `Expected contextual push recovery choices. Visible rows: ${rows.join(' | ') || '<none>'}`);
}

async function selectQuickPickItem(label: string): Promise<void> {
    const workbench = await browser.getWorkbench();
    const input = await new InputBox(workbench.locatorMap).wait();
    const item = await input.findQuickPick(label);
    assert.ok(item, `Expected Quick Pick item "${label}".`);
    assert.equal(await item.getLabel(), label);
    await item.select();
    await pollUntil(async () => !(await quickPickRows()).includes(label), `Expected Quick Pick item "${label}" to close.`);
}

async function quickPickRows(): Promise<readonly string[]> {
    const rows = await $$('//div[contains(@class, "quick-input-widget")]//div[contains(@class, "monaco-list-row")]').getElements();
    const texts: string[] = [];
    for (const row of rows) {
        texts.push((await row.getText()).replace(/\s+/g, ' ').trim());
    }
    return texts.filter(Boolean);
}

async function waitForPublishedBranch(repo: string): Promise<void> {
    await pollUntil(async () => {
        try {
            const upstream = git(repo, ['rev-parse', '--abbrev-ref', `${TEST_BRANCH}@{upstream}`]).trim();
            const localHead = git(repo, ['rev-parse', TEST_BRANCH]).trim();
            const remoteHead = git(repo, ['rev-parse', `refs/remotes/origin/${TEST_BRANCH}`]).trim();
            return upstream === `origin/${TEST_BRANCH}` && localHead === remoteHead;
        } catch {
            return false;
        }
    }, `Expected branch "${TEST_BRANCH}" to be published.`);
}

async function webviewSnapshot(): Promise<string> {
    return await browser.execute(() => document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? '<empty>');
}

async function pollUntil(predicate: () => Promise<boolean>, timeoutMsg: string): Promise<void> {
    await browser.waitUntil(predicate, { interval: 100, timeout: 30_000, timeoutMsg });
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

function git(repo: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function tryGit(repo: string, args: readonly string[]): void {
    try {
        git(repo, args);
    } catch {
        return;
    }
}
