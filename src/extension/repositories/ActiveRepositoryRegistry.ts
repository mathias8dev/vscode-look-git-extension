import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import type { GitRepository } from '../../application/ports/git-repository';
import { RepoKind, type RepoContext } from '../../core/git/domain/RepoContext';
import { GitProcessRepository } from '../git/GitProcessRepository';

export interface ActiveRepositoryState {
    readonly repo: GitRepository | undefined;
    readonly context: RepoContext | undefined;
}

export interface ActiveRepositoryAccessor {
    readonly currentRepository: GitRepository | undefined;
    readonly currentContext: RepoContext | undefined;
    requireRepository(): GitRepository;
}

export type GitRepositoryFactory = (cwd: string) => GitRepository;

export class ActiveRepositoryRegistry implements ActiveRepositoryAccessor, vscode.Disposable {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<ActiveRepositoryState>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    private repo: GitRepository | undefined;
    private context: RepoContext | undefined;

    constructor(private readonly createRepository: GitRepositoryFactory = (cwd) => new GitProcessRepository(cwd)) {}

    get currentRepository(): GitRepository | undefined {
        return this.repo;
    }

    get currentContext(): RepoContext | undefined {
        return this.context;
    }

    requireRepository(): GitRepository {
        if (!this.repo) {
            throw new Error('No active Git repository.');
        }
        return this.repo;
    }

    setActiveRepository(cwd: string | undefined): void {
        if (!cwd) {
            this.update(undefined, undefined);
            return;
        }

        if (this.repo?.cwd === cwd && this.context) {
            return;
        }

        this.update(this.createRepository(cwd), createRepoContext(cwd));
    }

    dispose(): void {
        this.onDidChangeEmitter.dispose();
    }

    private update(repo: GitRepository | undefined, context: RepoContext | undefined): void {
        this.repo = repo;
        this.context = context;
        this.onDidChangeEmitter.fire({ repo, context });
    }
}

export function createRepoContext(cwd: string): RepoContext {
    return {
        id: crypto.createHash('sha256').update(cwd).digest('hex').substring(0, 16),
        cwd,
        kind: RepoKind.Main,
        label: path.basename(cwd) || cwd,
    };
}
