import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageJson {
    readonly contributes?: {
        readonly commands?: readonly { readonly command: string; readonly title?: string; readonly enablement?: string }[];
        readonly submenus?: readonly { readonly id: string; readonly label: string }[];
        readonly menus?: {
            readonly [menuId: string]: readonly MenuContribution[] | undefined;
            readonly 'webview/context'?: readonly {
                readonly command: string;
                readonly when: string;
            }[];
        };
    };
}

interface MenuContribution {
    readonly command?: string;
    readonly submenu?: string;
    readonly when?: string;
    readonly group?: string;
}

interface LookGitContextMenuActionFixture {
    readonly command: string;
    readonly title: string;
    readonly group: string;
    readonly when: string;
}

const lookGitFileContextMenuFixture = {
    submenu: {
        id: 'lookGit.file.contextMenu',
        label: 'Look Git',
    },
    parentMenus: ['explorer/context', 'editor/context'],
    parentWhen: 'resourceScheme == file',
    parentGroup: 'lookGit@1',
    actions: [
        {
            command: 'lookGit.file.showHistory',
            title: 'Show History...',
            group: '1_local_history@1',
            when: 'resourceScheme == file',
        },
        {
            command: 'lookGit.history.push',
            title: 'Push',
            group: '2_git@1',
            when: 'resourceScheme == file',
        },
        {
            command: 'lookGit.history.pull',
            title: 'Pull',
            group: '2_git@2',
            when: 'resourceScheme == file',
        },
        {
            command: 'lookGit.history.fetchAll',
            title: 'Fetch from All Remotes',
            group: '2_git@3',
            when: 'resourceScheme == file',
        },
    ] satisfies readonly LookGitContextMenuActionFixture[],
} as const;

describe('Commit History native context menu manifest', () => {
    it('delegates commit and file context menus to VS Code webview/context contributions', () => {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as PackageJson;
        const commands = new Set((pkg.contributes?.commands ?? []).map((entry) => entry.command));
        const historySquashCommand = pkg.contributes?.commands?.find((entry) => entry.command === 'lookGit.history.squashInto');
        const webviewContextMenu = pkg.contributes?.menus?.['webview/context'] ?? [];

        expect(commands).toContain('lookGit.history.copyRevisionNumber');
        expect(commands).toContain('lookGit.history.explainDiff');
        expect(commands).toContain('lookGit.history.openFileDiff');
        expectLookGitFileContextMenu(pkg);
        expect(historySquashCommand).toMatchObject({
            title: 'Squash Commits...',
            enablement: 'historyHasMultipleSelectedCommits',
        });
        expect(pkg.contributes?.commands?.find((entry) => entry.command === 'lookGit.history.cherryPick')).toMatchObject({
            enablement: 'historyCanCherryPick',
        });
        expect(pkg.contributes?.commands?.find((entry) => entry.command === 'lookGit.history.undoCommit')).toMatchObject({
            enablement: 'historyCanUndoCommit',
        });
        expect(pkg.contributes?.commands?.find((entry) => entry.command === 'lookGit.history.goToChildCommit')).toMatchObject({
            enablement: 'historyCanGoToChild',
        });
        expect(pkg.contributes?.commands?.find((entry) => entry.command === 'lookGit.history.goToParentCommit')).toMatchObject({
            enablement: 'historyCanGoToParent',
        });
        expect(webviewContextMenu).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: 'lookGit.history.copyRevisionNumber',
                when: expect.stringContaining("webviewId == 'lookGit.commitHistory'"),
            }),
            expect.objectContaining({
                command: 'lookGit.history.explainDiff',
                when: expect.stringContaining("webviewSection == 'historyCommit'"),
            }),
            expect.objectContaining({
                command: 'lookGit.history.cherryPick',
                when: "webviewId == 'lookGit.commitHistory' && webviewSection == 'historyCommit'",
            }),
            expect.objectContaining({
                command: 'lookGit.history.squashInto',
                when: "webviewId == 'lookGit.commitHistory' && webviewSection == 'historyCommit'",
            }),
            expect.objectContaining({
                command: 'lookGit.history.undoCommit',
                when: "webviewId == 'lookGit.commitHistory' && webviewSection == 'historyCommit'",
            }),
            expect.objectContaining({
                command: 'lookGit.history.goToChildCommit',
                when: "webviewId == 'lookGit.commitHistory' && webviewSection == 'historyCommit'",
            }),
            expect.objectContaining({
                command: 'lookGit.history.goToParentCommit',
                when: "webviewId == 'lookGit.commitHistory' && webviewSection == 'historyCommit'",
            }),
            expect.objectContaining({
                command: 'lookGit.history.openFileDiff',
                when: expect.stringContaining("webviewSection == 'historyFile'"),
            }),
        ]));
    });
});

function expectLookGitFileContextMenu(pkg: PackageJson): void {
    expect(pkg.contributes?.submenus).toEqual(expect.arrayContaining([
        expect.objectContaining(lookGitFileContextMenuFixture.submenu),
    ]));

    for (const menuId of lookGitFileContextMenuFixture.parentMenus) {
        const parentMenu = pkg.contributes?.menus?.[menuId] ?? [];
        expect(parentMenu).toEqual(expect.arrayContaining([
            expect.objectContaining({
                submenu: lookGitFileContextMenuFixture.submenu.id,
                when: lookGitFileContextMenuFixture.parentWhen,
                group: lookGitFileContextMenuFixture.parentGroup,
            }),
        ]));
        const parentCommands = parentMenu
            .map((entry) => entry.command)
            .filter((command): command is string => command !== undefined);
        expect(parentCommands).not.toEqual(expect.arrayContaining(
            lookGitFileContextMenuFixture.actions.map((action) => action.command),
        ));
    }

    const submenu = pkg.contributes?.menus?.[lookGitFileContextMenuFixture.submenu.id] ?? [];

    for (const action of lookGitFileContextMenuFixture.actions) {
        expect(pkg.contributes?.commands?.find((entry) => entry.command === action.command)).toMatchObject({
            command: action.command,
            title: action.title,
        });
        expect(submenu).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: action.command,
                when: action.when,
                group: action.group,
            }),
        ]));
    }
}
