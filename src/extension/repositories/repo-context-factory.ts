import * as path from 'path';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import { stableRepoContextId } from '@extension/repositories/repo-context-id';

export function createRepoContext(cwd: string): RepoContext {
    return {
        id: stableRepoContextId(cwd),
        cwd: path.normalize(cwd),
        kind: RepoKind.Main,
        label: path.basename(cwd) || cwd,
    };
}

export function createSubmoduleRepoContext(cwd: string, parentId: string): RepoContext {
    return {
        id: stableRepoContextId(cwd),
        cwd: path.normalize(cwd),
        kind: RepoKind.Submodule,
        parentId,
        label: path.basename(cwd) || cwd,
    };
}
