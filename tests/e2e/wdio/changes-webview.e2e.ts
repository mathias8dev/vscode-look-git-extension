import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { browser, $, $$ } from '@wdio/globals';
import { InputBox } from 'wdio-vscode-service';

type WdioElement = ReturnType<typeof $>;
type Workbench = Awaited<ReturnType<typeof browser.getWorkbench>>;

describe('changes webview semantic actions', () => {
    it('stages and unstages changes through webview controls', async () => {
        const repo = await waitForLookGitReady();
        prepareDefaultSemanticState(repo);
        waitForGitReady(repo);
        await refreshChangesView();
        assertStatus(repo, ['A  src/semantic-staged.ts', ' M README.md', '?? notes/semantic-untracked.md']);

        await openChangesWebview();
        try {
            await refreshChangesView();
            await waitForChangesDomReady(1);
            await clickButton('Stage all changed files');
            await waitForRepoState(
                repo,
                () => statusIncludes(repo, ['M  README.md', 'A  notes/semantic-untracked.md', 'A  src/semantic-staged.ts']),
                'Expected Stage All click to stage tracked and untracked changes.',
            );

            await clickButton('Unstage all staged files');
            await waitForRepoState(
                repo,
                () => statusIncludes(repo, [' M README.md', '?? notes/semantic-untracked.md', '?? src/semantic-staged.ts']),
                'Expected Unstage All click to move staged files back to the working tree.',
            );
        } finally {
            await closeWebview();
        }
    });

    it('creates a stash through webview controls', async () => {
        const repo = await waitForLookGitReady();
        prepareDefaultSemanticState(repo);
        waitForGitReady(repo);
        await refreshChangesView();

        await openChangesWebview();
        try {
            await refreshChangesView();
            await waitForChangesDomReady(1);

            const changesSection = await changeSection('unstaged');
            await clickButtonIn(changesSection, 'Stash changes');
            const stashPrompt = await changesSection.$('div[aria-label="Create stash"]');
            await repeatUntil(async () => await elementDisplayed(stashPrompt));
            const stashMessage = await stashPrompt.$('input[aria-label="Stash message"]');
            await repeatUntil(async () => await elementDisplayed(stashMessage));
            await stashMessage.setValue('wdio webview stash');
            await clickButtonIn(stashPrompt, 'Stash');

            await waitForRepoState(repo, () => {
                const status = git(repo, statusArgs());
                const stashes = git(repo, ['stash', 'list']);
                return !status.includes('README.md')
                    && !status.includes('notes/semantic-untracked.md')
                    && !status.includes('src/semantic-staged.ts')
                    && stashes.includes('wdio webview stash');
            }, 'Expected Stash click to create a stash and clean the visible working-tree changes.');
        } finally {
            await closeWebview();
        }
    });

    it('creates a patch from a webview row context and validates clipboard patch content', async () => {
        const repo = await waitForLookGitReady();
        prepareCreatePatchState(repo);
        waitForGitReady(repo);
        await refreshChangesView();
        await writeWorkbenchClipboard('');

        await openChangesWebview();
        try {
            await waitForChangesDomReady(1);
            await selectRowByClick('README.md');
            await waitForSelectionAction('Patch');
            await clickButtonIn(await selectionToolbar(), 'Create patch from selected changes');
        } finally {
            await closeWebview();
        }

        await waitForQuickPickItem('Copy Patch to Clipboard');
        await selectQuickPickItem('Copy Patch to Clipboard');

        await waitForClipboard(
            (clipboard) => clipboard.includes('wdio create patch change')
                && clipboard.includes('diff --git a/README.md b/README.md'),
            'Expected Create Patch command to copy the selected README diff to the clipboard.',
        );
    });

    it('applies a clipboard patch through the changes command and validates working-tree state', async () => {
        const workbench = await browser.getWorkbench();
        const repo = await waitForLookGitReady();
        const patch = prepareApplyPatchState(repo);
        waitForGitReady(repo);
        await writeWorkbenchClipboard(patch);
        await refreshChangesView();

        await openChangesWebview();
        try {
            await waitForChangesDomReady(1);
        } finally {
            await closeWebview();
        }

        await executeCommandPalette(workbench, 'Apply Patch');
        await selectQuickPickItem('From Clipboard');
        await selectQuickPickItem('Apply to Working Tree');

        await waitForRepoState(repo, () => {
            const target = fs.readFileSync(path.join(repo, 'src', 'wdio-apply-patch.ts'), 'utf8');
            return target.includes('changed through apply patch')
                && statusIncludes(repo, [' M src/wdio-apply-patch.ts']);
        }, 'Expected Apply Patch command to modify the working tree without staging.');
    });

    it('resolves and aborts merge conflicts through webview controls and validates git state', async () => {
        const repo = await waitForLookGitReady();
        prepareMergeConflictState(repo);
        waitForGitReady(repo);
        await refreshChangesView();

        await openChangesWebview();
        try {
            await waitForConflictRow();
            await clickRowAction('src/conflict.ts', 'Accept incoming changes (theirs)');
            await waitForRepoState(repo, () => {
                const status = git(repo, statusArgs());
                const content = fs.readFileSync(path.join(repo, 'src', 'conflict.ts'), 'utf8');
                return !status.includes('UU src/conflict.ts') && status.includes('M  src/conflict.ts') && content.includes('incoming');
            }, 'Expected Accept Theirs click to resolve and stage the conflicted file.');

            await clickOperationAction('Continue');
            await waitForRepoState(repo, () => !mergeHeadExists(repo) && git(repo, ['log', '-1', '--format=%s']).includes('Merge branch'), {
                message: 'Expected Continue click to finish the merge after conflicts are resolved.',
            });

            await closeWebview();
            prepareMergeConflictState(repo);
            waitForGitReady(repo);
            await refreshChangesView();
            await openChangesWebview();
            await waitForConflictRow();
            await clickOperationAction('Abort');
            await closeWebview();
            await waitForMergeAbort(repo);
        } finally {
            await closeWebview();
        }
    });
});

async function openChangesWebview(): Promise<void> {
    await closeWebview();
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand('lookGit.changesView.focus');
    });
    await repeatUntil(async () => {
        const webviews = await webviewFrames();
        for (const webview of webviews) {
            await openWebview(webview);
            if (await browser.execute(() => Boolean(document.querySelector('main.changes-shell')))) {
                return true;
            }
            await closeWebview();
        }
        return false;
    });
}

async function webviewFrames(): Promise<readonly WebdriverIO.Element[]> {
    await repeatUntil(async () => (await $$('iframe.webview.ready').getElements()).length > 0);
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
    await repeatUntil(async () => await elementExists(activeFrame));
    await browser.switchFrame(activeFrame);
}

async function closeWebview(): Promise<void> {
    await browser.switchFrame(null);
    await browser.switchFrame(null);
}

async function refreshChangesView(): Promise<void> {
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand('lookGit.changes.refresh');
    });
}

async function readWorkbenchClipboard(): Promise<string> {
    return await browser.executeWorkbench((vscode) => vscode.env.clipboard.readText());
}

async function writeWorkbenchClipboard(value: string): Promise<void> {
    await browser.executeWorkbench((vscode, text: string) => vscode.env.clipboard.writeText(text), value);
}

async function waitForLookGitReady(): Promise<string> {
    return await browser.executeWorkbench(async (vscode) => {
        const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!repoPath) { throw new Error('VS Code did not open a workspace folder.'); }
        const extension = vscode.extensions.getExtension('mathias8dev.look-git');
        if (!extension) { throw new Error('Look Git extension is not installed in the WDIO host.'); }
        await extension.activate();

        await vscode.commands.executeCommand('workbench.view.extension.look-git');
        await vscode.commands.executeCommand('lookGit.changesView.focus');
        await vscode.commands.executeCommand('lookGit.changes.refresh');
        return repoPath;
    });
}

async function waitForChangesDomReady(minRows = 2): Promise<void> {
    await repeatUntil(async () => await browser.execute((expectedRows: number) => {
        {
            const shell = document.querySelector('main.changes-shell');
            const content = document.querySelector('section[aria-label="Repository changes"]');
            const rows = document.querySelectorAll('article.change-row');
            return Boolean(shell) && Boolean(content) && rows.length >= expectedRows;
        }
    }, minRows));
}

async function waitForConflictRow(): Promise<void> {
    await waitForWebviewSelectors([
        'section[aria-labelledby="conflicts-title"]',
        'article.change-row[title="src/conflict.ts"]',
    ]);
}

async function clickButton(title: string): Promise<void> {
    await repeatUntil(async () => await clickButtonInDom(title));
}

async function clickButtonIn(root: WdioElement, title: string): Promise<void> {
    await repeatUntil(async () => {
        try {
            return await browser.execute((container: HTMLElement, value: string) => {
                const button = Array.from(container.querySelectorAll('button, a'))
                    .find((element) => {
                        const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
                        return element.getAttribute('title') === value
                            || element.getAttribute('aria-label') === value
                            || text === value;
                    });
                if (!(button instanceof HTMLElement)) { return false; }
                button.scrollIntoView({ block: 'center', inline: 'nearest' });
                button.click();
                return true;
            }, await root.getElement(), title);
        } catch (error) {
            if (isRetryableElementError(error)) { return false; }
            throw error;
        }
    });
}

async function clickRowAction(rowTitle: string, actionTitle: string): Promise<void> {
    await repeatUntil(async () => {
        const row = rowByTitle(rowTitle);
        try {
            if (!await elementExists(row)) { return false; }
            await scrollElementIntoView(row);
            await row.moveTo();
            const button = await row.$(`button[title="${cssString(actionTitle)}"]`);
            if (!await elementExists(button)) { return false; }
            if (!await elementDisplayed(button)) { return false; }
            await clickElement(button);
            return true;
        } catch (error) {
            if (isRetryableElementError(error)) { return false; }
            throw error;
        }
    });
}

async function clickOperationAction(label: string): Promise<void> {
    await repeatUntil(async () => {
        const button = $(`//section[@aria-label="Operation in progress"]//button[normalize-space(.)=${xpathLiteral(label)}]`);
        try {
            if (!await elementExists(button)) { return false; }
            await scrollElementIntoView(button);
            if (!await elementDisplayed(button)) { return false; }
            await clickElement(button);
            return true;
        } catch (error) {
            if (isRetryableElementError(error)) { return false; }
            throw error;
        }
    });
}

async function selectRowByClick(rowTitle: string): Promise<void> {
    const row = rowByTitle(rowTitle);
    await scrollElementIntoView(row);
    await clickElement(row);
    await waitForSelectedChangeRow(rowTitle);
}

async function scrollElementIntoView(element: WdioElement): Promise<void> {
    await browser.execute(
        (target: HTMLElement) => target.scrollIntoView({ block: 'center', inline: 'nearest' }),
        await element.getElement(),
    );
}

async function clickElement(element: WdioElement): Promise<void> {
    await browser.execute((target: HTMLElement) => target.click(), await element.getElement());
}

function rowByTitle(title: string): WdioElement {
    return $(`article.change-row[title="${cssString(title)}"]`);
}

async function clickButtonInDom(title: string): Promise<boolean> {
    return await browser.execute((value: string) => {
        const button = Array.from(document.querySelectorAll('button, a'))
            .find((element) => {
                const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
                return element.getAttribute('title') === value
                    || element.getAttribute('aria-label') === value
                    || text === value;
            });
        if (!(button instanceof HTMLElement)) { return false; }
        button.scrollIntoView({ block: 'center', inline: 'nearest' });
        button.click();
        return true;
    }, title);
}

async function changeSection(sectionId: string): Promise<WdioElement> {
    const section = $(`section[aria-labelledby="${cssString(sectionId)}-title"]`);
    await repeatUntil(async () => await elementDisplayed(section));
    return section;
}

async function selectionToolbar(): Promise<WdioElement> {
    const toolbar = $('section[aria-label="Selected changes actions"]');
    await repeatUntil(async () => await elementDisplayed(toolbar));
    return toolbar;
}

async function selectQuickPickItem(label: string): Promise<void> {
    await waitForQuickPickItem(label);
    const input = await currentInputBox();
    const item = await input.findQuickPick(label);
    if (!item) {
        throw new Error(`Expected Quick Pick item "${label}" to exist. Visible Quick Pick rows: ${(await quickPickRows()).join(' | ') || '<none>'}`);
    }
    const itemLabel = await item.getLabel();
    if (itemLabel !== label) {
        throw new Error(`Expected exact Quick Pick item "${label}", found "${itemLabel}".`);
    }
    await item.select();
    await repeatUntil(async () => !(await quickPickRows()).some((row) => row.includes(label)));
}

async function currentInputBox(): Promise<InputBox> {
    const workbench = await browser.getWorkbench();
    return await new InputBox(workbench.locatorMap).wait();
}

async function executeCommandPalette(workbench: Workbench, label: string): Promise<void> {
    const prompt = await workbench.openCommandPrompt();
    await prompt.setText(`>${label}`);
    const picks = await prompt.getQuickPicks();
    const labels: Array<{ readonly label: string; readonly pick: (typeof picks)[number] }> = [];
    for (const pick of picks) {
        const pickLabel = await pick.getLabel();
        labels.push({ label: pickLabel, pick });
    }
    const selected = labels.find((entry) => entry.label.includes('Look Git') && entry.label.includes(label))
        ?? labels.find((entry) => entry.label.includes(label));
    if (selected) {
        await selected.pick.select();
        if ((await quickPickRows()).some((row) => row.includes(selected.label))) {
            await prompt.confirm();
        }
        await repeatUntil(async () => !(await quickPickRows()).some((row) => row.includes(selected.label)));
        return;
    }
    throw new Error(`Command palette item containing "${label}" was not found. Visible commands: ${labels.map((entry) => entry.label).join(' | ') || '<none>'}`);
}

async function waitForQuickPickItem(label: string): Promise<void> {
    await repeatUntil(async () => {
        const rows = await quickPickRows();
        const notifications = await visibleWorkbenchNotifications();
        throwOnKnownOperationFailure(notifications);
        return rows.some((row) => row.includes(label));
    });
}

async function quickPickRows(): Promise<readonly string[]> {
    const rows = await $$('//div[contains(@class, "quick-input-widget")]//div[contains(@class, "monaco-list-row")]').getElements();
    const texts: string[] = [];
    for (const row of rows) {
        texts.push((await row.getText()).replace(/\s+/g, ' ').trim());
    }
    return texts.filter(Boolean);
}

async function waitForMergeAbort(repo: string): Promise<void> {
    await waitForRepoState(repo, () => {
        const content = fs.readFileSync(path.join(repo, 'src', 'conflict.ts'), 'utf8');
        return !mergeHeadExists(repo) && content.includes('current') && !content.includes('<<<<<<<');
    }, 'Expected Abort click to leave the repository out of merge state with the current side restored.');
}

async function waitForClipboard(predicate: (clipboard: string) => boolean, message: string): Promise<void> {
    try {
        await repeatUntil(async () => {
            const [clipboard, notifications] = await Promise.all([
                readWorkbenchClipboard(),
                visibleWorkbenchNotifications(),
            ]);
            throwOnKnownOperationFailure(notifications);
            return predicate(clipboard);
        });
    } catch (error) {
        throw new Error(`${message}

clipboard:
${await readWorkbenchClipboard() || '<empty>'}`, { cause: error });
    }
}

async function waitForRepoState(
    repo: string,
    predicate: () => boolean | Promise<boolean>,
    messageOrOptions: string | { readonly message: string },
): Promise<void> {
    const message = typeof messageOrOptions === 'string' ? messageOrOptions : messageOrOptions.message;
    try {
        await repeatUntil(async () => await predicate());
    } catch (error) {
        throw new Error(`${message}

status:
${git(repo, statusArgs()) || '<clean>'}

stashes:
${git(repo, ['stash', 'list']) || '<none>'}`, { cause: error });
    }
}

async function waitForWebviewSelectors(selectors: readonly string[]): Promise<void> {
    await repeatUntil(async () => await browser.execute((expectedSelectors: readonly string[]) =>
        expectedSelectors.every((selector) => document.querySelector(selector)),
    selectors));
}

async function waitForSelectedChangeRow(rowTitle: string): Promise<void> {
    await repeatUntil(async () => await browser.execute((title: string) => {
        const rowSelector = `article.change-row[title="${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
        {
            const row = document.querySelector(rowSelector);
            return row?.getAttribute('aria-selected') === 'true' && Boolean(document.querySelector('.selection-toolbar'));
        }
    }, rowTitle));
}

async function waitForSelectionAction(label: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        if (await browser.execute((expectedLabel: string) => {
            const toolbar = document.querySelector('.selection-toolbar');
            if (!toolbar) { return false; }
            return Array.from(toolbar.querySelectorAll('button')).some((button) =>
                button.getAttribute('title') === expectedLabel || button.textContent?.trim() === expectedLabel,
            );
        }, label)) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const snapshot = await browser.execute(() => {
        const toolbar = document.querySelector('.selection-toolbar');
        const rows = Array.from(document.querySelectorAll('article.change-row[aria-selected="true"]'))
            .map((row) => `${row.getAttribute('title') ?? '<no title>'}: ${row.textContent?.replace(/\s+/g, ' ').trim() ?? ''}`);
        const buttons = toolbar
            ? Array.from(toolbar.querySelectorAll('button')).map((button) => [
                button.getAttribute('title'),
                button.getAttribute('aria-label'),
                button.textContent?.replace(/\s+/g, ' ').trim(),
            ].filter(Boolean).join('/'))
            : [];
        return [
            `toolbar=${toolbar?.textContent?.replace(/\s+/g, ' ').trim() ?? '<none>'}`,
            `buttons=${buttons.join(' | ') || '<none>'}`,
            `selected=${rows.join(' | ') || '<none>'}`,
            `rows=${document.querySelectorAll('article.change-row').length}`,
        ].join('\n');
    });
    throw new Error(`Expected selection action "${label}". Selection toolbar: ${snapshot}`);
}

async function repeatUntil(predicate: () => Promise<boolean>): Promise<void> {
    while (!await predicate()) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

function isRetryableElementError(error: unknown): boolean {
    return error instanceof Error && (
        error.message.includes('stale element')
        || error.message.includes("wasn't found")
        || error.message.includes('no such element')
    );
}

async function elementExists(element: WdioElement): Promise<boolean> {
    try {
        return await element.isExisting();
    } catch (error) {
        if (isRetryableElementError(error)) { return false; }
        throw error;
    }
}

async function elementDisplayed(element: WdioElement): Promise<boolean> {
    try {
        return await element.isDisplayed();
    } catch (error) {
        if (isRetryableElementError(error)) { return false; }
        throw error;
    }
}

async function resolvedElementDisplayed(element: WebdriverIO.Element): Promise<boolean> {
    try {
        return await element.isDisplayed();
    } catch (error) {
        if (isRetryableElementError(error)) { return false; }
        throw error;
    }
}

async function visibleWorkbenchNotifications(): Promise<readonly string[]> {
    return await browser.execute(() => {
        const selectors = [
            '.notification-list-item',
            '.notification-toast',
        ];
        return selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
            .filter((element) => element.textContent?.trim())
            .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
            .filter(Boolean);
    });
}

function throwOnKnownOperationFailure(notifications: readonly string[]): void {
    const failure = notifications.find((notification) =>
        notification.includes('No selected changes can be exported as a patch.')
        || notification.includes('Failed to create patch')
        || notification.includes('Failed to apply patch')
        || notification.includes('Look Git command')
        || notification.includes('Command lookGit.')
        || notification.includes('command') && notification.includes('not found'),
    );
    if (failure) {
        throw new Error(`VS Code reported an operation failure: ${failure}`);
    }
}

function assertStatus(repo: string, expectedSnippets: readonly string[]): void {
    const status = git(repo, statusArgs());
    for (const snippet of expectedSnippets) {
        assert.ok(status.includes(snippet), `Missing status snippet "${snippet}" in:\n${status}`);
    }
}

function statusIncludes(repo: string, expectedSnippets: readonly string[]): boolean {
    const status = git(repo, statusArgs());
    return expectedSnippets.every((snippet) => status.includes(snippet));
}

function git(cwd: string, args: readonly string[]): string {
    let lastError: unknown;
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (error) {
            if (!isGitLockError(error)) { throw error; }
            lastError = error;
            sleepSync(100);
        }
    }
    if (lastError instanceof Error) { throw lastError; }
    throw new Error(String(lastError));
}

function statusArgs(): readonly string[] {
    return ['status', '--porcelain=v1', '--untracked-files=all'];
}

function prepareDefaultSemanticState(repo: string): void {
    resetScenarioState(repo);
    git(repo, ['checkout', '-q', 'main']);
    git(repo, ['reset', '--hard', 'HEAD']);
    git(repo, ['clean', '-fd']);
    fs.writeFileSync(path.join(repo, 'src', 'semantic-staged.ts'), 'export const stagedSemantic = true;\n');
    git(repo, ['add', 'src/semantic-staged.ts']);
    fs.writeFileSync(path.join(repo, 'README.md'), '# Semantic actions fixture\n\nUnstaged README change for restore/reset path tests.\n');
    fs.mkdirSync(path.join(repo, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'notes', 'semantic-untracked.md'), 'Untracked semantic action note.\n');
}

function prepareCreatePatchState(repo: string): void {
    resetScenarioState(repo);
    git(repo, ['checkout', '-B', 'wdio-create-patch', 'semantic-reset-base']);
    git(repo, ['reset', '--hard']);
    git(repo, ['clean', '-fd']);
    fs.writeFileSync(path.join(repo, 'README.md'), '# Semantic actions fixture\n\nwdio create patch change\n');
}

function prepareApplyPatchState(repo: string): string {
    resetScenarioState(repo);
    git(repo, ['checkout', '-B', 'wdio-apply-patch', 'semantic-reset-base']);
    git(repo, ['reset', '--hard']);
    git(repo, ['clean', '-fd']);
    const relativePath = 'src/wdio-apply-patch.ts';
    const target = path.join(repo, relativePath);
    fs.writeFileSync(target, 'export const wdioApplyPatch = "base";\n');
    git(repo, ['add', relativePath]);
    git(repo, ['commit', '-q', '-m', 'test(changes): add wdio apply patch target']);
    fs.writeFileSync(target, 'export const wdioApplyPatch = "changed through apply patch";\n');
    const patch = git(repo, ['diff', '--', relativePath]);
    git(repo, ['checkout', '--', relativePath]);
    fs.mkdirSync(path.join(repo, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'notes', 'apply-patch-context.md'), 'Keeps the changes webview in a non-empty state.\n');
    return patch;
}

function prepareMergeConflictState(repo: string): void {
    resetScenarioState(repo);
    git(repo, ['checkout', '-B', 'wdio-merge-conflict', 'semantic-reset-base']);
    git(repo, ['reset', '--hard', 'semantic-reset-base']);
    git(repo, ['clean', '-fd']);
    try {
        git(repo, ['merge', 'feature/cherry-pick-source']);
    } catch {
        return;
    }
    throw new Error('Expected semantic merge fixture to produce a conflict.');
}

function resetScenarioState(repo: string): void {
    abortInProgressOperations(repo);
    git(repo, ['reset', '--hard']);
    git(repo, ['clean', '-fd']);
}

function waitForGitReady(repo: string): void {
    while (fs.existsSync(path.join(repo, '.git', 'index.lock'))) {
        sleepSync(100);
    }
    git(repo, ['status', '--porcelain=v1', '--untracked-files=all']);
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

function mergeHeadExists(repo: string): boolean {
    try {
        git(repo, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
        return true;
    } catch {
        return false;
    }
}

function cssString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isGitLockError(error: unknown): boolean {
    const text = gitErrorText(error);
    return text.includes('index.lock') || text.includes('Another git process seems to be running');
}

function gitErrorText(error: unknown): string {
    if (!(error instanceof Error)) { return String(error); }
    const stderr = hasStderr(error) ? error.stderr : undefined;
    return `${error.message}\n${bufferOrString(stderr)}`;
}

function hasStderr(error: Error): error is Error & { readonly stderr: unknown } {
    return 'stderr' in error;
}

function bufferOrString(value: unknown): string {
    if (Buffer.isBuffer(value)) { return value.toString('utf8'); }
    return typeof value === 'string' ? value : '';
}

function sleepSync(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}


function xpathLiteral(value: string): string {
    if (!value.includes("'")) { return `'${value}'`; }
    if (!value.includes('"')) { return `"${value}"`; }
    return `concat(${value.split("'").map((part) => `'${part}'`).join(`, "'", `)})`;
}
