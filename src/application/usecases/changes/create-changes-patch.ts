import type { ClipboardPort } from '../../ports/clipboard';
import { CommitPatchDestination, type CommitPatchDestinationPickerPort } from '../../ports/commit-patch-destination';
import type { GitRepository } from '../../ports/git-repository';
import type { SaveFilePort } from '../../ports/save-file';
import type { TextFileWriterPort } from '../../ports/text-file-writer';

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

    async execute(repo: GitRepository, input: CreateChangesPatchInput): Promise<CreateChangesPatchResult> {
        const destination = await this.destinationPicker.pickCommitPatchDestination();
        if (destination === undefined) { return { kind: CreateChangesPatchResultKind.Cancelled }; }
        const patch = await this.createPatch(repo, input);
        if (!patch.trim()) { throw new Error('No selected changes can be exported as a patch.'); }
        if (destination === CommitPatchDestination.Clipboard) {
            await this.clipboard.writeText(patch);
            return { kind: CreateChangesPatchResultKind.CopiedToClipboard };
        }
        const filePath = await this.saveFile.showSaveFile({
            defaultDirectory: repo.cwd,
            defaultFileName: 'selected-changes.patch',
            filters: { Patches: ['patch', 'diff'] },
        });
        if (!filePath) { return { kind: CreateChangesPatchResultKind.Cancelled }; }
        await this.fileWriter.writeTextFile(filePath, patch);
        return { kind: CreateChangesPatchResultKind.SavedToFile, filePath };
    }

    private async createPatch(repo: GitRepository, input: CreateChangesPatchInput): Promise<string> {
        const chunks: string[] = [];
        if (input.stagedFilePaths.length > 0) {
            chunks.push(await repo.execRaw(['diff', '--cached', '--binary', '--', ...input.stagedFilePaths]));
        }
        if (input.unstagedFilePaths.length > 0) {
            chunks.push(await repo.execRaw(['diff', '--binary', '--', ...input.unstagedFilePaths]));
        }
        for (const filePath of input.untrackedFilePaths) {
            chunks.push(await diffUntrackedFile(repo, filePath));
        }
        return chunks.filter((chunk) => chunk.trim()).join('\n');
    }
}

async function diffUntrackedFile(repo: GitRepository, filePath: string): Promise<string> {
    try {
        return await repo.execRaw(['diff', '--binary', '--no-index', '--', '/dev/null', filePath]);
    } catch (error) {
        const stdout = stdoutFromExecError(error);
        if (stdout !== undefined) { return stdout; }
        throw error;
    }
}

function stdoutFromExecError(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('stdout' in error)) { return undefined; }
    const stdout = (error as { readonly stdout?: unknown }).stdout;
    return typeof stdout === 'string' ? stdout : undefined;
}
