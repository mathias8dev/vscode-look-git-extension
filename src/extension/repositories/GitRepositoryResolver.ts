import * as path from 'path';
import * as vscode from 'vscode';
import type { GitRepository } from '../../application/ports/git-repository';
import type { GitRepositoryStore } from './ActiveRepositoryRegistry';

export interface GitRepositoryResolver {
    repositoryForUri(uri: vscode.Uri): Promise<GitRepository>;
}

export class GitRootRepositoryResolver implements GitRepositoryResolver {
    constructor(private readonly repositories: GitRepositoryStore) {}

    async repositoryForUri(uri: vscode.Uri): Promise<GitRepository> {
        if (uri.scheme !== 'file') {
            throw new Error('Look Git file actions are only available for local files.');
        }

        const probeRepo = this.repositories.repositoryForRoot(path.dirname(uri.fsPath));
        const root = path.normalize(await probeRepo.exec(['rev-parse', '--show-toplevel']));
        const activeRepo = this.repositories.currentRepository;
        if (activeRepo && path.normalize(activeRepo.cwd) === root) {
            return activeRepo;
        }
        return this.repositories.repositoryForRoot(root);
    }
}
