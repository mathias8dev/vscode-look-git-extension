import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageCommand {
    readonly command: string;
    readonly title: string;
    readonly icon?: string;
    readonly toggled?: unknown;
}

interface PackageJson {
    readonly contributes?: {
        readonly commands?: readonly PackageCommand[];
        readonly submenus?: readonly { readonly id: string; readonly label: string }[];
        readonly menus?: {
            readonly 'view/title'?: readonly {
                readonly command?: string;
                readonly submenu?: string;
                readonly when: string;
                readonly group: string;
            }[];
            readonly [menuId: string]: readonly {
                readonly command?: string;
                readonly submenu?: string;
                readonly when?: string;
                readonly group: string;
            }[] | undefined;
        };
    };
}

describe('native view title toolbar manifest', () => {
    it('contributes commit history toolbar actions to the native VS Code view title', () => {
        const pkg = packageJson();
        const commands = new Set((pkg.contributes?.commands ?? []).map((entry) => entry.command));
        const viewTitle = pkg.contributes?.menus?.['view/title'] ?? [];

        for (const command of [
            'lookGit.history.selectRepositoryScope',
            'lookGit.history.selectBranch',
            'lookGit.history.goToCurrent',
            'lookGit.history.fetchAll',
            'lookGit.history.pull',
            'lookGit.history.push',
            'lookGit.history.refresh',
            'lookGit.history.viewAsList',
            'lookGit.history.viewAsTree',
        ]) {
            expect(commands.has(command)).toBe(true);
            const expectedWhen = command === 'lookGit.history.selectRepositoryScope'
                ? 'view == lookGit.commitHistory && lookGit.historyHasSubmodules'
                : 'view == lookGit.commitHistory';
            expect(viewTitle).toEqual(expect.arrayContaining([
                expect.objectContaining({ command, when: expectedWhen }),
            ]));
        }
    });

    it('contributes changes toolbar actions and menus to the native VS Code view title', () => {
        const pkg = packageJson();
        const commands = new Set((pkg.contributes?.commands ?? []).map((entry) => entry.command));
        const submenus = new Set((pkg.contributes?.submenus ?? []).map((entry) => entry.id));
        const viewTitle = pkg.contributes?.menus?.['view/title'] ?? [];

        expect(commands.has('lookGit.changes.refresh')).toBe(true);
        expect(commands.has('lookGit.changes.openGraph')).toBe(true);
        expect(commands.has('lookGit.changes.sortByExtension')).toBe(true);
        expect(commands.has('lookGit.changes.sortByExtensionChecked')).toBe(true);
        expect(commandById(pkg, 'lookGit.changes.viewAsList')).toEqual(expect.objectContaining({
            title: 'View as List',
        }));
        expect(commandById(pkg, 'lookGit.changes.viewAsList')?.toggled).toBeUndefined();
        expect(commandById(pkg, 'lookGit.changes.viewAsListChecked')).toEqual(expect.objectContaining({
            title: '$(check) View as List',
        }));
        expect(commandById(pkg, 'lookGit.changes.viewAsTree')).toEqual(expect.objectContaining({
            title: 'View as Tree',
        }));
        expect(commandById(pkg, 'lookGit.changes.viewAsTree')?.toggled).toBeUndefined();
        expect(commandById(pkg, 'lookGit.changes.viewAsTreeChecked')).toEqual(expect.objectContaining({
            title: '$(check) View as Tree',
        }));
        expect(commandById(pkg, 'lookGit.changes.sortByPath')).toEqual(expect.objectContaining({
            title: 'Sort by Path',
        }));
        expect(commandById(pkg, 'lookGit.changes.sortByPath')?.toggled).toBeUndefined();
        expect(commandById(pkg, 'lookGit.changes.sortByPathChecked')).toEqual(expect.objectContaining({
            title: '$(check) Sort by Path',
        }));
        expect(commandById(pkg, 'lookGit.changes.sortByExtension')).toEqual(expect.objectContaining({
            title: 'Sort by Extension',
        }));
        expect(commandById(pkg, 'lookGit.changes.sortByExtension')?.toggled).toBeUndefined();
        expect(commandById(pkg, 'lookGit.changes.sortByExtensionChecked')).toEqual(expect.objectContaining({
            title: '$(check) Sort by Extension',
        }));
        expect(viewTitle).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: 'lookGit.changes.refresh',
                when: 'view == lookGit.changesView',
                group: 'navigation@1',
            }),
            expect.objectContaining({
                command: 'lookGit.changes.openGraph',
                when: 'view == lookGit.changesView',
                group: 'navigation@2',
            }),
            expect.objectContaining({
                submenu: 'lookGit.changes.viewSort',
                when: 'view == lookGit.changesView',
            }),
            expect.objectContaining({
                submenu: 'lookGit.changes.commitMenu',
                when: 'view == lookGit.changesView',
            }),
            expect.objectContaining({
                submenu: 'lookGit.changes.stashMenu',
                when: 'view == lookGit.changesView',
            }),
        ]));

        for (const submenu of [
            'lookGit.changes.viewSort',
            'lookGit.changes.commitMenu',
            'lookGit.changes.changesMenu',
            'lookGit.changes.pullPushMenu',
            'lookGit.changes.branchMenu',
            'lookGit.changes.remoteMenu',
            'lookGit.changes.stashMenu',
            'lookGit.changes.tagsMenu',
        ]) {
            expect(submenus.has(submenu)).toBe(true);
            expect(pkg.contributes?.menus?.[submenu]?.length).toBeGreaterThan(0);
        }

        expect(pkg.contributes?.menus?.['lookGit.changes.viewSort']).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: 'lookGit.changes.viewAsList',
                when: 'lookGit.changesViewMode != list',
            }),
            expect.objectContaining({
                command: 'lookGit.changes.viewAsListChecked',
                when: 'lookGit.changesViewMode == list',
            }),
            expect.objectContaining({
                command: 'lookGit.changes.viewAsTree',
                when: 'lookGit.changesViewMode != tree',
            }),
            expect.objectContaining({
                command: 'lookGit.changes.sortByPath',
                when: 'lookGit.changesSortMode != path',
            }),
            expect.objectContaining({
                command: 'lookGit.changes.sortByPathChecked',
                when: 'lookGit.changesSortMode == path',
            }),
            expect.objectContaining({
                command: 'lookGit.changes.sortByName',
                when: 'lookGit.changesSortMode != name',
            }),
            expect.objectContaining({
                command: 'lookGit.changes.sortByStatus',
                when: 'lookGit.changesSortMode != status',
            }),
            expect.objectContaining({
                command: 'lookGit.changes.sortByExtension',
                when: 'lookGit.changesSortMode != extension',
            }),
            expect.objectContaining({
                command: 'lookGit.changes.sortByExtensionChecked',
                when: 'lookGit.changesSortMode == extension',
            }),
        ]));
    });
});

function packageJson(): PackageJson {
    return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as PackageJson;
}

function commandById(pkg: PackageJson, command: string): PackageCommand | undefined {
    return pkg.contributes?.commands?.find((entry) => entry.command === command);
}
