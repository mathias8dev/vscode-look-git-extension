import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

type ExtensionManifest = {
    contributes?: {
        views?: Record<string, Array<{ id: string }>>;
        menus?: Record<string, Array<{
            command?: string;
            submenu?: string;
            when?: string;
            group?: string;
        }>>;
    };
};

function readManifest(): ExtensionManifest {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as ExtensionManifest;
}

describe('extension manifest', () => {
    it('places the Changes view before Commit History in the Look Git activity view', () => {
        const views = readManifest().contributes?.views?.['look-git'] ?? [];
        const viewIds = views.map((view) => view.id);

        expect(viewIds.indexOf('lookGit.changesView')).toBeGreaterThanOrEqual(0);
        expect(viewIds.indexOf('lookGit.commitHistory')).toBeGreaterThanOrEqual(0);
        expect(viewIds.indexOf('lookGit.changesView')).toBeLessThan(viewIds.indexOf('lookGit.commitHistory'));
    });

    it('keeps the Commit History tree/list toggle visible in the view title', () => {
        const titleMenu = readManifest().contributes?.menus?.['view/title'] ?? [];

        expect(titleMenu).toContainEqual(expect.objectContaining({
            command: 'lookGit.historyViewAsTree',
            when: 'view == lookGit.commitHistory && !lookGit.historyViewAsTree',
            group: 'navigation@3',
        }));
        expect(titleMenu).toContainEqual(expect.objectContaining({
            command: 'lookGit.historyViewAsList',
            when: 'view == lookGit.commitHistory && lookGit.historyViewAsTree',
            group: 'navigation@3',
        }));
    });
});
