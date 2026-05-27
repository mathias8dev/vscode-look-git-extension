import { execFileSync } from 'child_process';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { $, $$, browser } from '@wdio/globals';

const repoPath = process.env.LOOK_GIT_E2E_REPO;
assert.ok(repoPath, 'LOOK_GIT_E2E_REPO must point to the fixture repository.');

function git(args: string[]): string {
    return execFileSync('git', args, {
        cwd: repoPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function writeFixtureFile(relativePath: string, content: string): void {
    const fullPath = path.join(repoPath!, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
}

async function openLookGitWorkbench(): Promise<any> {
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
        await clickFileAction('src/dirty.txt', 'stage-btn');
        await waitForGit(
            () => git(['diff', '--cached', '--name-only']).split('\n').includes('src/dirty.txt'),
            'Expected src/dirty.txt to be staged after clicking Stage.',
        );

        await clickFileAction('src/dirty.txt', 'unstage-btn');
        await waitForGit(
            () => !git(['diff', '--cached', '--name-only']).split('\n').includes('src/dirty.txt'),
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
        await $('#commit-message').setValue('e2e commit from UI');
        await $('#commit-btn').click();
        await waitForGit(
            () => git(['log', '-1', '--format=%s']) === 'e2e commit from UI',
            'Expected clicking Commit to create a real Git commit.',
        );

        writeFixtureFile('src/e2e-stash.txt', 'stash from e2e\n');
        await refreshChanges();
        await clickFileAction('src/e2e-stash.txt', 'stage-btn');
        await $('#stash-staged-btn').waitForExist();
        await $('#stash-staged-btn').click();
        await waitForGit(
            () => {
                try {
                    return git(['stash', 'show', '--name-only', 'stash@{0}']).split('\n').includes('src/e2e-stash.txt')
                        && !git(['status', '--porcelain']).includes('src/e2e-stash.txt');
                } catch {
                    return false;
                }
            },
            'Expected clicking Stash Staged Changes to create a real stash containing src/e2e-stash.txt.',
        );
        await commitView.close();
    });

    it('clicks the Graph webview and verifies search, path filter, selection, and details', async () => {
        await openLookGitWorkbench();
        await browser.executeWorkbench((vscode: any) => vscode.commands.executeCommand('lookGit.openGraph'));

        const graph = await openWebview(/Git Graph/);
        await $('#search-input').waitForExist();
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

        await openPathFilterDropdown();
        await $('#filter-path-input').setValue('history');
        await $('#path-apply-btn').click();
        await browser.waitUntil(async () => (await $$('.graph-row')).length > 0, {
            timeout: 20_000,
            timeoutMsg: 'Expected graph rows after applying a path filter.',
        });

        await graph.close();
    });
});
