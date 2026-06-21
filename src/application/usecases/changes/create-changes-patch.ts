import type { ClipboardPort } from '@application/ports/clipboard';
import { CommitPatchDestination, type CommitPatchDestinationPickerPort } from '@application/ports/commit-patch-destination';
import type { Worktree } from '@application/ports/git-topology';
import type { SaveFilePort } from '@application/ports/save-file';
import type { TextFileWriterPort } from '@application/ports/text-file-writer';

export enum CreateChangesPatchResultKind {
    Cancelled,
    CopiedToClipboard,
    SavedToFile,
}

export interface CreateChangesPatchInput {
    readonly stagedFilePaths: readonly string[];
    readonly unstagedFilePaths: readonly string[];
    readonly untrackedFilePaths: readonly string[];
}

export interface CreateChangesPatchResult {
    readonly kind: CreateChangesPatchResultKind;
    readonly filePath?: string;
}

export class CreateChangesPatchUseCase {
    constructor(
        private readonly destinationPicker: CommitPatchDestinationPickerPort,
        private readonly saveFile: SaveFilePort,
        private readonly fileWriter: TextFileWriterPort,
        private readonly clipboard: ClipboardPort,
    ) {}

    async execute(worktree: Worktree, input: CreateChangesPatchInput): Promise<CreateChangesPatchResult> {
        const destination = await this.destinationPicker.pickCommitPatchDestination();
        if (destination === undefined) { return { kind: CreateChangesPatchResultKind.Cancelled }; }
        const patch = await this.createPatch(worktree, input);
        if (!patch.trim()) { throw new Error('No selected changes can be exported as a patch.'); }
        if (destination === CommitPatchDestination.Clipboard) {
            await this.clipboard.writeText(patch);
            return { kind: CreateChangesPatchResultKind.CopiedToClipboard };
        }
        const filePath = await this.saveFile.showSaveFile({
            defaultDirectory: worktree.path,
            defaultFileName: 'selected-changes.patch',
            filters: { Patches: ['patch', 'diff'] },
        });
        if (!filePath) { return { kind: CreateChangesPatchResultKind.Cancelled }; }
        await this.fileWriter.writeTextFile(filePath, patch);
        return { kind: CreateChangesPatchResultKind.SavedToFile, filePath };
    }

    private async createPatch(worktree: Worktree, input: CreateChangesPatchInput): Promise<string> {
        const chunks: string[] = [];
        if (input.stagedFilePaths.length > 0) {
            chunks.push(await worktree.getIndexDiff(input.stagedFilePaths));
        }
        if (input.unstagedFilePaths.length > 0) {
            chunks.push(await worktree.getWorkingTreeDiff(input.unstagedFilePaths));
        }
        for (const filePath of input.untrackedFilePaths) {
            chunks.push(await worktree.getPatch('untracked', [filePath]));
        }
        return chunks.filter((chunk) => chunk.trim()).join('\n');
    }
}
