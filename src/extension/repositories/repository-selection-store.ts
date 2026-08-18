import * as vscode from 'vscode';
import type { RepoContext } from '@core/git/domain/repo-context';
import { RepositoryContextStore } from '@extension/repositories/repository-context-store';
import { isPathInside, normalizePathForComparison } from '@extension/utils/path-compare';

export interface RepositorySelectionState {
    readonly context: RepoContext | undefined;
}

export interface RepositorySelectionAccessor {
    readonly currentContext: RepoContext | undefined;
}

export interface RepositoryContextAccessor extends RepositorySelectionAccessor {
    readonly contexts: readonly RepoContext[];
}

export class RepositorySelectionStore implements RepositoryContextAccessor, vscode.Disposable {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<RepositorySelectionState>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    private readonly contextStore = new RepositoryContextStore();

    constructor() {
        this.contextStore.onDidChange(({ activeContext }) => {
            this.onDidChangeEmitter.fire({ context: activeContext });
        });
    }

    get currentContext(): RepoContext | undefined {
        return this.contextStore.activeContext;
    }

    get contexts(): readonly RepoContext[] {
        return this.contextStore.contexts;
    }

    get soleTopLevelContext(): RepoContext | undefined {
        const contexts = this.contextStore.contexts.filter((context) => !context.parentId);
        return contexts.length === 1 ? contexts[0] : undefined;
    }

    setContexts(contexts: readonly RepoContext[]): void {
        this.contextStore.setContexts(contexts);
    }

    selectContext(contextId: string | undefined): void {
        this.contextStore.setActiveContextId(contextId);
    }

    selectContextForResource(resourcePath: string | undefined): void {
        if (!resourcePath) { return; }
        const context = this.contextStore.contexts
            .filter((candidate) => isPathInside(resourcePath, candidate.cwd) || normalizePathForComparison(resourcePath) === normalizePathForComparison(candidate.cwd))
            .sort((left, right) => normalizePathForComparison(right.cwd).length - normalizePathForComparison(left.cwd).length)[0];
        if (context) {
            this.contextStore.setActiveContextId(context.id);
        }
    }

    dispose(): void {
        this.contextStore.dispose();
        this.onDidChangeEmitter.dispose();
    }
}
