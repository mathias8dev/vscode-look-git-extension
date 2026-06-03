import type { GitRepository } from '../../ports/git-repository';
import type { SaveFilePort } from '../../ports/save-file';
import type { TextFileWriterPort } from '../../ports/text-file-writer';
import { orderSelectedCommits } from './order-selected-commits';

export class CreateCommitPatchUseCase {
    constructor(
        private readonly saveFile: SaveFilePort,
        private readonly fileWriter: TextFileWriterPort,
    ) {}

    async execute(repo: GitRepository, hashes: readonly string[]): Promise<void> {
        const orderedHashes = await orderSelectedCommits(repo, hashes, 'oldestFirst');
        const firstHash = orderedHashes[0] ?? hashes[0] ?? 'commit';
        const filePath = await this.saveFile.showSaveFile({
            defaultDirectory: repo.cwd,
            defaultFileName: `${firstHash.substring(0, 7)}.patch`,
            filters: { Patches: ['patch', 'diff'] },
        });
        if (!filePath) { return; }
        const chunks = await Promise.all(orderedHashes.map((hash) => repo.execRaw(['format-patch', '-1', '--stdout', hash])));
        await this.fileWriter.writeTextFile(filePath, chunks.join('\n'));
    }
}
