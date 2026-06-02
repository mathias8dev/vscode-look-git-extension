import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageJson {
    readonly contributes?: {
        readonly commands?: readonly { readonly command: string; readonly title: string; readonly icon?: string }[];
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
            expect(viewTitle).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    command,
                    when: 'view == lookGit.commitHistory',
                }),
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
    });
});

function packageJson(): PackageJson {
    return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as PackageJson;
}
