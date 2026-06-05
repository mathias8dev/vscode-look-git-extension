import type { GitRepository } from '../../ports/git-repository';
import type { ClipboardPort } from '../../ports/clipboard';
import { TextInputValidationSeverity, type TextInputPort, type TextInputValidationMessage } from '../../ports/text-input';
import {
    BranchNameInputValidationKind,
    branchNameInputValidation,
    normalizeValidBranchNameInput,
} from '../../../core/git/normalize-branch-name';

export class CommitReferenceActions {
    constructor(
        private readonly clipboard: ClipboardPort,
        private readonly textInput: TextInputPort,
    ) {}

    async copyRevisionNumber(hash: string): Promise<void> {
        await this.clipboard.writeText(hash);
    }

    async createBranchAtCommit(repo: GitRepository, hash: string): Promise<boolean> {
        const name = normalizeValidBranchNameInput(await this.textInput.showInput({
            prompt: 'New branch name:',
            validateInput: branchNameValidationMessage,
        }));
        if (!name) { return false; }
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

function branchNameValidationMessage(value: string): TextInputValidationMessage | undefined {
    const validation = branchNameInputValidation(value);
    if (!validation) { return undefined; }
    return {
        message: validation.message,
        severity: validation.kind === BranchNameInputValidationKind.Error
            ? TextInputValidationSeverity.Error
            : TextInputValidationSeverity.Info,
    };
}
