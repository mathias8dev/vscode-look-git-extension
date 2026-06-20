import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import type { GitRepository } from '../../application/ports/git-repository';
import { RepoKind, type RepoContext } from '../../core/git/domain/RepoContext';
import { GitProcessRepository } from '../git/GitProcessRepository';
import { RuntimeRepositoryFactory } from '../git/runtime-repository-factory';
import type { RepositoryRegistry } from './RepositoryRegistry';

export interface ActiveRepositoryState {
    readonly repo: GitRepository | undefined;
    readonly context: RepoContext | undefined;
}

export interface ActiveRepositoryAccessor {
    readonly currentRepository: GitRepository | undefined;
    readonly currentContext: RepoContext | undefined;
    requireRepository(): GitRepository;
}

export interface GitRepositoryStore extends ActiveRepositoryAccessor {
    repositoryForRoot(cwd: string): GitRepository;
}

export type GitRepositoryFactory = (cwd: string) => GitRepository;

export class ActiveRepositoryRegistry implements GitRepositoryStore, vscode.Disposable {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<ActiveRepositoryState>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    private readonly repositoriesByCwd = new Map<string, GitRepository>();
    private repo: GitRepository | undefined;
    private context: RepoContext | undefined;

    constructor(
        private readonly createRepository: GitRepositoryFactory = (cwd) => new GitProcessRepository(cwd),
        private readonly runtimeRepositoryFactory = new RuntimeRepositoryFactory(),
    ) {}

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

    repositoryForRoot(cwd: string): GitRepository {
        const normalizedCwd = path.normalize(cwd);
        const existing = this.repositoriesByCwd.get(normalizedCwd);
        if (existing) { return existing; }
        const repo = this.createRepository(normalizedCwd);
        this.repositoriesByCwd.set(normalizedCwd, repo);
        return repo;
    }

    setActiveRepository(cwd: string | undefined): void {
        if (!cwd) {
            this.update(undefined, undefined);
            return;
        }

        const normalizedCwd = path.normalize(cwd);
        if (this.repo?.cwd === normalizedCwd && this.context) {
            return;
        }

        this.update(this.repositoryForRoot(normalizedCwd), createRepoContext(normalizedCwd));
    }

    async registerCurrentRuntimeContext(registry: RepositoryRegistry): Promise<void> {
        if (!this.repo || !this.context) { return; }

        const [repository, worktree] = await Promise.all([
            this.runtimeRepositoryFactory.createRepository(this.repo, this.context),
            this.runtimeRepositoryFactory.createMainWorktree(this.repo, this.context),
        ]);
        registry.registerRepository(repository);
        registry.registerWorktree(worktree);
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
