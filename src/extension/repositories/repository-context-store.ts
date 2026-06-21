import * as path from 'path';
import * as vscode from 'vscode';
import type { RepoContext } from '@core/git/domain/repo-context';

export interface RepositoryContextState {
    readonly contexts: readonly RepoContext[];
    readonly activeContext: RepoContext | undefined;
}

export class RepositoryContextStore implements vscode.Disposable {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<RepositoryContextState>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    private contextsById = new Map<string, RepoContext>();
    private activeContextId: string | undefined;

    get contexts(): readonly RepoContext[] {
        return [...this.contextsById.values()];
    }

    get activeContext(): RepoContext | undefined {
        return this.activeContextId ? this.contextsById.get(this.activeContextId) : undefined;
    }

    setContexts(contexts: readonly RepoContext[]): void {
        const previousContexts = this.contexts;
        const nextContextsById = new Map(contexts.map((context) => [context.id, context]));
        const previousActiveContextId = this.activeContextId;
        this.contextsById = nextContextsById;
        if (this.activeContextId && !this.contextsById.has(this.activeContextId)) {
            this.activeContextId = firstContextId(this.contextsById);
        }
        if (!this.activeContextId) {
            this.activeContextId = firstContextId(this.contextsById);
        }
        if (previousActiveContextId !== this.activeContextId || contextsChanged(previousContexts, this.contexts)) {
            this.fire();
        }
    }

    upsertContext(context: RepoContext): void {
        const previous = this.contextsById.get(context.id);
        if (sameContext(previous, context)) { return; }
        this.contextsById.set(context.id, context);
        if (!this.activeContextId) {
            this.activeContextId = context.id;
        }
        this.fire();
    }

    setActiveContextId(contextId: string | undefined): void {
        const nextContextId = contextId && this.contextsById.has(contextId) ? contextId : undefined;
        if (this.activeContextId === nextContextId) { return; }
        this.activeContextId = nextContextId;
        this.fire();
    }

    setActiveContextCwd(cwd: string | undefined): void {
        if (!cwd) {
            this.setActiveContextId(undefined);
            return;
        }
        const normalizedCwd = path.normalize(cwd);
        this.setActiveContextId([...this.contextsById.values()]
            .find((context) => path.normalize(context.cwd) === normalizedCwd)?.id);
    }

    dispose(): void {
        this.onDidChangeEmitter.dispose();
    }

    private fire(): void {
        this.onDidChangeEmitter.fire({
            contexts: this.contexts,
            activeContext: this.activeContext,
        });
    }
}

function firstContextId(contextsById: ReadonlyMap<string, RepoContext>): string | undefined {
    return contextsById.keys().next().value;
}

function contextsChanged(left: readonly RepoContext[], right: readonly RepoContext[]): boolean {
    if (left.length !== right.length) { return true; }
    return left.some((context, index) => !sameContext(context, right[index]));
}

function sameContext(left: RepoContext | undefined, right: RepoContext | undefined): boolean {
    return left?.id === right?.id
        && left?.cwd === right?.cwd
        && left?.kind === right?.kind
        && left?.parentId === right?.parentId
        && left?.label === right?.label;
}
