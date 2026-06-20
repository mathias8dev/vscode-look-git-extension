import type { ClipboardPort } from '../../ports/clipboard';
import { CommitPatchDestination, type CommitPatchDestinationPickerPort } from '../../ports/commit-patch-destination';
import type { GitHistoryOperations } from '../../ports/git-capabilities';
import type { SaveFilePort } from '../../ports/save-file';
import type { TextFileWriterPort } from '../../ports/text-file-writer';
import { orderSelectedCommits } from './order-selected-commits';

export enum CreateCommitPatchResultKind {
    Cancelled,
    CopiedToClipboard,
    SavedToFile,
}

export interface CreateCommitPatchResult {
    readonly kind: CreateCommitPatchResultKind;
    readonly filePath?: string;
}

type PatchRepository = Pick<GitHistoryOperations, 'orderCommits' | 'getCommitPatch'> & { readonly cwd: string };

export class CreateCommitPatchUseCase {
    constructor(
        private readonly destinationPicker: CommitPatchDestinationPickerPort,
        private readonly saveFile: SaveFilePort,
        private readonly fileWriter: TextFileWriterPort,
        private readonly clipboard: ClipboardPort,
    ) {}

    async execute(repo: PatchRepository, hashes: readonly string[]): Promise<CreateCommitPatchResult> {
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
