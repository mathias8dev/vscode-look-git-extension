import { execFileSync } from 'child_process';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { $, $$, browser } from '@wdio/globals';

const repoPath = process.env.LOOK_GIT_E2E_REPO;
assert.ok(repoPath, 'LOOK_GIT_E2E_REPO must point to the fixture repository.');

function git(args: string[]): string {
    return gitAt(repoPath!, args);
}

function gitAt(cwd: string, args: string[]): string {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function gitTry(args: string[]): boolean {
    try {
        git(args);
        return true;
    } catch {
        return false;
    }
}

function writeFixtureFile(relativePath: string, content: string): void {
    const fullPath = path.join(repoPath!, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
}

function splitLines(output: string): string[] {
    return output.split('\n').filter(Boolean);
}

function statusPorcelain(): string[] {
    return splitLines(git(['status', '--porcelain', '-uall']));
}

function cachedNames(): string[] {
    return splitLines(git(['diff', '--cached', '--name-only']));
}

function stashLines(): string[] {
    try {
        return splitLines(git(['stash', 'list']));
    } catch {
        return [];
    }
}

function cleanupWorkingTree(): void {
    gitTry(['merge', '--abort']);
    gitTry(['rebase', '--abort']);
    git(['reset', '--hard', 'HEAD']);
    git(['clean', '-fd']);
}

function configureRepo(cwd: string): void {
    gitAt(cwd, ['config', 'user.email', 'test@example.com']);
    gitAt(cwd, ['config', 'user.name', 'Test User']);
}

function initGitRepo(cwd: string): void {
    gitAt(cwd, ['init', '-q']);
    gitAt(cwd, ['checkout', '-q', '-b', 'main']);
    configureRepo(cwd);
}

function commitFileAt(cwd: string, relativePath: string, content: string, message: string): string {
    const fullPath = path.join(cwd, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    gitAt(cwd, ['add', '-A']);
    gitAt(cwd, ['commit', '-q', '-m', message]);
    return gitAt(cwd, ['rev-parse', 'HEAD']);
}

interface ConflictFixtureFile {
    filePath: string;
    base: string;
    incoming: string;
    current: string;
}

function createMergeConflict(branchName: string, files: ConflictFixtureFile[]): void {
    cleanupWorkingTree();
    git(['checkout', '-q', 'main']);
    gitTry(['branch', '-D', branchName]);

    for (const file of files) {
        writeFixtureFile(file.filePath, file.base);
    }
    git(['add', '-A']);
    git(['commit', '-q', '-m', `base ${branchName}`]);

    git(['checkout', '-q', '-b', branchName]);
    for (const file of files) {
        writeFixtureFile(file.filePath, file.incoming);
    }
    git(['add', '-A']);
    git(['commit', '-q', '-m', `incoming ${branchName}`]);

    git(['checkout', '-q', 'main']);
    for (const file of files) {
        writeFixtureFile(file.filePath, file.current);
    }
    git(['add', '-A']);
    git(['commit', '-q', '-m', `current ${branchName}`]);

    assert.throws(() => git(['merge', branchName]), 'Fixture merge should create conflicts.');
}

async function openLookGitWorkbench(): Promise<any> {
    await leaveWebviewContext();
    const workbench = await browser.getWorkbench();
    let lookGit: any;
    await browser.waitUntil(async () => {
        lookGit = await workbench.getActivityBar().getViewControl('Look Git');
        return Boolean(lookGit);
    }, {
        timeout: 20_000,
        timeoutMsg: 'Look Git activity bar entry should be visible.',
    });
    await lookGit.openView();
    return workbench;
}

async function openWebview(title: string | RegExp): Promise<any> {
    await leaveWebviewContext();
    const workbench = await browser.getWorkbench();
    const webview = await workbench.getWebviewByTitle(title);
    await webview.open();
    return webview;
}

async function refreshChanges(): Promise<void> {
    await browser.executeWorkbench((vscode: any) => vscode.commands.executeCommand('lookGit.refreshChanges'));
}

function fileSelector(filePath: string): string {
    return `[data-file="${filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

async function leaveWebviewContext(): Promise<void> {
    await browser.switchToFrame(null);
    await browser.switchToFrame(null);
}

async function clickFileAction(filePath: string, actionClass: string): Promise<void> {
    const row = await $(`.file-row${fileSelector(filePath)}`);
    await row.waitForDisplayed();
    await row.scrollIntoView();
    await row.moveTo();

    const action = await $(`.${actionClass}${fileSelector(filePath)}`);
    await browser.waitUntil(async () => await action.isDisplayed() && await action.isClickable(), {
        timeout: 5_000,
        timeoutMsg: `Expected ${actionClass} for ${filePath} to be visible and clickable after hovering its row.`,
    });
    await action.click();
}

async function clickVisible(selector: string): Promise<void> {
    const element = await $(selector);
    await element.waitForClickable();
    await element.click();
}

async function clickSectionAction(section: string, selector: string, options: { domClick?: boolean } = {}): Promise<void> {
    const header = await $(`.section-header[data-section="${section}"]`);
    await header.waitForDisplayed();
    await header.scrollIntoView();
    await header.moveTo();

    const action = await $(selector);
    await browser.waitUntil(async () => await action.isDisplayed() && await action.isClickable(), {
        timeout: 5_000,
        timeoutMsg: `Expected ${selector} in ${section} section to be visible and clickable after hovering the header.`,
    });
    if (options.domClick) {
        await browser.execute((targetSelector) => {
            document.querySelector<HTMLElement>(targetSelector)?.click();
        }, selector);
    } else {
        await action.click();
    }
}

async function clickStashAction(actionClass: string, index = 0): Promise<void> {
    const row = await $(`.stash-row[data-stash-index="${index}"]`);
    await row.waitForDisplayed();
    await row.scrollIntoView();
    await row.moveTo();

    const action = await $(`.${actionClass}[data-index="${index}"]`);
    await browser.waitUntil(async () => await action.isDisplayed() && await action.isClickable(), {
        timeout: 5_000,
        timeoutMsg: `Expected ${actionClass} for stash@{${index}} to be visible and clickable after hovering its row.`,
    });
    await action.click();
}

async function expandStashesSection(): Promise<void> {
    if (await $('.stash-row[data-stash-index="0"]').isExisting()) {
        return;
    }
    await clickVisible('[data-section="stashes"] .section-title-row');
    await $('.stash-row[data-stash-index="0"]').waitForExist();
}

async function waitForActiveEditorLabel(labelPart: string): Promise<void> {
    await leaveWebviewContext();
    await browser.waitUntil(async () => {
        const label = await browser.executeWorkbench((vscode: any) =>
            vscode.window.tabGroups.activeTabGroup.activeTab?.label ?? ''
        );
        return String(label).includes(labelPart);
    }, {
        timeout: 10_000,
        timeoutMsg: `Expected active editor label to include "${labelPart}".`,
    });
}

async function closeAllEditors(): Promise<void> {
    await leaveWebviewContext();
    await browser.executeWorkbench((vscode: any) => vscode.commands.executeCommand('workbench.action.closeAllEditors'));
}

async function clickGraphToggle(expectActive: boolean): Promise<void> {
    const toggle = await $('#toggle-graph-btn');
    await toggle.waitForClickable();
    await toggle.click();

    const toggledByWebDriver = await browser.waitUntil(async () => {
        return browser.execute((active) => {
            const button = document.querySelector('#toggle-graph-btn');
            return Boolean(button?.classList.contains('active')) === active;
        }, expectActive);
    }, {
        timeout: 1_000,
        interval: 100,
    }).catch(() => false);

    if (toggledByWebDriver) {
        return;
    }

    await browser.execute(() => {
        document.querySelector<HTMLElement>('#toggle-graph-btn')?.click();
    });
    await browser.waitUntil(async () => {
        return browser.execute((active) => {
            const button = document.querySelector('#toggle-graph-btn');
            return Boolean(button?.classList.contains('active')) === active;
        }, expectActive);
    }, {
        timeout: 5_000,
        timeoutMsg: `Expected Graph toggle active=${expectActive}.`,
    });
}

async function clickFirstGraphCommit(): Promise<void> {
    const firstCommitButton = await $('.graph-row .commit-row-button');
    await firstCommitButton.waitForClickable();
    await firstCommitButton.click();

    const selectedByWebDriver = await browser.waitUntil(async () => {
        return browser.execute(() => Boolean(document.querySelector('.graph-row.selected')));
    }, {
        timeout: 1_000,
        interval: 100,
    }).catch(() => false);

    if (selectedByWebDriver) {
        return;
    }

    await browser.execute(() => {
        const button = document.querySelector<HTMLElement>('.graph-row .commit-row-button');
        button?.click();
    });
}

async function openPathFilterDropdown(): Promise<void> {
    const pathFilter = await $('[data-filter="paths"]');
    await pathFilter.waitForClickable();
    await pathFilter.click();

    const openedByWebDriver = await browser.waitUntil(async () => {
        return browser.execute(() => Boolean(document.querySelector('#filter-path-input')));
    }, {
        timeout: 1_000,
        interval: 100,
    }).catch(() => false);

    if (!openedByWebDriver) {
        await browser.execute(() => {
            document.querySelector<HTMLElement>('[data-filter="paths"]')?.click();
        });
    }

    await $('#filter-path-input').waitForExist();
}

async function takeNotificationAction(messagePart: string, actionTitle: string): Promise<void> {
    const workbench = await browser.getWorkbench();
    await browser.waitUntil(async () => {
        const notifications = await workbench.getNotifications();
        for (const notification of notifications) {
            const message = await notification.getMessage();
            if (message.includes(messagePart)) {
                await notification.takeAction(actionTitle);
                return true;
            }
        }
        return false;
    }, {
        timeout: 10_000,
        timeoutMsg: `Expected notification "${messagePart}" with action "${actionTitle}".`,
    });
}

async function waitForGit(predicate: () => boolean, message: string): Promise<void> {
    await browser.waitUntil(predicate, {
        timeout: 20_000,
        timeoutMsg: message,
    });
}

describe('Look Git VS Code E2E', () => {
    afterEach(async () => {
        await leaveWebviewContext();
    });

    it('clicks the Changes webview and verifies stage, unstage, discard, commit, and stash in real git state', async () => {
        await openLookGitWorkbench();
        await refreshChanges();
        const changes = await openWebview(/Changes/);

        await $('.file-row[data-file="src/dirty.txt"]').waitForExist();
        await $('#commit-message').setValue('message without staged files');
        assert.equal(await $('#commit-btn').isEnabled(), false, 'Commit button should stay disabled without staged files.');
        await clickFileAction('src/dirty.txt', 'stage-btn');
        await waitForGit(
            () => cachedNames().includes('src/dirty.txt'),
            'Expected src/dirty.txt to be staged after clicking Stage.',
        );

        await clickFileAction('src/dirty.txt', 'unstage-btn');
        await waitForGit(
            () => !cachedNames().includes('src/dirty.txt'),
            'Expected src/dirty.txt to be unstaged after clicking Unstage.',
        );

        await clickFileAction('src/dirty.txt', 'discard-btn');
        await changes.close();
        await takeNotificationAction('Discard changes to "src/dirty.txt"', 'Discard');
        await waitForGit(
            () => !git(['status', '--porcelain']).includes('src/dirty.txt'),
            'Expected src/dirty.txt to be discarded after confirming the discard dialog.',
        );

        writeFixtureFile('src/e2e-commit.txt', 'commit from e2e\n');
        await refreshChanges();
        const commitView = await openWebview(/Changes/);
        await clickFileAction('src/e2e-commit.txt', 'stage-btn');

        await $('#commit-dropdown-btn').click();
        await $('.dropdown-item[data-mode="amend"]').click();
        assert.equal(await $('#commit-label').getText(), 'Commit (Amend)');
        await $('#commit-dropdown-btn').click();
        await $('.dropdown-item[data-mode="commit"]').click();
        assert.equal(await $('#commit-label').getText(), 'Commit');

        await $('#commit-message').setValue('e2e commit from UI');
        assert.equal(await $('#commit-btn').isEnabled(), true, 'Commit button should be enabled with a staged file and message.');
        await $('#commit-btn').click();
        await waitForGit(
            () => git(['log', '-1', '--format=%s']) === 'e2e commit from UI',
            'Expected clicking Commit to create a real Git commit.',
        );

        writeFixtureFile('src/e2e-stash.txt', 'stash from e2e\n');
        await refreshChanges();
        await clickFileAction('src/e2e-stash.txt', 'stage-btn');
        await clickSectionAction('staged', '#stash-staged-btn');
        await waitForGit(
            () => {
                try {
                    return splitLines(git(['stash', 'show', '--name-only', 'stash@{0}'])).includes('src/e2e-stash.txt')
                        && !git(['status', '--porcelain']).includes('src/e2e-stash.txt');
                } catch {
                    return false;
                }
            },
            'Expected clicking Stash Staged Changes to create a real stash containing src/e2e-stash.txt.',
        );
        await commitView.close();
    });

    it('clicks bulk Changes actions, toggles tree/list view, opens files, and verifies real git state', async () => {
        cleanupWorkingTree();
        await openLookGitWorkbench();

        writeFixtureFile('bulk/a.txt', 'bulk a\n');
        writeFixtureFile('bulk/nested/b.txt', 'bulk b\n');
        await refreshChanges();
        const changes = await openWebview(/Changes/);

        await $('.file-row[data-file="bulk/a.txt"]').waitForExist();
        await clickSectionAction('unstaged', '#stage-all-btn');
        await waitForGit(
            () => cachedNames().includes('bulk/a.txt') && cachedNames().includes('bulk/nested/b.txt'),
            'Expected Stage All to stage every visible unstaged file.',
        );

        await clickSectionAction('staged', '#unstage-all-btn', { domClick: true });
        await waitForGit(
            () => {
                const line = statusPorcelain().find((entry) => entry.includes('bulk/a.txt'));
                return line !== undefined && line[0] !== 'A';
            },
            'Expected Unstage All to move files back to unstaged changes.',
        );

        await browser.executeWorkbench((vscode: any) => vscode.commands.executeCommand('lookGit.viewAsTree'));
        await $('.tree-folder-row').waitForExist();
        await clickVisible('.tree-folder-row[data-folder-key="unstaged:bulk"]');
        await $('.tree-file-row[data-file="bulk/a.txt"]').waitForExist();

        await clickFileAction('bulk/a.txt', 'open-file-btn');
        await waitForActiveEditorLabel('a.txt');
        await closeAllEditors();

        await openWebview(/Changes/);
        await browser.executeWorkbench((vscode: any) => vscode.commands.executeCommand('lookGit.viewAsList'));
        await $('.file-row[data-file="bulk/a.txt"]').waitForExist();

        await clickSectionAction('unstaged', '#discard-all-btn');
        await changes.close();
        await takeNotificationAction('Discard all changes?', 'Discard All');
        await waitForGit(
            () => !statusPorcelain().some((line) => line.includes('bulk/a.txt') || line.includes('bulk/nested/b.txt')),
            'Expected Discard All to remove every bulk test change.',
        );
    });

    it('clicks stash apply, drop, pop, and stash file diff actions from the Changes UI', async () => {
        cleanupWorkingTree();
        gitTry(['stash', 'clear']);
        await openLookGitWorkbench();

        writeFixtureFile('src/e2e-stash-apply.txt', 'stash apply base\n');
        git(['add', 'src/e2e-stash-apply.txt']);
        git(['commit', '-q', '-m', 'e2e stash apply base']);
        writeFixtureFile('src/e2e-stash-apply.txt', 'stash apply from ui\n');
        await refreshChanges();
        let changes = await openWebview(/Changes/);
        await $('.file-row[data-file="src/e2e-stash-apply.txt"]').waitForExist();
        await clickSectionAction('unstaged', '#stash-btn');
        await waitForGit(
            () => stashLines().length === 1 && !statusPorcelain().some((line) => line.includes('src/e2e-stash-apply.txt')),
            'Expected Stash Changes to create a stash and clean the worktree.',
        );

        await refreshChanges();
        await openWebview(/Changes/);
        await expandStashesSection();
        await clickVisible('.stash-expand-btn[data-stash-index="0"]');
        await $('.stash-file-row[data-file="src/e2e-stash-apply.txt"]').waitForExist();
        await clickVisible('.stash-file-row[data-file="src/e2e-stash-apply.txt"]');
        await waitForActiveEditorLabel('e2e-stash-apply.txt');
        await closeAllEditors();

        await openWebview(/Changes/);
        await clickStashAction('stash-apply-btn');
        await waitForGit(
            () => stashLines().length === 1 && statusPorcelain().some((line) => line.includes('src/e2e-stash-apply.txt')),
            'Expected Apply Stash to restore the file without dropping the stash.',
        );

        await refreshChanges();
        await openWebview(/Changes/);
        await expandStashesSection();
        await clickStashAction('stash-drop-btn');
        await leaveWebviewContext();
        await takeNotificationAction('Drop stash@{0}', 'Drop');
        await waitForGit(
            () => stashLines().length === 0,
            'Expected Drop Stash to remove the stash entry.',
        );

        git(['restore', '--', 'src/e2e-stash-apply.txt']);

        writeFixtureFile('src/e2e-stash-pop.txt', 'stash pop base\n');
        git(['add', 'src/e2e-stash-pop.txt']);
        git(['commit', '-q', '-m', 'e2e stash pop base']);
        writeFixtureFile('src/e2e-stash-pop.txt', 'stash pop from ui\n');
        await refreshChanges();
        changes = await openWebview(/Changes/);
        await $('.file-row[data-file="src/e2e-stash-pop.txt"]').waitForExist();
        await clickSectionAction('unstaged', '#stash-btn');
        await waitForGit(
            () => stashLines().length === 1 && !statusPorcelain().some((line) => line.includes('src/e2e-stash-pop.txt')),
            'Expected second Stash Changes action to create a fresh stash.',
        );

        await refreshChanges();
        await openWebview(/Changes/);
        await expandStashesSection();
        await clickStashAction('stash-pop-btn');
        await waitForGit(
            () => stashLines().length === 0 && statusPorcelain().some((line) => line.includes('src/e2e-stash-pop.txt')),
            'Expected Pop Stash to restore the file and remove the stash entry.',
        );

        await refreshChanges();
        await openWebview(/Changes/);
        await clickSectionAction('unstaged', '#discard-all-btn');
        await changes.close();
        await takeNotificationAction('Discard all changes?', 'Discard All');
        await waitForGit(
            () => !statusPorcelain().some((line) => line.includes('src/e2e-stash-pop.txt')),
            'Expected cleanup discard to remove popped stash file.',
        );
    });

    it('clicks the Graph webview and verifies search, path filter, selection, and details', async () => {
        await openLookGitWorkbench();
        await browser.executeWorkbench((vscode: any) => vscode.commands.executeCommand('lookGit.openGraph'));

        const graph = await openWebview(/Git Graph/);
        await $('#search-input').waitForExist();
        await $('.graph-row').waitForExist();

        await clickGraphToggle(false);
        await browser.waitUntil(async () => {
            return browser.execute(() => document.querySelectorAll('.commit-graph-svg').length === 0);
        }, {
            timeout: 5_000,
            timeoutMsg: 'Expected graph SVG lines to be hidden after toggling Graph off.',
        });
        await clickGraphToggle(true);
        await $('.commit-graph-svg').waitForExist();

        await clickVisible('.branch-pane .view-switch-btn[data-mode="list"]');
        await $('.branch-item.current .current-branch-indicator').waitForExist();
        await clickVisible('.branch-pane .view-switch-btn[data-mode="tree"]');
        await $('.branch-tree-folder .tree-chevron-icon').waitForExist();

        await $('#search-input').setValue('history commit 1');
        await browser.waitUntil(async () => (await $$('.graph-row')).length > 0, {
            timeout: 20_000,
            timeoutMsg: 'Expected graph rows after searching for history commit 1.',
        });

        await clickFirstGraphCommit();
        await browser.waitUntil(async () => (await $('#details-pane').getText()).includes('Changed Files'), {
            timeout: 20_000,
            timeoutMsg: 'Expected commit details after clicking a graph row.',
        });

        await clickVisible('[data-files-mode="list"]');
        const firstChangedFile = await $('.file-item .file-path').getText();
        await clickVisible('.file-item');
        await waitForActiveEditorLabel(path.basename(firstChangedFile));
        await closeAllEditors();

        await openWebview(/Git Graph/);
        await openPathFilterDropdown();
        await $('#filter-path-input').setValue('history');
        await $('#path-apply-btn').click();
        await browser.waitUntil(async () => (await $$('.graph-row')).length > 0, {
            timeout: 20_000,
            timeoutMsg: 'Expected graph rows after applying a path filter.',
        });

        await graph.close();
    });

    it('clicks merge-conflict UI actions and verifies the merge result in git', async () => {
        createMergeConflict('e2e/conflict-actions', [
            {
                filePath: 'conflicts/e2e-ours.txt',
                base: 'base ours\n',
                incoming: 'incoming ours\n',
                current: 'current ours\n',
            },
            {
                filePath: 'conflicts/e2e-theirs.txt',
                base: 'base theirs\n',
                incoming: 'incoming theirs\n',
                current: 'current theirs\n',
            },
            {
                filePath: 'conflicts/e2e-manual.txt',
                base: 'base manual\n',
                incoming: 'incoming manual\n',
                current: 'current manual\n',
            },
        ]);

        await openLookGitWorkbench();
        await refreshChanges();
        await openWebview(/Changes/);
        await $('.conflict-file-row[data-file="conflicts/e2e-ours.txt"]').waitForExist();

        await clickFileAction('conflicts/e2e-manual.txt', 'open-merge-btn');
        await waitForActiveEditorLabel('e2e-manual.txt');
        await closeAllEditors();

        await openWebview(/Changes/);
        await clickFileAction('conflicts/e2e-ours.txt', 'accept-ours-btn');
        await waitForGit(
            () => !splitLines(git(['ls-files', '-u', '--', 'conflicts/e2e-ours.txt'])).length
                && fs.readFileSync(path.join(repoPath!, 'conflicts/e2e-ours.txt'), 'utf8') === 'current ours\n',
            'Expected Accept Current to stage the current version.',
        );

        await refreshChanges();
        await openWebview(/Changes/);
        await clickFileAction('conflicts/e2e-theirs.txt', 'accept-theirs-btn');
        await waitForGit(
            () => cachedNames().includes('conflicts/e2e-theirs.txt')
                && fs.readFileSync(path.join(repoPath!, 'conflicts/e2e-theirs.txt'), 'utf8') === 'incoming theirs\n',
            'Expected Accept Incoming to stage the incoming version.',
        );

        writeFixtureFile('conflicts/e2e-manual.txt', 'manual resolution\n');
        await refreshChanges();
        await openWebview(/Changes/);
        await clickFileAction('conflicts/e2e-manual.txt', 'mark-resolved-btn');
        await waitForGit(
            () => cachedNames().includes('conflicts/e2e-manual.txt'),
            'Expected Mark Resolved to stage the manually resolved file.',
        );

        await refreshChanges();
        await openWebview(/Changes/);
        await clickVisible('#continue-op-btn');
        await waitForGit(
            () => statusPorcelain().length === 0 && git(['log', '-1', '--format=%P']).split(' ').length === 2,
            'Expected Continue to complete the merge and leave a clean worktree.',
        );
    });

    it('clicks abort merge from the conflict banner and verifies git aborts the operation', async () => {
        createMergeConflict('e2e/conflict-abort', [{
            filePath: 'conflicts/e2e-abort.txt',
            base: 'base abort\n',
            incoming: 'incoming abort\n',
            current: 'current abort\n',
        }]);

        await openLookGitWorkbench();
        await refreshChanges();
        const changes = await openWebview(/Changes/);
        await $('.conflict-file-row[data-file="conflicts/e2e-abort.txt"]').waitForExist();
        await clickVisible('#abort-op-btn');
        await changes.close();
        await takeNotificationAction('Abort the current merge?', 'Abort');
        await waitForGit(
            () => statusPorcelain().length === 0 && !gitTry(['rev-parse', '-q', '--verify', 'MERGE_HEAD']),
            'Expected Abort to stop the merge and clean the working tree.',
        );
    });

    it('handles a real submodule gitlink through the Changes UI', async function (this: Mocha.Context) {
        cleanupWorkingTree();
        git(['checkout', '-q', 'main']);

        const childSource = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-e2e-submodule-'));
        try {
            initGitRepo(childSource);
            commitFileAt(childSource, 'child.txt', 'child v1\n', 'child base');

            try {
                git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', childSource, 'modules/e2e-child']);
                git(['commit', '-q', '-m', 'e2e add submodule']);
            } catch {
                this.skip();
            }

            const submoduleWorktree = path.join(repoPath!, 'modules/e2e-child');
            configureRepo(submoduleWorktree);
            commitFileAt(submoduleWorktree, 'child.txt', 'child v2\n', 'child update');

            await openLookGitWorkbench();
            await refreshChanges();
            await openWebview(/Changes/);
            await $('.file-row[data-file="modules/e2e-child"]').waitForExist();

            await clickFileAction('modules/e2e-child', 'stage-btn');
            await waitForGit(
                () => cachedNames().includes('modules/e2e-child'),
                'Expected staging the submodule row to stage the parent gitlink update.',
            );

            await clickFileAction('modules/e2e-child', 'unstage-btn');
            await waitForGit(
                () => !cachedNames().includes('modules/e2e-child')
                    && statusPorcelain().some((line) => line.includes('modules/e2e-child')),
                'Expected unstaging the submodule row to keep the gitlink update unstaged.',
            );

            await clickFileAction('modules/e2e-child', 'stage-btn');
            await waitForGit(
                () => cachedNames().includes('modules/e2e-child'),
                'Expected the submodule gitlink to be stageable again.',
            );
            git(['commit', '-q', '-m', 'e2e update submodule pointer']);
            await waitForGit(
                () => !statusPorcelain().some((line) => line.includes('modules/e2e-child')),
                'Expected committing the submodule pointer to leave the parent repo clean.',
            );
        } finally {
            fs.rmSync(childSource, { recursive: true, force: true });
        }
    });
});
