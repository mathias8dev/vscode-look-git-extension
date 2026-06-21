import type { ClipboardPort } from '@application/ports/clipboard';
import { CommitPatchDestination, type CommitPatchDestinationPickerPort } from '@application/ports/commit-patch-destination';
import type { GitRepository } from '@application/ports/git-topology';
import type { SaveFilePort } from '@application/ports/save-file';
import type { TextFileWriterPort } from '@application/ports/text-file-writer';
import { orderSelectedCommits } from '@application/usecases/commits/order-selected-commits';

export enum CreateCommitPatchResultKind {
    Cancelled,
    CopiedToClipboard,
    SavedToFile,
}

export interface CreateCommitPatchResult {
    readonly kind: CreateCommitPatchResultKind;
    readonly filePath?: string;
}


export class CreateCommitPatchUseCase {
    constructor(
        private readonly destinationPicker: CommitPatchDestinationPickerPort,
        private readonly saveFile: SaveFilePort,
        private readonly fileWriter: TextFileWriterPort,
        private readonly clipboard: ClipboardPort,
    ) {}

    async execute(repo: GitRepository, hashes: readonly string[]): Promise<CreateCommitPatchResult> {
        const destination = await this.destinationPicker.pickCommitPatchDestination();
        if (destination === undefined) { return { kind: CreateCommitPatchResultKind.Cancelled }; }
        const orderedHashes = await orderSelectedCommits(repo, hashes, 'oldestFirst');
        const firstHash = orderedHashes[0] ?? hashes[0] ?? 'commit';
        const patch = async () => {
            const chunks = await Promise.all(orderedHashes.map((hash) => repo.getCommitPatch(hash)));
            return chunks.join('\n');
        };
        if (destination === CommitPatchDestination.Clipboard) {
            await this.clipboard.writeText(await patch());
            return { kind: CreateCommitPatchResultKind.CopiedToClipboard };
        }
        const filePath = await this.saveFile.showSaveFile({
            defaultDirectory: repo.cwd,
            defaultFileName: `${firstHash.substring(0, 7)}.patch`,
            filters: { Patches: ['patch', 'diff'] },
        });
        if (!filePath) { return { kind: CreateCommitPatchResultKind.Cancelled }; }
        await this.fileWriter.writeTextFile(filePath, await patch());
        return { kind: CreateCommitPatchResultKind.SavedToFile, filePath };
    }
}
