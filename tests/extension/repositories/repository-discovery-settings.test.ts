import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
    getRepositoryScanMaxDepth,
    registerRepositoryScanMaxDepthListener,
} from '@extension/repositories/repository-discovery-settings';
import { resetVscodeMock } from '@tests/helpers/provider-runtime';
import { workspace } from '@tests/mocks/vscode';

interface PackageJson {
    readonly contributes?: {
        readonly configuration?: {
            readonly properties?: Readonly<Record<string, {
                readonly type?: string;
                readonly scope?: string;
                readonly default?: number;
                readonly minimum?: number;
            }>>;
        };
    };
}

describe('repository discovery settings', () => {
    beforeEach(() => {
        resetVscodeMock();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('declares repository scan depth as a resource-scoped setting', () => {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as PackageJson;

        expect(pkg.contributes?.configuration?.properties?.['lookGit.repositoryScanMaxDepth']).toMatchObject({
            type: 'integer',
            scope: 'resource',
            default: 1,
            minimum: 0,
        });
    });

    it('reads repository scan depth for the requested workspace resource', () => {
        const resource = vscode.Uri.file('/workspace/app');
        const getConfiguration = vi.spyOn(vscode.workspace, 'getConfiguration');
        workspace.values.set('lookGit.repositoryScanMaxDepth', 2);

        expect(getRepositoryScanMaxDepth(resource)).toBe(2);
        expect(getConfiguration).toHaveBeenCalledWith('lookGit', resource);
    });

    it('falls back to the default for invalid values', () => {
        const resource = vscode.Uri.file('/workspace/app');

        workspace.values.set('lookGit.repositoryScanMaxDepth', -1);
        expect(getRepositoryScanMaxDepth(resource)).toBe(1);

        workspace.values.set('lookGit.repositoryScanMaxDepth', 1.5);
        expect(getRepositoryScanMaxDepth(resource)).toBe(1);
    });

    it('notifies only when repository scan depth changes', () => {
        const onDidChange = vi.fn();
        const disposable = registerRepositoryScanMaxDepthListener(onDidChange);

        workspace.fireConfigurationChanged('lookGit.fontSize');
        expect(onDidChange).not.toHaveBeenCalled();

        workspace.fireConfigurationChanged('lookGit.repositoryScanMaxDepth');
        expect(onDidChange).toHaveBeenCalledOnce();

        disposable.dispose();
        workspace.fireConfigurationChanged('lookGit.repositoryScanMaxDepth');
        expect(onDidChange).toHaveBeenCalledOnce();
    });
});
