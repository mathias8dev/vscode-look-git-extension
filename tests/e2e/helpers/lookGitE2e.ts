import { execFileSync } from 'child_process';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { $, $$, browser } from '@wdio/globals';

export const repoPath = process.env.LOOK_GIT_E2E_REPO;
assert.ok(repoPath, 'LOOK_GIT_E2E_REPO must point to the fixture repository.');

export function git(args: string[]): string {
    return gitAt(repoPath!, args);
}

export function gitAt(cwd: string, args: string[]): string {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

export function gitTry(args: string[]): boolean {
    try {
        git(args);
        return true;
    } catch {
        return false;
    }
}

export function writeFixtureFile(relativePath: string, content: string): void {
    const fullPath = path.join(repoPath!, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
}

export function splitLines(output: string): string[] {
    return output.split('\n').filter(Boolean);
}

export function statusPorcelain(): string[] {
    return splitLines(git(['status', '--porcelain', '-uall']));
}

export function cachedNames(): string[] {
    return splitLines(git(['diff', '--cached', '--name-only']));
}

export function stashLines(): string[] {
    try {
        return splitLines(git(['stash', 'list']));
    } catch {
        return [];
    }
}

export function cleanupWorkingTree(): void {
    gitTry(['merge', '--abort']);
    gitTry(['rebase', '--abort']);
    git(['reset', '--hard', 'HEAD']);
    git(['clean', '-fd']);
}

export function configureRepo(cwd: string): void {
    gitAt(cwd, ['config', 'user.email', 'test@example.com']);
    gitAt(cwd, ['config', 'user.name', 'Test User']);
}

export function initGitRepo(cwd: string): void {
    gitAt(cwd, ['init', '-q']);
    gitAt(cwd, ['checkout', '-q', '-b', 'main']);
    configureRepo(cwd);
}

export function commitFileAt(cwd: string, relativePath: string, content: string, message: string): string {
    const fullPath = path.join(cwd, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    gitAt(cwd, ['add', '-A']);
    gitAt(cwd, ['commit', '-q', '-m', message]);
    return gitAt(cwd, ['rev-parse', 'HEAD']);
}

export interface ConflictFixtureFile {
    filePath: string;
    base: string;
    incoming: string;
    current: string;
}

export function createMergeConflict(branchName: string, files: ConflictFixtureFile[]): void {
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

export async function openLookGitWorkbench(): Promise<any> {
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

export async function openWebview(title: string | RegExp): Promise<any> {
    await leaveWebviewContext();
    const workbench = await browser.getWorkbench();
    const webview = await workbench.getWebviewByTitle(title);
    await webview.open();
    return webview;
}

export async function refreshChanges(): Promise<void> {
    await browser.executeWorkbench((vscode: any) => vscode.commands.executeCommand('lookGit.refreshChanges'));
}

export function fileSelector(filePath: string): string {
    return `[data-file="${filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

export async function leaveWebviewContext(): Promise<void> {
    await browser.switchToFrame(null);
    await browser.switchToFrame(null);
}

export async function clickFileAction(filePath: string, actionClass: string): Promise<void> {
    const rowSelector = `.file-row${fileSelector(filePath)}`;
    const actionSelector = `.${actionClass}${fileSelector(filePath)}`;

    await browser.waitUntil(async () => {
        try {
            const row = await $(rowSelector);
            return await row.isDisplayed();
        } catch {
            return false;
        }
    }, {
        timeout: 5_000,
        timeoutMsg: `Expected ${filePath} row to be visible.`,
    });

    await browser.execute((selector) => {
        document.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: 'center' });
    }, rowSelector);

    const row = await $(rowSelector);
    await row.moveTo();

    const action = await $(actionSelector);
    await browser.waitUntil(async () => await action.isDisplayed() && await action.isClickable(), {
        timeout: 5_000,
        timeoutMsg: `Expected ${actionClass} for ${filePath} to be visible and clickable.`,
    });
    await action.click();
}

export async function clickVisible(selector: string): Promise<void> {
    const element = await $(selector);
    await element.waitForClickable();
    await element.click();
}

export async function clickSectionAction(section: string, selector: string): Promise<void> {
    const header = await $(`.section-header[data-section="${section}"]`);
    await header.waitForDisplayed();
    await header.scrollIntoView();
    await header.moveTo();

    const action = await $(selector);
    await browser.waitUntil(async () => await action.isDisplayed() && await action.isClickable(), {
        timeout: 5_000,
        timeoutMsg: `Expected ${selector} in ${section} section to be visible and clickable after hovering the header.`,
    });
    await action.click();
}

export async function clickStashAction(actionClass: string, index = 0): Promise<void> {
    const rowSelector = `.stash-row[data-stash-index="${index}"]`;
    const actionSelector = `.${actionClass}[data-index="${index}"]`;
    const row = await $(rowSelector);
    await row.waitForDisplayed();
    await row.scrollIntoView();
    await row.moveTo();

    const action = await $(actionSelector);
    await browser.waitUntil(async () => await action.isDisplayed() && await action.isClickable(), {
        timeout: 5_000,
        timeoutMsg: `Expected ${actionClass} for stash@{${index}} to be visible and clickable.`,
    });
    await action.click();
}

export async function expandStashesSection(): Promise<void> {
    if (await $('.stash-row[data-stash-index="0"]').isExisting()) {
        return;
    }
    await clickVisible('[data-section="stashes"] .section-title-row');
    await $('.stash-row[data-stash-index="0"]').waitForExist();
}

export async function waitForActiveEditorLabel(labelPart: string): Promise<void> {
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

export async function closeAllEditors(): Promise<void> {
    await leaveWebviewContext();
    await browser.executeWorkbench((vscode: any) => vscode.commands.executeCommand('workbench.action.closeAllEditors'));
}

export async function clickGraphToggle(expectActive: boolean): Promise<void> {
    const toggle = await $('#toggle-graph-btn');
    await toggle.waitForClickable();
    await toggle.click();

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

export async function clickFirstGraphCommit(): Promise<void> {
    const matchedButtons = await $$('.graph-row.filter-matched .commit-row-button');
    const firstCommitButton = matchedButtons[0] ?? await $('.graph-row .commit-row-button');
    // Scroll into view first: content-visibility:auto on graph rows means
    // off-screen rows are not rendered and WebDriver cannot click them.
    await browser.execute(
        (selector: string) => document.querySelector(selector)?.scrollIntoView({ block: 'center', inline: 'nearest' }),
        '.graph-row.filter-matched .commit-row-button, .graph-row .commit-row-button',
    );
    await firstCommitButton.waitForClickable({ timeout: 5_000 });
    await firstCommitButton.click();

    await browser.waitUntil(async () => {
        return browser.execute(() => Boolean(document.querySelector('.graph-row.selected')));
    }, {
        timeout: 5_000,
        timeoutMsg: 'Expected a graph row to be selected after clicking a commit.',
    });
}

export async function openPathFilterDropdown(): Promise<void> {
    const pathFilter = await $('[data-filter="paths"]');
    await pathFilter.waitForClickable();
    await pathFilter.click();

    await $('#filter-path-input').waitForExist();
}

export async function takeNotificationAction(messagePart: string, actionTitle: string): Promise<void> {
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

export async function waitForGit(predicate: () => boolean, message: string): Promise<void> {
    await browser.waitUntil(() => {
        try {
            return predicate();
        } catch {
            return false;
        }
    }, {
        timeout: 20_000,
        timeoutMsg: message,
    });
}
