import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { browser } from '@wdio/globals';

type Workbench = Awaited<ReturnType<typeof browser.getWorkbench>>;
type VscodeWebview = Awaited<ReturnType<Workbench['getAllWebviews']>>[number];

describe('installed VSIX startup', () => {
    it('loads the packaged extension, opens a generated repo, and refreshes changes without repository registration errors', async () => {
        const expectedRepo = requiredEnv('LOOK_GIT_INSTALLED_VSIX_REPO');
        const expectedExtensionPath = requiredEnv('LOOK_GIT_INSTALLED_EXTENSION_PATH');

        const activation = await activateInstalledLookGit(expectedRepo);
        assert.equal(normalizePath(activation.repoPath), normalizePath(expectedRepo));
        assert.equal(normalizePath(activation.extensionPath), normalizePath(expectedExtensionPath));
        assert.equal(activation.isActive, true);

        assertStatus(expectedRepo, [
            'A  src/staged.ts',
            ' M src/core/repository.ts',
            '?? notes/local.md',
        ]);

        const workbench = await browser.getWorkbench();
        const webview = await findWebviewByTitle(workbench, /Look Git/);
        await openWebview(webview);
        try {
            await waitForChangesDomReady(3);
            const state = await readChangesViewState();
            assert.equal(state.hasRegistrationError, false, `Unexpected repository registration error in webview text:\n${state.text}`);
            assert.deepEqual([...state.visibleRows].sort(), [
                'notes/local.md',
                'src/core/repository.ts',
                'src/staged.ts',
            ].sort());
        } finally {
            await closeWebview();
        }

        assertStatus(expectedRepo, [
            'A  src/staged.ts',
            ' M src/core/repository.ts',
            '?? notes/local.md',
        ]);
    });
});

async function activateInstalledLookGit(expectedRepo: string): Promise<{
    readonly repoPath: string;
    readonly extensionPath: string;
    readonly isActive: boolean;
}> {
    return await browser.executeWorkbench(async (vscode) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            throw new Error('VS Code did not open a workspace folder.');
        }

        const extension = vscode.extensions.getExtension('mathias8dev.look-git');
        if (!extension) {
            throw new Error('Look Git extension is not installed in the WDIO host.');
        }

        await extension.activate();
        await vscode.commands.executeCommand('workbench.view.extension.look-git');
        await vscode.commands.executeCommand('lookGit.changes.refresh');

        return {
            repoPath: workspaceFolder,
            extensionPath: extension.extensionPath,
            isActive: extension.isActive,
        };
    }, expectedRepo);
}

async function findWebviewByTitle(workbench: Workbench, titlePattern: RegExp): Promise<VscodeWebview> {
    const webviews = await workbench.getAllWebviews();
    const foundTitles: string[] = [];
    for (const webview of webviews) {
        await openWebview(webview);
        const title = await browser.execute(() => document.title);
        foundTitles.push(title);
        await closeWebview();
        if (titlePattern.test(title)) {
            return webview;
        }
    }
    throw new Error(`No webview matched ${titlePattern}. Found: ${foundTitles.join(', ') || '<none>'}`);
}

async function openWebview(webview: VscodeWebview): Promise<void> {
    await browser.switchFrame(webview.elem);
    await webview.activeFrame.waitForExist();
    await browser.switchFrame(webview.activeFrame);
}

async function closeWebview(): Promise<void> {
    await browser.switchFrame(null);
    await browser.switchFrame(null);
}

async function waitForChangesDomReady(minRows: number): Promise<void> {
    await repeatUntil(async () => {
        const state = await readChangesViewState();
        return state.hasShell && state.hasContent && state.visibleRows.length >= minRows && !state.hasRegistrationError;
    });
}

async function readChangesViewState(): Promise<{
    readonly hasShell: boolean;
    readonly hasContent: boolean;
    readonly hasRegistrationError: boolean;
    readonly visibleRows: readonly string[];
    readonly text: string;
}> {
    return await browser.execute(() => {
        const text = document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const visibleRows = Array.from(document.querySelectorAll('article.change-row'))
            .map((row) => row.getAttribute('title') ?? '')
            .filter(Boolean);
        return {
            hasShell: Boolean(document.querySelector('main.changes-shell')),
            hasContent: Boolean(document.querySelector('section[aria-label="Repository changes"]')),
            hasRegistrationError: /Repository ".+" is not registered|changes\/refresh/.test(text),
            visibleRows,
            text,
        };
    });
}

async function repeatUntil(predicate: () => Promise<boolean>): Promise<void> {
    while (!await predicate()) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

function assertStatus(repo: string, expectedSnippets: readonly string[]): void {
    const status = git(repo, ['status', '--porcelain=v1', '--untracked-files=all']);
    for (const snippet of expectedSnippets) {
        assert.ok(status.includes(snippet), `Missing status snippet "${snippet}" in:\n${status}`);
    }
}

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function normalizePath(value: string): string {
    return path.normalize(value);
}

function requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
