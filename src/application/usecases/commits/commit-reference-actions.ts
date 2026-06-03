import type { GitRepository } from '../../ports/git-repository';
import type { ClipboardPort } from '../../ports/clipboard';
import type { TextInputPort } from '../../ports/text-input';

export class CommitReferenceActions {
    constructor(
        private readonly clipboard: ClipboardPort,
        private readonly textInput: TextInputPort,
    ) {}

    async copyRevisionNumber(hash: string): Promise<void> {
        await this.clipboard.writeText(hash);
    }

    async createBranchAtCommit(repo: GitRepository, hash: string): Promise<boolean> {
        const name = await this.textInput.showInput({ prompt: 'New branch name:' });
        if (!name?.trim()) { return false; }
        await repo.exec(['branch', name, hash]);
        return true;
    }

    async createTagAtCommit(repo: GitRepository, hash: string): Promise<boolean> {
        const name = await this.textInput.showInput({ prompt: 'New tag name:' });
        if (!name?.trim()) { return false; }
        await repo.exec(['tag', name, hash]);
        return true;
    }
}
