import * as fs from 'fs/promises';
import type { TextFileWriterPort } from '@application/ports/text-file-writer';

export class NodeTextFileWriter implements TextFileWriterPort {
    async writeTextFile(filePath: string, content: string): Promise<void> {
        await fs.writeFile(filePath, content);
    }
}
